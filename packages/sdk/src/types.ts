export interface Contact {
  email: string
  name?: string
  timezone?: string
  properties?: Record<string, unknown>
}

export interface EnrollOptions {
  sequenceId: string
  contact: Contact
}

export interface UnenrollOptions {
  sequenceId: string
  email: string
}

export interface EventOptions {
  eventName: string
  email: string
  properties?: Record<string, unknown>
}

export interface DripEngineOptions {
  /**
   * Your API key — set in .env as API_SECRET_KEY.
   * Self-hosted: grab it from your .env file.
   * Cloud: grab it from your dashboard.
   */
  apiKey: string

  /**
   * Base URL of your DripEngine API.
   * Defaults to http://localhost:8000 for local development.
   * Change to your deployed URL in production.
   */
  baseUrl?: string
}

// --- Response types ---

export interface EnrollResponse {
  enrolled: boolean
  email: string
  sequence_id: string
  steps_queued: number
  steps: Array<{
    step_id: string
    delay_seconds: number
    job_id: string
  }>
}

export interface EventResponse {
  logged: boolean
  email: string
  event_name: string
  fired_at: string
  total_cancelled: number
  sequences_affected: Array<{
    sequence_id: string
    steps_cancelled: string[]
  }>
}

export interface UnenrollResponse {
  unenrolled: boolean
  email: string
  sequence_id: string
  unenrolled_at: string
  jobs_cancelled: number
}