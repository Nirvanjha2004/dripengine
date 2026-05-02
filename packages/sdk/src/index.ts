import type {
  DripEngineOptions,
  EnrollOptions,
  EnrollResponse,
  UnenrollOptions,
  UnenrollResponse,
  EventOptions,
  EventResponse,
} from "./types"

export * from "./types"

export class DripEngine {
  private apiKey: string
  private baseUrl: string

  constructor(options: DripEngineOptions) {
    if (!options.apiKey) {
      throw new Error("DripEngine: apiKey is required.")
    }
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? "http://localhost:8000").replace(/\/$/, "")
  }

  /**
   * Internal fetch wrapper.
   *
   * - Attaches the Authorization header automatically
   * - Throws a readable error if the response is not OK
   * - Returns parsed JSON
   */
  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      let detail = res.statusText
      try {
        const err = await res.json()
        detail = err.detail ?? detail
      } catch {}
      throw new Error(`DripEngine [${res.status}] ${path}: ${detail}`)
    }

    return res.json() as Promise<T>
  }

  /**
   * Enroll a contact into a sequence.
   *
   * @example
   * await drip.enroll({
   *   sequenceId: "onboarding",
   *   contact: {
   *     email: "john@gmail.com",
   *     name: "John",
   *     timezone: "Asia/Kolkata",
   *     properties: { plan: "free" }
   *   }
   * })
   */
  async enroll(options: EnrollOptions): Promise<EnrollResponse> {
    return this.request<EnrollResponse>("/enroll", {
      sequence_id: options.sequenceId,
      contact: {
        email: options.contact.email,
        name: options.contact.name ?? null,
        timezone: options.contact.timezone ?? "UTC",
        properties: options.contact.properties ?? {},
      },
    })
  }

  /**
   * Fire an event for a contact.
   * The engine will log it and cancel any pending steps
   * that were gated on this event not having fired.
   *
   * @example
   * await drip.event({
   *   eventName: "user.completed_profile",
   *   email: "john@gmail.com"
   * })
   */
  async event(options: EventOptions): Promise<EventResponse> {
    return this.request<EventResponse>("/event", {
      event_name: options.eventName,
      email: options.email,
      properties: options.properties ?? {},
    })
  }

  /**
   * Remove a contact from a sequence.
   * Cancels all pending emails and marks enrollment as unenrolled.
   *
   * @example
   * await drip.unenroll({
   *   sequenceId: "onboarding",
   *   email: "john@gmail.com"
   * })
   */
  async unenroll(options: UnenrollOptions): Promise<UnenrollResponse> {
    return this.request<UnenrollResponse>("/unenroll", {
      sequence_id: options.sequenceId,
      email: options.email,
    })
  }
}