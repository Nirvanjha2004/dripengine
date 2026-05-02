import { Worker, QueueEvents } from "bullmq"
import * as dotenv from "dotenv"
import { initWorkerDb } from "./db"
import { processEmailJob } from "./processors/email"

dotenv.config()

const QUEUE_NAME = "drip-email"

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
}

/**
 * Boot sequence:
 * 1. Init DB — creates delivery_events table if it doesn't exist
 * 2. Start the BullMQ worker — connects to Redis, starts polling
 * 3. Attach event listeners — for logging and observability
 * 4. Handle graceful shutdown — drain the worker before exiting
 */
async function main() {
  console.log("[worker] Starting DripEngine worker...")

  // --- 1. Init DB ---
  await initWorkerDb()
  console.log("[worker] Database ready.")

  // --- 2. Start BullMQ worker ---
  const worker = new Worker(QUEUE_NAME, processEmailJob, {
    connection: redisConnection,

    // How many jobs to process simultaneously.
    // 10 is safe for most setups. Raise it if you have many
    // contacts firing at the same time and SMTP can keep up.
    concurrency: 10,

    // Keep failed jobs in Redis for 7 days so you can inspect them
    removeOnFail: { age: 7 * 24 * 3600 },
    // Keep completed jobs for 24 hours (useful for debugging)
    removeOnComplete: { age: 24 * 3600 },
  })

  console.log(`[worker] Listening on queue '${QUEUE_NAME}' with concurrency 10`)

  // --- 3. Event listeners ---

  worker.on("completed", (job) => {
    console.log(`[worker] ✓ Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(
      `[worker] ✗ Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`
    )
  })

  worker.on("error", (err) => {
    console.error("[worker] Worker error:", err)
  })

  // QueueEvents gives us visibility into delayed jobs becoming active
  const queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisConnection,
  })

  queueEvents.on("delayed", ({ jobId, delay }) => {
    console.log(`[worker] Job ${jobId} delayed by ${Math.round(delay / 1000)}s`)
  })

  // --- 4. Graceful shutdown ---
  // When the process receives SIGTERM (e.g. docker stop, k8s scale-down),
  // stop accepting new jobs but finish the ones currently in-flight
  // before exiting. This prevents half-sent emails.
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received — draining worker...`)
    await worker.close()
    await queueEvents.close()
    console.log("[worker] Shutdown complete.")
    process.exit(0)
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT",  () => shutdown("SIGINT"))
}

main().catch((err) => {
  console.error("[worker] Fatal error during startup:", err)
  process.exit(1)
})