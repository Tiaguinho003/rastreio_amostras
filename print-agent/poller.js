import * as log from './logger.js';
import { ensureAuthenticated, getAuthHeaders, clearSession, login } from './auth.js';
import { sendToPrinter } from './printer.js';
import { buildLabel } from './label.js';

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

async function reportSuccess(config, job) {
  const body = {
    printAction: job.printAction,
    attemptNumber: job.attemptNumber,
    printerId: config.printerId,
  };

  if (job.printAction === 'PRINT') {
    body.expectedVersion = job.sample.version;
  }

  const res = await fetch(`${config.backendUrl}/api/v1/samples/${job.sampleId}/qr/printed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.warn(`Falha ao reportar sucesso para ${job.sample.internalLotNumber}: HTTP ${res.status} ${text}`);
  }
}

async function reportFailure(config, job, errorMessage) {
  const body = {
    printAction: job.printAction,
    attemptNumber: job.attemptNumber,
    printerId: config.printerId,
    error: errorMessage,
  };

  const res = await fetch(`${config.backendUrl}/api/v1/samples/${job.sampleId}/qr/print/failed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.warn(`Falha ao reportar erro para ${job.sample.internalLotNumber}: HTTP ${res.status} ${text}`);
  }
}

async function processJob(config, job) {
  const lotId = job.sample.internalLotNumber || job.sampleId.slice(0, 8);
  log.info(`[${lotId}] Imprimindo etiqueta (${job.printAction} #${job.attemptNumber})...`);

  const tspl = buildLabel(job);
  log.debug(`[${lotId}] TSPL:\n${tspl}`);

  try {
    await sendToPrinter(config.printerName, null, tspl);
    log.info(`[${lotId}] Impressao enviada com sucesso`);
    await reportSuccess(config, job);
  } catch (err) {
    log.error(`[${lotId}] Falha na impressao: ${err.message}`);
    await reportFailure(config, job, err.message);
  }
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
