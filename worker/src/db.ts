import { Pool } from "pg"
import * as dotenv from "dotenv"

dotenv.config()

/**
 * Shared Postgres pool for the worker process.
 * Same database as the API — worker reads from it, never writes sequences.
 * It only writes delivery event logs.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
})

export default pool

// ─── Queries the worker actually needs ───────────────────────────────────────

/**
 * Fetch a contact's stored properties and timezone.
 * Used by the condition evaluator to check property-based conditions.
 * e.g.  condition: { property: "plan", equals: "free" }
 */
export async function getContact(email: string) {
  const result = await pool.query(
    `SELECT email, name, timezone, properties
     FROM contacts
     WHERE email = $1`,
    [email]
  )
  return result.rows[0] ?? null
}

/**
 * Check if a specific event has ever been fired for a contact.
 * Used by the condition evaluator for event_not_fired conditions.
 * e.g.  condition: { event_not_fired: "user.completed_profile" }
 */
export async function hasEventFired(
  email: string,
  eventName: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM contact_events
     WHERE email = $1 AND event_name = $2
     LIMIT 1`,
    [email, eventName]
  )
  return result.rows.length > 0
}

/**
 * Check if a contact is still actively enrolled in a sequence.
 * If they unenrolled between job enqueue and job fire time,
 * we skip the email even if the job somehow slipped through cancellation.
 */
export async function isEnrolled(
  email: string,
  sequenceId: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM enrollments
     WHERE email = $1
       AND sequence_id = $2
       AND status = 'active'
     LIMIT 1`,
    [email, sequenceId]
  )
  return result.rows.length > 0
}

/**
 * Update the current_step column on the enrollment record.
 * Gives us a live view of where each contact is in a sequence —
 * useful for the dashboard contact timeline.
 */
export async function updateCurrentStep(
  email: string,
  sequenceId: string,
  stepId: string
) {
  await pool.query(
    `UPDATE enrollments
     SET current_step = $1
     WHERE email = $2 AND sequence_id = $3`,
    [stepId, email, sequenceId]
  )
}

/**
 * Log a delivery event to Postgres.
 * status is one of: sent | skipped | failed
 * This powers the contact timeline in the dashboard.
 */
export async function logDeliveryEvent(opts: {
  email: string
  sequenceId: string
  stepId: string
  status: "sent" | "skipped" | "failed"
  reason?: string
}) {
  await pool.query(
    `INSERT INTO delivery_events
       (email, sequence_id, step_id, status, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      opts.email,
      opts.sequenceId,
      opts.stepId,
      opts.status,
      opts.reason ?? null,
    ]
  )
}

/**
 * Creates the delivery_events table if it doesn't exist.
 * Called once on worker startup.
 */
export async function initWorkerDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS delivery_events (
      id          SERIAL PRIMARY KEY,
      email       TEXT NOT NULL,
      sequence_id TEXT NOT NULL,
      step_id     TEXT NOT NULL,
      status      TEXT NOT NULL,
      reason      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_events_email
      ON delivery_events (email, sequence_id);
  `)
}