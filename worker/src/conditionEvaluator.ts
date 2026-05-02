import { getContact, hasEventFired } from "./db"

interface Condition {
  property?: string
  equals?: unknown
  not_equals?: unknown
  event_not_fired?: string
  event_fired?: string
}

interface EvaluationResult {
  shouldSend: boolean
  reason: string
}

/**
 * Evaluates whether a step's condition passes for a given contact.
 *
 * Runs RIGHT BEFORE the email sends — not at enqueue time.
 * Always checks the contact's CURRENT state in Postgres.
 *
 * Supported conditions:
 *   property + equals:      { property: "plan", equals: "free" }
 *   property + not_equals:  { property: "plan", not_equals: "paid" }
 *   event_not_fired:        { event_not_fired: "user.completed_profile" }
 *   event_fired:            { event_fired: "user.completed_onboarding" }
 *   no condition:           always sends
 */
export async function evaluateCondition(
  condition: Condition | undefined,
  email: string
): Promise<EvaluationResult> {
  if (!condition || Object.keys(condition).length === 0) {
    return { shouldSend: true, reason: "no condition" }
  }

  const contact = await getContact(email)

  if (!contact) {
    return {
      shouldSend: false,
      reason: `contact ${email} not found in database`,
    }
  }

  // --- property equals ---
  if (condition.property && condition.equals !== undefined) {
    const actual = contact.properties?.[condition.property]
    const passes = actual === condition.equals
    return {
      shouldSend: passes,
      reason: passes
        ? `property '${condition.property}' equals '${condition.equals}'`
        : `property '${condition.property}' is '${actual}', expected '${condition.equals}'`,
    }
  }

  // --- property not_equals ---
  if (condition.property && condition.not_equals !== undefined) {
    const actual = contact.properties?.[condition.property]
    const passes = actual !== condition.not_equals
    return {
      shouldSend: passes,
      reason: passes
        ? `property '${condition.property}' is not '${condition.not_equals}'`
        : `property '${condition.property}' equals '${condition.not_equals}', step skipped`,
    }
  }

  // --- event_not_fired ---
  if (condition.event_not_fired) {
    const fired = await hasEventFired(email, condition.event_not_fired)
    return {
      shouldSend: !fired,
      reason: fired
        ? `event '${condition.event_not_fired}' already fired — step skipped`
        : `event '${condition.event_not_fired}' not fired — sending`,
    }
  }

  // --- event_fired ---
  if (condition.event_fired) {
    const fired = await hasEventFired(email, condition.event_fired)
    return {
      shouldSend: fired,
      reason: fired
        ? `event '${condition.event_fired}' was fired — sending`
        : `event '${condition.event_fired}' not fired yet — step skipped`,
    }
  }

  return {
    shouldSend: false,
    reason: `unknown condition shape: ${JSON.stringify(condition)}`,
  }
}