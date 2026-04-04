import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { renderEmailHtml } from './email-html-template.js';

function isProductionEnv() {
  return (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production';
}

function readRequiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function readOptionalEnv(name, fallback = null) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function readBooleanEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be boolean`);
}

class LocalOutboxEmailService {
  constructor({ from, outboxDir }) {
    this.from = from;
    this.outboxDir = outboxDir;
  }

  async sendMail({ to, subject, text, html }) {
    await fs.mkdir(this.outboxDir, { recursive: true });
    const filePath = path.join(this.outboxDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          from: this.from,
          to,
          subject,
          text,
          html: html ?? null,
          createdAt: new Date().toISOString()
        },
        null,
        2
      ),
      'utf8'
    );

    return { id: filePath };
  }
}

class SmtpEmailService {
  constructor({ from, transport }) {
    this.from = from;
    this.transport = transport;
  }

  async sendMail({ to, subject, text, html }) {
    const info = await this.transport.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html: html ?? undefined
    });

    return { id: info.messageId ?? null };
  }
}

function buildTransport() {
  const configured = readOptionalEnv('EMAIL_TRANSPORT', null);
  if (configured) {
    return configured.toLowerCase();
  }

  return isProductionEnv() ? 'smtp' : 'outbox';
}

function createSmtpService() {
  const host = readRequiredEnv('SMTP_HOST');
  const port = Number(readRequiredEnv('SMTP_PORT'));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a positive integer');
  }

  const secure = readBooleanEnv('SMTP_SECURE', port === 465);
  const user = readOptionalEnv('SMTP_USER', null);
  const pass = readOptionalEnv('SMTP_PASS', null);
  const from = readRequiredEnv('SMTP_FROM');

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user || pass ? { user, pass } : undefined
  });

  return new SmtpEmailService({
    from,
    transport
  });
}

function createOutboxService() {
  const outboxDir = readOptionalEnv('EMAIL_OUTBOX_DIR', './data/email-outbox');
  const from = readOptionalEnv('EMAIL_OUTBOX_FROM', 'rastreio@safras.local');
  return new LocalOutboxEmailService({ from, outboxDir });
}

export function createEmailServiceFromEnv() {
  const transport = buildTransport();
  if (transport === 'smtp') {
    return createSmtpService();
  }

  if (transport === 'outbox') {
    return createOutboxService();
  }

  throw new Error('EMAIL_TRANSPORT must be smtp or outbox');
}

function buildGreeting(fullName) {
  return `Ola${fullName ? `, ${fullName}` : ''}.`;
}

export class AppEmailService {
  constructor(delegate) {
    this.delegate = delegate;
  }

  async sendUserCreated({ to, fullName, username, password }) {
    const subject = 'Sua conta foi criada';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nSua conta no sistema foi criada.\nUsuario: ${username}\nSenha inicial: ${password}\n\nAo entrar, voce podera manter ou alterar essa senha.\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: [`Sua conta no sistema foi criada com o usuario ${username}.`, 'Ao entrar, voce podera manter ou alterar essa senha.'],
      highlight: { label: 'Senha inicial', value: password }
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendPasswordResetByAdmin({ to, fullName, username, password }) {
    const subject = 'Sua senha foi redefinida';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nSua senha foi redefinida por um administrador.\nUsuario: ${username}\nNova senha: ${password}\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: [`Sua senha foi redefinida por um administrador. Seu usuario e ${username}.`],
      highlight: { label: 'Nova senha', value: password }
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendPasswordResetCode({ to, fullName, code }) {
    const subject = 'Codigo para redefinir sua senha';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nSeu codigo para redefinicao de senha e: ${code}\nValidade: 15 minutos.\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: ['Use o codigo abaixo para redefinir sua senha. Ele expira em 15 minutos.'],
      highlight: { label: 'Codigo', value: code }
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendUserReactivated({ to, fullName }) {
    const subject = 'Sua conta foi reativada';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nSua conta foi reativada e o acesso ao sistema esta disponivel novamente.\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: ['Sua conta foi reativada e o acesso ao sistema esta disponivel novamente.']
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendUserInactivated({ to, fullName }) {
    const subject = 'Sua conta foi inativada';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nSua conta foi inativada. Para mais informacoes, fale com um administrador.\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: ['Sua conta foi inativada. Para mais informacoes, fale com um administrador.']
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendPasswordChangedNotice({ to, fullName }) {
    const subject = 'Sua senha foi alterada';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nRecebemos uma alteracao de senha na sua conta.\nSe nao foi voce, fale com um administrador imediatamente.\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: ['Recebemos uma alteracao de senha na sua conta.'],
      footerNote: 'Se nao foi voce, fale com um administrador imediatamente.'
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendUsernameChangedNotice({ to, fullName, username }) {
    const subject = 'Seu usuario foi alterado';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nSeu nome de usuario foi alterado.\nNovo usuario: ${username}\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: ['Seu nome de usuario foi alterado.'],
      highlight: { label: 'Novo usuario', value: username }
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendEmailChangeOldEmailNotice({ to, fullName, newEmail }) {
    const subject = 'Solicitacao de troca de email';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nFoi solicitada a troca do email da sua conta para: ${newEmail}\nSe essa alteracao nao foi esperada, fale com um administrador.\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: [`Foi solicitada a troca do email da sua conta para: ${newEmail}`],
      footerNote: 'Se essa alteracao nao foi esperada, fale com um administrador.'
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }

  async sendEmailChangeCode({ to, fullName, code, newEmail }) {
    const subject = 'Confirme seu novo email';
    const greeting = buildGreeting(fullName);
    const text = `${greeting}\n\nUse o codigo ${code} para confirmar o novo email ${newEmail}.\nValidade: 15 minutos.\n`;
    const html = renderEmailHtml({
      subject,
      greeting,
      bodyLines: [`Use o codigo abaixo para confirmar o novo email ${newEmail}. Ele expira em 15 minutos.`],
      highlight: { label: 'Codigo', value: code }
    });
    return this.delegate.sendMail({ to, subject, text, html });
  }
}

export function createAppEmailServiceFromEnv() {
  return new AppEmailService(createEmailServiceFromEnv());
}
