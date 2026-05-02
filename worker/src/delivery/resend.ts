import type { DeliveryAdapter, EmailPayload } from "./index"

/**
 * Sends email via Resend (https://resend.com).
 * Great for developers — generous free tier, excellent deliverability.
 *
 * Required env variables:
 *   RESEND_API_KEY   your Resend API key (starts with re_)
 *   SMTP_FROM        the From address (must be a verified domain in Resend)
 */
export class ResendAdapter implements DeliveryAdapter {
  private apiKey: string
  private from: string

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is required when PROVIDER=resend")
    }
    this.apiKey = process.env.RESEND_API_KEY
    this.from = process.env.SMTP_FROM ?? "noreply@example.com"
  }

  async send(payload: EmailPayload): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`)
    }
  }
}