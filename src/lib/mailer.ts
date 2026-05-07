import nodemailer, { type Transporter } from 'nodemailer'

// Falls back to logging the email body to stdout when SMTP_* env vars are unset.
// That keeps slice 1E iterable without needing real SMTP credentials — copy the
// token from the log to manually exercise verify-email / reset-password flows.

let cachedTransporter: Transporter | null | undefined

function getTransporter(): Transporter | null {
  if (cachedTransporter !== undefined) return cachedTransporter
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) {
    cachedTransporter = null
    return null
  }
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10)
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return cachedTransporter
}

const FROM = process.env.EMAIL_FROM ?? 'noreply@sandeshak.app'

export interface EmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.log(`[mailer] (no SMTP configured) — would send to ${opts.to}`)
    console.log(`[mailer] Subject: ${opts.subject}`)
    console.log(`[mailer] Body:\n${opts.text}`)
    return
  }
  await transporter.sendMail({ from: FROM, ...opts })
}
