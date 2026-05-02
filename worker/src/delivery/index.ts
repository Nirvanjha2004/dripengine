/**
 * Every delivery adapter implements this interface.
 * The processor calls adapter.send() without caring which
 * provider is underneath.
 *
 * Adding a new provider = create a new file implementing this interface.
 */
export interface EmailPayload {
  to: string
  subject: string
  html: string
  text: string
}

export interface DeliveryAdapter {
  send(payload: EmailPayload): Promise<void>
}

/**
 * Returns the correct adapter based on the PROVIDER env variable.
 * Defaults to nodemailer (SMTP) if not set.
 */
export async function getAdapter(): Promise<DeliveryAdapter> {
  const provider = process.env.PROVIDER ?? "nodemailer"

  switch (provider) {
    case "resend": {
      const { ResendAdapter } = await import("./resend")
      return new ResendAdapter()
    }
    case "sendgrid": {
      const { SendGridAdapter } = await import("./sendgrid")
      return new SendGridAdapter()
    }
    case "nodemailer":
    default: {
      const { NodemailerAdapter } = await import("./nodemailer")
      return new NodemailerAdapter()
    }
  }
}