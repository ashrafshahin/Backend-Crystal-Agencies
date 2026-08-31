import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export const EMAIL_TEMPLATE_NAMES = {
  WELCOME: 'welcome',
  ORDER_CONFIRMATION: 'order-confirmation',
  QUOTATION_SENT: 'quotation-sent',
  ORDER_STATUS_UPDATE: 'order-status-update',
  PASSWORD_RESET: 'password-reset',
  EMAIL_VERIFICATION: 'email-verification',
} as const;

export type EmailTemplateName =
  (typeof EMAIL_TEMPLATE_NAMES)[keyof typeof EMAIL_TEMPLATE_NAMES];

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
};

function readEmailConfig(): EmailConfig {
  let host = process.env.SMTP_HOST ?? '';
  const portStr = process.env.SMTP_PORT ?? '587';
  let port = Number.parseInt(portStr, 10);
  let secureEnv = (process.env.SMTP_SECURE ?? 'false').toLowerCase();
  let secure =
    secureEnv === 'true' || secureEnv === '1' || secureEnv === 'yes';
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';
  const from =
    process.env.MAIL_FROM_ADDRESS ??
    (user && user.includes('@') ? user : 'no-reply@crystalagencies.example');
  const fromName = process.env.MAIL_FROM_NAME ?? 'Crystal Agencies';

  if (host) {
    const normalized = host.trim().toLowerCase();
    if (normalized === 'gmail.com' && user.trim().toLowerCase().endsWith('@gmail.com')) {
      // eslint-disable-next-line no-console
      console.warn(
        `[EMAIL::CONFIG] SMTP_HOST="gmail.com" is not a valid Gmail SMTP submission host. ` +
          `Auto-correcting to "smtp.gmail.com" (port 465, secure=true). ` +
          `For Gmail you MUST set SMTP_PASS to a Google App Password (NOT your Gmail password).`,
      );
      host = 'smtp.gmail.com';
      port = 465;
      secure = true;
    }
    if (normalized === 'smtp.gmail.com') {
      if (!Number.isFinite(port) || port < 1) port = 465;
      if (port === 465) secure = true;
      if (port === 587 && !secure) {
        // leave STARTTLS handling to nodemailer default for port 587
      }
    }
  }

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    pass,
    from,
    fromName,
  };
}

export const emailConfig: EmailConfig = readEmailConfig();

// #region debug-point H1:config-load
(()=>{const fs=require('fs'),p='.dbg/verification-email-not-received.env';let u='http://127.0.0.1:7778/event',s='verification-email-not-received';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre',hypothesisId:'H1',location:'emailConfig.ts:toplevel',msg:'[DEBUG] H1 emailConfig loaded (import-time)',data:{smtpHostSet:Boolean(emailConfig.host&&emailConfig.host.length>0),smtpUserSet:Boolean(emailConfig.user&&emailConfig.user.length>0),smtpPassSet:Boolean(emailConfig.pass&&emailConfig.pass.length>0),smtpPort:emailConfig.port,smtpSecure:emailConfig.secure,fromAddress:emailConfig.from,fromName:emailConfig.fromName,configured:Boolean(emailConfig.host&&emailConfig.host.length>0 && emailConfig.user&&emailConfig.user.length>0 && emailConfig.pass&&emailConfig.pass.length>0)},ts:Date.now()})}).catch(()=>{})})();
// #endregion

let cachedTransporter: Transporter | null = null;
let simulateMode = false;

export function isEmailConfigured(): boolean {
  const { host, user, pass } = emailConfig;
  return Boolean(host && host.length > 0 && user && user.length > 0 && pass && pass.length > 0);
}

export function getMailer(): Transporter {
  if (!cachedTransporter) {
    const configured = isEmailConfigured();
    if (!configured) {
      simulateMode = true;
      const streamTransport = require('nodemailer/lib/stream-transport');
      cachedTransporter = nodemailer.createTransport(
        new streamTransport({ buffer: true }),
      ) as unknown as Transporter;
    } else {
      const tlsOpts: Record<string, unknown> = {
        rejectUnauthorized: emailConfig.secure,
        servername: emailConfig.host,
      };
      cachedTransporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth:
          emailConfig.user && emailConfig.pass
            ? { user: emailConfig.user, pass: emailConfig.pass }
            : undefined,
        connectionTimeout: 30_000,
        greetingTimeout: 15_000,
        socketTimeout: 45_000,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        requireTLS: emailConfig.port === 587 ? true : undefined,
        tls: tlsOpts,
      });
    }
  }
  return cachedTransporter;
}

export function isSimulateMode(): boolean {
  if (cachedTransporter === null) {
    getMailer();
  }
  return simulateMode;
}

export function buildFromAddress(): string {
  const name = emailConfig.fromName
    ? `"${emailConfig.fromName.replace(/"/g, '')}" `
    : '';
  return `${name}<${emailConfig.from}>`;
}

export async function verifyMailer(): Promise<{ ok: boolean; simulate: boolean; error?: string }> {
  const configured = isEmailConfigured();
  if (!configured) {
    return { ok: true, simulate: true };
  }
  try {
    const transporter = getMailer();
    await transporter.verify();
    return { ok: true, simulate: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, simulate: false, error: msg };
  }
}
