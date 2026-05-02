import type { DeliveryAdapter, EmailPayload } from "./index"

/**
 * Sends email via SendGrid.
 *
 * Required env variables:
 *   SENDGRID_API_KEY   your SendGrid API key (starts with SG.)
 *   SMTP_FROM          verified sender address in your SendGrid account
 */
export class SendGridAdapter implements DeliveryAdapter {
  private apiKey: string
  private from: string

  constructor() {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error("SENDGRID_API_KEY is required when PROVIDER=sendgrid")
    }
    this.apiKey = process.env.SENDGRID_API_KEY
    this.from = process.env.SMTP_FROM ?? "noreply@example.com"
  }

  async send(payload: EmailPayload): Promise<void> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: this.from },
        subject: payload.subject,
        content: [
          { type: "text/plain", value: payload.text },
          { type: "text/html",  value: payload.html  },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`SendGrid error ${res.status}: ${JSON.stringify(err)}`)
    }
  }
}