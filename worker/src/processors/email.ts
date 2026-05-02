import { Job } from "bullmq"
import { evaluateCondition } from "../conditionEvaluator"
import { loadSequence, findStep } from "../sequenceLoader"
import { renderTemplate } from "../templateRenderer"
import { getAdapter } from "../delivery/index"
import {
  isEnrolled,
  updateCurrentStep,
  logDeliveryEvent,
} from "../db"

/**
 * Shape of the data stored inside every BullMQ job.
 * This is what the API's producer.py wrote into Redis.
 */
interface JobData {
  sequence_id: string
  email: string
  step_id: string
  contact_properties: Record<string, unknown>
  timezone: string
  enqueued_at: number
}

/**
 * processEmailJob — called by BullMQ for every job that fires.
 *
 * This is the heart of the worker. Full flow:
 *
 * 1. Parse the job data
 * 2. Load the sequence YAML — find the specific step
 * 3. Check the contact is still enrolled
 *    (they may have unenrolled after this job was enqueued)
 * 4. Run the condition evaluator against their CURRENT state
 *    (properties may have changed since enqueue time)
 * 5. If condition passes → render the template → send via delivery adapter
 * 6. Log the result (sent / skipped / failed) to Postgres
 * 7. Update current_step on the enrollment record
 *
 * If this function throws, BullMQ automatically retries it
 * with exponential backoff (configured in index.ts).
 * After max retries, it moves to the dead-letter queue.
 */
export async function processEmailJob(job: Job<JobData>): Promise<void> {
  const { sequence_id, email, step_id, contact_properties, timezone } = job.data

  console.log(`[worker] Processing job ${job.id} — ${sequence_id}/${step_id} → ${email}`)

  // --- 1. Load sequence and find the step ---
  const sequence = loadSequence(sequence_id)
  if (!sequence) {
    // Sequence YAML was deleted after this job was enqueued
    // Log and move on — don't retry, it won't self-fix
    await logDeliveryEvent({
      email,
      sequenceId: sequence_id,
      stepId: step_id,
      status: "skipped",
      reason: `sequence '${sequence_id}' not found`,
    })
    return
  }

  const step = findStep(sequence, step_id)
  if (!step) {
    await logDeliveryEvent({
      email,
      sequenceId: sequence_id,
      stepId: step_id,
      status: "skipped",
      reason: `step '${step_id}' not found in sequence '${sequence_id}'`,
    })
    return
  }

  // --- 2. Check enrollment is still active ---
  // Gap between enqueue and fire time could be 10+ days.
  // The contact may have unenrolled, upgraded, or been manually removed.
  // The producer's cancel_pending_steps handles most cases,
  // but this is a safety net for any that slipped through.
  const enrolled = await isEnrolled(email, sequence_id)
  if (!enrolled) {
    await logDeliveryEvent({
      email,
      sequenceId: sequence_id,
      stepId: step_id,
      status: "skipped",
      reason: "contact is no longer enrolled",
    })
    return
  }

  // --- 3. Evaluate condition against CURRENT contact state ---
  // We read from Postgres right now, not from what was stored
  // in the job at enqueue time. This matters because:
  //   - Contact upgraded from free → paid since job was enqueued
  //   - Contact fired an event that changes their state
  // Always use the freshest data.
  const { shouldSend, reason } = await evaluateCondition(step.condition, email)

  if (!shouldSend) {
    console.log(`[worker] Skipping ${step_id} for ${email}: ${reason}`)
    await logDeliveryEvent({
      email,
      sequenceId: sequence_id,
      stepId: step_id,
      status: "skipped",
      reason,
    })
    await updateCurrentStep(email, sequence_id, step_id)
    return
  }

  // --- 4. Render template ---
  // contact_properties was stored at enqueue time as a snapshot.
  // Good enough for template rendering (name, plan etc. rarely change).
  const rendered = renderTemplate(step.template, {
    email,
    ...contact_properties,
  })

  // --- 5. Send via the configured delivery adapter ---
  const adapter = await getAdapter()
  await adapter.send({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })

  console.log(`[worker] Sent ${step_id} → ${email}`)

  // --- 6. Log success ---
  await logDeliveryEvent({
    email,
    sequenceId: sequence_id,
    stepId: step_id,
    status: "sent",
    reason,
  })

  // --- 7. Update current step on the enrollment ---
  await updateCurrentStep(email, sequence_id, step_id)
}