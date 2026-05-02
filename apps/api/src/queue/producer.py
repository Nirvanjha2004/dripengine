import redis.asyncio as aioredis
import json
import os
import time
from dotenv import load_dotenv

load_dotenv()

_redis = None


def get_redis():
    """
    Returns a shared async Redis client.
    We use redis.asyncio so it plays nicely with FastAPI's async event loop.
    """
    global _redis
    if _redis is None:
        _redis = aioredis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            decode_responses=True,
        )
    return _redis


async def enqueue_step(
    sequence_id: str,
    email: str,
    step_id: str,
    delay_seconds: int,
    contact_properties: dict,
    timezone: str = "UTC",
):
    """
    Puts a single sequence step into the BullMQ-compatible Redis queue.

    BullMQ stores jobs as Redis hashes under the key:
        bull:{queue_name}:{job_id}

    The delay is stored as a Unix timestamp (processAt).
    BullMQ's worker checks this timestamp and only picks up the job
    when the current time >= processAt.

    Arguments:
        sequence_id        - which sequence this step belongs to
        email              - which contact
        step_id            - which step (matches YAML step id)
        delay_seconds      - how many seconds from now to fire this step
        contact_properties - stored so the condition evaluator has data
        timezone           - contact's timezone, used for time-of-day logic
    """
    r = get_redis()

    queue_name = "drip:email"
    job_id = f"{sequence_id}:{email}:{step_id}:{int(time.time())}"

    process_at = int((time.time() + delay_seconds) * 1000)  # BullMQ uses ms

    job_data = {
        "sequence_id": sequence_id,
        "email": email,
        "step_id": step_id,
        "contact_properties": contact_properties,
        "timezone": timezone,
        "enqueued_at": int(time.time() * 1000),
    }

    # BullMQ job structure in Redis
    job_key = f"bull:{queue_name}:{job_id}"

    pipe = r.pipeline()

    # Store job body as a Redis hash
    pipe.hset(job_key, mapping={
        "id":        job_id,
        "name":      "send_email",
        "data":      json.dumps(job_data),
        "opts":      json.dumps({"delay": delay_seconds * 1000}),
        "timestamp": str(int(time.time() * 1000)),
        "processedOn": "",
        "finishedOn":  "",
        "returnvalue": "",
        "stacktrace":  "[]",
        "attemptsMade": "0",
    })

    # Add to the delayed sorted set — BullMQ polls this set
    # Score = processAt timestamp, so jobs are sorted by fire time
    pipe.zadd(f"bull:{queue_name}:delayed", {job_id: process_at})

    await pipe.execute()

    return job_id


async def cancel_pending_steps(sequence_id: str, email: str):
    """
    Finds and removes all pending jobs for a (contact, sequence) pair.

    Called by:
      - /unenroll  → cancel everything for this contact in this sequence
      - /event     → cancel steps whose conditions are now invalidated

    BullMQ delayed jobs live in the sorted set bull:{queue}:delayed.
    We scan for job keys matching our pattern, check if they belong to
    this contact + sequence, and remove them.
    """
    r = get_redis()
    queue_name = "drip:email"

    # Get all delayed job IDs from the sorted set
    delayed_jobs = await r.zrange(f"bull:{queue_name}:delayed", 0, -1)

    pipe = r.pipeline()
    cancelled = 0

    for job_id in delayed_jobs:
        # Job IDs follow the pattern: {sequence_id}:{email}:{step_id}:{ts}
        if job_id.startswith(f"{sequence_id}:{email}:"):
            pipe.zrem(f"bull:{queue_name}:delayed", job_id)
            pipe.delete(f"bull:{queue_name}:{job_id}")
            cancelled += 1

    if cancelled:
        await pipe.execute()

    return cancelled