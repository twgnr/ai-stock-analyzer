import nodemailer from "nodemailer";

interface MailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendMail({ to, subject, text, html }: MailArgs): Promise<{ sent: boolean; fallback?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    const banner = "=".repeat(60);
    console.log(`\n${banner}\n[EMAIL FALLBACK] SMTP nicht konfiguriert`);
    console.log(`An: ${to}`);
    console.log(`Betreff: ${subject}`);
    console.log(`Inhalt:\n${text}`);
    console.log(banner);
    return { sent: false, fallback: text };
  }
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@ai-stock-analyzer.local";
    await transporter.sendMail({ from, to, subject, text, html: html || text });
    return { sent: true };
  } catch (e) {
    console.error("[email] Versand fehlgeschlagen:", e instanceof Error ? e.message : e);
    return { sent: false };
  }
}
