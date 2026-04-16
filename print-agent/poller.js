import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as log from './logger.js';
import { ensureAuthenticated, getAuthHeaders, clearSession, login } from './auth.js';
import { sendToPrinter } from './printer.js';
import { buildLabel } from './label.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRINTED_JOBS_FILE = join(__dirname, '.printed-jobs.json');
const PRINTED_JOBS_MAX = 500;

function loadPrintedJobs() {
  if (!existsSync(PRINTED_JOBS_FILE)) return new Set();
  try {
    const raw = readFileSync(PRINTED_JOBS_FILE, 'utf-8');
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistPrintedJobs() {
  try {
    if (printedJobIds.size > PRINTED_JOBS_MAX) {
      const trimmed = Array.from(printedJobIds).slice(-PRINTED_JOBS_MAX);
      printedJobIds.clear();
      for (const id of trimmed) printedJobIds.add(id);
    }
    writeFileSync(PRINTED_JOBS_FILE, JSON.stringify(Array.from(printedJobIds)));
  } catch (err) {
    log.warn(`Falha ao persistir printed-jobs: ${err.message}`);
  }
}

const printedJobIds = loadPrintedJobs();

async function fetchPendingJobs(config) {
  const res = await fetch(`${config.backendUrl}/api/v1/print-queue/pending?limit=10`, {
    headers: { ...getAuthHeaders() },
  });

  if (res.status === 401) {
    log.warn('Sessao expirada, re-autenticando...');
    clearSession();
    await login(config);
    const retry = await fetch(`${config.backendUrl}/api/v1/print-queue/pending?limit=10`, {
      headers: { ...getAuthHeaders() },
    });
    if (!retry.ok) throw new Error(`Falha ao buscar jobs (HTTP ${retry.status})`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`Falha ao buscar jobs (HTTP ${res.status})`);
  return res.json();
}

async function fetchCurrentSampleVersion(config, sampleId) {
  try {
    const res = await fetch(`${config.backendUrl}/api/v1/samples/${sampleId}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sample?.version ?? null;
  } catch {
    return null;
  }
}

async function reportSuccess(config, job) {
  const lotId = job.sample.internalLotNumber || job.sampleId.slice(0, 8);
  let currentVersion = job.sample.version;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${config.backendUrl}/api/v1/samples/${job.sampleId}/qr/printed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          printAction: job.printAction,
          attemptNumber: job.attemptNumber,
          printerId: config.printerId,
          expectedVersion: currentVersion,
        }),
      });

      if (res.ok) {
        printedJobIds.delete(job.jobId);
        persistPrintedJobs();
        return;
      }

      if (res.status === 409) {
        log.warn(
          `[${lotId}] Conflito de versao (tentativa ${attempt}/${maxAttempts}). Buscando versao atual...`
        );
        const freshVersion = await fetchCurrentSampleVersion(config, job.sampleId);
        if (freshVersion !== null && freshVersion !== currentVersion) {
          currentVersion = freshVersion;
          log.info(`[${lotId}] Versao atualizada para ${currentVersion}. Retentando report...`);
          continue;
        }
        // Versão não mudou ou não conseguiu buscar — manter no cache para não reimprimir
        log.warn(`[${lotId}] Nao foi possivel resolver conflito de versao. Job mantido no cache.`);
        return;
      }

      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text}`);
    } catch (err) {
      if (attempt < maxAttempts) {
        const delay = 2000 * attempt;
        log.warn(
          `[${lotId}] Falha ao reportar sucesso (${attempt}/${maxAttempts}): ${err.message}. Retry em ${delay}ms...`
        );
        await sleep(delay);
      } else {
        log.error(
          `[${lotId}] ATENCAO: Etiqueta foi impressa mas o backend NAO confirmou apos ${maxAttempts} tentativas.`
        );
        log.error(
          `[${lotId}] O job sera ignorado ate o proximo reinicio do agente. Verifique a conexao.`
        );
      }
    }
  }
}

async function reportFailure(config, job, errorMessage) {
  const lotId = job.sample.internalLotNumber || job.sampleId.slice(0, 8);
  const body = {
    printAction: job.printAction,
    attemptNumber: job.attemptNumber,
    printerId: config.printerId,
    error: errorMessage,
  };

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(
        `${config.backendUrl}/api/v1/samples/${job.sampleId}/qr/print/failed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(body),
        }
      );

      if (res.ok || res.status === 409) return;

      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text}`);
    } catch (err) {
      if (attempt < maxAttempts) {
        await sleep(2000);
      } else {
        log.warn(
          `[${lotId}] Nao foi possivel reportar falha ao backend. O job sera retentado na proxima poll.`
        );
      }
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processJob(config, job) {
  const lotId = job.sample.internalLotNumber || job.sampleId.slice(0, 8);

  if (printedJobIds.has(job.jobId)) {
    log.info(`[${lotId}] Job ja impresso nesta sessao. Retentando report ao backend...`);
    await reportSuccess(config, job);
    return;
  }

  log.info(`[${lotId}] Imprimindo etiqueta (${job.printAction} #${job.attemptNumber})...`);

  const tspl = buildLabel(job);
  log.debug(`[${lotId}] TSPL gerado: ${tspl.length} bytes (jobId=${job.jobId})`);

  const maxRetries = config.printRetryCount;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendToPrinter(config.printerName, null, tspl);
      log.info(`[${lotId}] Impressao enviada com sucesso`);
      printedJobIds.add(job.jobId);
      persistPrintedJobs();
      await reportSuccess(config, job);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = config.printRetryDelayMs * Math.pow(2, attempt - 1);
        log.warn(
          `[${lotId}] Tentativa ${attempt}/${maxRetries} falhou: ${err.message}. Retry em ${delayMs}ms...`
        );
        await sleep(delayMs);
      }
    }
  }

  log.error(`[${lotId}] Falha na impressao apos ${maxRetries} tentativa(s): ${lastError.message}`);
  await reportFailure(config, job, lastError.message);
}

export async function pollCycle(config) {
  await ensureAuthenticated(config);

  const data = await fetchPendingJobs(config);
  const jobs = data.items || [];

  if (jobs.length === 0) {
    log.debug('Nenhum job pendente');
    return;
  }

  log.info(`${jobs.length} job(s) pendente(s)`);

  for (const job of jobs) {
    await processJob(config, job);
  }
}

export async function startPolling(config) {
  let backoffMs = config.pollIntervalMs;
  let running = true;

  function stop() {
    running = false;
  }

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log.info(`Polling iniciado (intervalo: ${config.pollIntervalMs}ms)`);

  while (running) {
    try {
      await pollCycle(config);
      backoffMs = config.pollIntervalMs;
    } catch (err) {
      log.error(`Erro no ciclo de polling: ${err.message}`);
      backoffMs = Math.min(backoffMs * 2, 60000);
      log.warn(`Proximo retry em ${backoffMs}ms`);
    }

    if (running) {
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  log.info('Polling encerrado');
}
