import nodemailer from "nodemailer"
import type { DeliveryAdapter, EmailPayload } from "./index"

/**
 * Sends email via any SMTP server.
 * Works with Gmail, Mailgun SMTP, your own mail server, anything.
 *
 * Required env variables:
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   e.g. 587
 *   SMTP_USER   your email address
 *   SMTP_PASS   your app password (not your real password)
 *   SMTP_FROM   the From address shown to recipients
 */
export class NodemailerAdapter implements DeliveryAdapter {
  private transporter: nodemailer.Transporter

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }

  async send(payload: EmailPayload): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    })
  }
}