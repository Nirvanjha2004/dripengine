/**
 * DripEngine SDK Test Script
 * 
 * Tests all three SDK methods against your locally running engine.
 * 
 * Setup:
 *   npm install @nirvanjha/sdk
 *   node test-sdk.js
 * 
 * Make sure docker-compose up is running first.
 */

import { DripEngine } from "@nirvanjha/sdk"

const drip = new DripEngine({
  apiKey: "supersecretkey",         // must match API_SECRET_KEY in docker-compose
  baseUrl: "http://localhost:8000",
})

const TEST_EMAIL = "test@dripengine.dev"
const SEQUENCE   = "onboarding"

// Simple test runner
let passed = 0
let failed = 0

function log(msg)  { console.log(`  ${msg}`) }
function ok(msg)   { console.log(`  ✓ ${msg}`); passed++ }
function fail(msg, err) { console.log(`  ✗ ${msg}`); console.log(`    ${err}`); failed++ }
function section(title) { console.log(`\n── ${title} ──`) }


// ─── Test 1: Enroll ───────────────────────────────────────────────────────────

section("1. enroll()")

try {
  const res = await drip.enroll({
    sequenceId: SEQUENCE,
    contact: {
      email: TEST_EMAIL,
      name: "Test User",
      timezone: "Asia/Kolkata",
      properties: { plan: "free", completed_profile: false }
    }
  })

  if (res.enrolled !== true)
    fail("enrolled should be true", `got: ${res.enrolled}`)
  else
    ok("enrolled = true")

  if (res.email !== TEST_EMAIL)
    fail("email should match", `got: ${res.email}`)
  else
    ok(`email = ${res.email}`)

  if (res.sequence_id !== SEQUENCE)
    fail("sequence_id should match", `got: ${res.sequence_id}`)
  else
    ok(`sequence_id = ${res.sequence_id}`)

  if (typeof res.steps_queued !== "number" || res.steps_queued < 1)
    fail("steps_queued should be > 0", `got: ${res.steps_queued}`)
  else
    ok(`steps_queued = ${res.steps_queued}`)

  log(`Full response: ${JSON.stringify(res, null, 2)}`)

} catch (err) {
  fail("enroll() threw an error", err.message)
}


// ─── Test 2: Enroll same contact again (should fail) ─────────────────────────

section("2. enroll() duplicate — should reject")

try {
  await drip.enroll({
    sequenceId: SEQUENCE,
    contact: { email: TEST_EMAIL, properties: { plan: "free" } }
  })
  fail("should have thrown for duplicate enrollment", "no error thrown")
} catch (err) {
  if (err.message.includes("already actively enrolled")) {
    ok("correctly rejected duplicate enrollment")
  } else if (err.message.includes("400")) {
    ok("correctly rejected with 400 status")
  } else {
    fail("unexpected error message", err.message)
  }
}


// ─── Test 3: Fire event ───────────────────────────────────────────────────────

section("3. event()")

try {
  const res = await drip.event({
    eventName: "user.completed_profile",
    email: TEST_EMAIL,
    properties: { method: "manual_test" }
  })

  if (res.logged !== true)
    fail("logged should be true", `got: ${res.logged}`)
  else
    ok("logged = true")

  if (res.email !== TEST_EMAIL)
    fail("email should match", `got: ${res.email}`)
  else
    ok(`email = ${res.email}`)

  if (res.event_name !== "user.completed_profile")
    fail("event_name should match", `got: ${res.event_name}`)
  else
    ok(`event_name = ${res.event_name}`)

  if (typeof res.total_cancelled === "number")
    ok(`total_cancelled = ${res.total_cancelled} (steps gated on this event)`)
  else
    fail("total_cancelled should be a number", `got: ${res.total_cancelled}`)

  if (res.sequences_affected.length > 0)
    ok(`sequences affected: ${res.sequences_affected.map(s => s.sequence_id).join(", ")}`)
  else
    ok("no sequences affected (event had no matching conditions)")

  log(`Full response: ${JSON.stringify(res, null, 2)}`)

} catch (err) {
  fail("event() threw an error", err.message)
}


// ─── Test 4: Fire unknown event (should still log, just not cancel anything) ──

section("4. event() — unknown event name")

try {
  const res = await drip.event({
    eventName: "user.did.something.random",
    email: TEST_EMAIL,
  })

  if (res.logged === true)
    ok("unknown event still logged correctly")
  else
    fail("should still log unknown events", `got logged: ${res.logged}`)

  if (res.total_cancelled === 0)
    ok("correctly cancelled 0 steps for unknown event")

} catch (err) {
  fail("event() with unknown name threw", err.message)
}


// ─── Test 5: Unenroll ─────────────────────────────────────────────────────────

section("5. unenroll()")

try {
  const res = await drip.unenroll({
    sequenceId: SEQUENCE,
    email: TEST_EMAIL,
  })

  if (res.unenrolled !== true)
    fail("unenrolled should be true", `got: ${res.unenrolled}`)
  else
    ok("unenrolled = true")

  if (res.email !== TEST_EMAIL)
    fail("email should match", `got: ${res.email}`)
  else
    ok(`email = ${res.email}`)

  if (typeof res.jobs_cancelled === "number")
    ok(`jobs_cancelled = ${res.jobs_cancelled}`)
  else
    fail("jobs_cancelled should be a number", `got: ${res.jobs_cancelled}`)

  log(`Full response: ${JSON.stringify(res, null, 2)}`)

} catch (err) {
  fail("unenroll() threw an error", err.message)
}


// ─── Test 6: Unenroll again (should fail — not enrolled anymore) ──────────────

section("6. unenroll() when not enrolled — should reject")

try {
  await drip.unenroll({ sequenceId: SEQUENCE, email: TEST_EMAIL })
  fail("should have thrown for non-active enrollment", "no error thrown")
} catch (err) {
  if (err.message.includes("400") || err.message.includes("not actively enrolled")) {
    ok("correctly rejected unenroll of inactive contact")
  } else {
    fail("unexpected error", err.message)
  }
}


// ─── Test 7: Re-enroll after unenroll (should succeed) ────────────────────────

section("7. re-enroll after unenroll — should succeed")

try {
  const res = await drip.enroll({
    sequenceId: SEQUENCE,
    contact: {
      email: TEST_EMAIL,
      properties: { plan: "free" }
    }
  })

  if (res.enrolled === true)
    ok("re-enrollment successful")
  else
    fail("re-enrollment should work after unenroll", `got enrolled: ${res.enrolled}`)

  // Clean up — unenroll again so reruns of this script start clean
  await drip.unenroll({ sequenceId: SEQUENCE, email: TEST_EMAIL })
  ok("cleaned up — unenrolled test contact")

} catch (err) {
  fail("re-enroll threw an error", err.message)
}


// ─── Test 8: Wrong API key ────────────────────────────────────────────────────

section("8. wrong API key — should get 403")

try {
  const badDrip = new DripEngine({
    apiKey: "wrong-key-xyz",
    baseUrl: "http://localhost:8000",
  })
  await badDrip.enroll({
    sequenceId: SEQUENCE,
    contact: { email: TEST_EMAIL, properties: {} }
  })
  fail("should have thrown 403", "no error thrown")
} catch (err) {
  if (err.message.includes("403")) {
    ok("correctly rejected with 403 for bad API key")
  } else {
    fail("unexpected error for bad key", err.message)
  }
}


// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n────────────────────────────")
console.log(`  ${passed} passed  ·  ${failed} failed`)
console.log("────────────────────────────\n")

if (failed > 0) process.exit(1)