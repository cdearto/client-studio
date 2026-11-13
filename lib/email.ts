// Email delivery. With SMTP_URL set (any provider: Postmark, SES, Mailgun,
// Gmail…) mail goes out over SMTP; without it, it's appended to
// data/outbox.log so development never sends real email.
import { appendFileSync, mkdirSync } from 'node:fs';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config.ts';

export type Email = {
  to: string; subject: string; text: string; html?: string;
  replyTo?: string; fromName?: string; headers?: Record<string, string>;
};

let transport: Transporter | undefined;

export async function sendEmail(mail: Email): Promise<boolean> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.to)) return false;
  const message = {
    from: { name: mail.fromName ?? config.businessName, address: config.fromEmail },
    to: mail.to, subject: mail.subject.replace(/[\r\n]+/g, ' '), text: mail.text, html: mail.html,
    replyTo: mail.replyTo ?? config.notifyEmail, headers: mail.headers,
  };
  if (!config.smtpUrl) {
    mkdirSync(config.dataDir, { recursive: true });
    appendFileSync(`${config.dataDir}/outbox.log`, `--- ${new Date().toISOString()}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n\n`);
    return true;
  }
  try {
    transport ??= nodemailer.createTransport(config.smtpUrl);
    await transport.sendMail(message);
    return true;
  } catch (e) {
    console.error('Email failed:', e);
    return false;
  }
}
