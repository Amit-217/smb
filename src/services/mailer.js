import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter;

export async function sendMail({ to, subject, text }) {
  if (!config.mail.host) throw new Error('MAIL_HOST is not configured');
  transporter ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass },
  });
  await transporter.sendMail({ from: config.mail.from, to, subject, text });
}
