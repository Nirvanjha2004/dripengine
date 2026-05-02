import json
from datetime import datetime, timezone

from ..services.db import get_pool
from ..services.sequence_loader import load_sequence, parse_delay
from ..queue.producer import enqueue_step
from ..models.contact import Contact


async def enroll_contact(sequence_id: str, contact: Contact) -> dict:
    """
    Enrolls a contact into a sequence. Here's exactly what happens:

    1. Load the sequence YAML — validate it exists
    2. Upsert the contact into the contacts table
       (if they exist, update their properties + timezone)
    3. Create an enrollment row in the enrollments table
       (if already enrolled and active, reject with a clear error)
    4. Loop through the sequence steps and enqueue each one
       into BullMQ with the correct delay in seconds

    Note: we enqueue ALL steps upfront as delayed jobs.
    The condition evaluator (in the worker) decides at fire time
    whether each step should actually send. This keeps the scheduler
    simple — it doesn't need to know about conditions, just timing.
    """
    pool = await get_pool()

    # --- Step 1: Load sequence ---
    sequence = load_sequence(sequence_id)
    if not sequence:
        raise ValueError(f"Sequence '{sequence_id}' not found.")

    steps = sequence.get("steps", [])
    if not steps:
        raise ValueError(f"Sequence '{sequence_id}' has no steps.")

    async with pool.acquire() as conn:

        # --- Step 2: Upsert contact ---
        await conn.execute("""
            INSERT INTO contacts (email, name, timezone, properties)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO UPDATE
                SET name       = EXCLUDED.name,
                    timezone   = EXCLUDED.timezone,
                    properties = contacts.properties || EXCLUDED.properties
        """,
            contact.email,
            contact.name,
            contact.timezone,
            json.dumps(contact.properties),
        )

        # --- Step 3: Create enrollment (reject if already active) ---
        existing = await conn.fetchrow("""
            SELECT status FROM enrollments
            WHERE email = $1 AND sequence_id = $2
        """, contact.email, sequence_id)

        if existing and existing["status"] == "active":
            raise ValueError(
                f"{contact.email} is already actively enrolled in '{sequence_id}'."
            )

        await conn.execute("""
            INSERT INTO enrollments (email, sequence_id, current_step, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (email, sequence_id)
            DO UPDATE SET
                status        = 'active',
                enrolled_at   = NOW(),
                unenrolled_at = NULL,
                current_step  = EXCLUDED.current_step
        """, contact.email, sequence_id, steps[0]["id"])

    # --- Step 4: Enqueue all steps with their delays ---
    enqueued = []
    for step in steps:
        delay_seconds = parse_delay(step.get("delay", 0))

        job_id = await enqueue_step(
            sequence_id=sequence_id,
            email=contact.email,
            step_id=step["id"],
            delay_seconds=delay_seconds,
            contact_properties=contact.properties or {},
            timezone=contact.timezone or "UTC",
        )
        enqueued.append({
            "step_id":       step["id"],
            "delay_seconds": delay_seconds,
            "job_id":        job_id,
        })

    return {
        "enrolled":    True,
        "email":       contact.email,
        "sequence_id": sequence_id,
        "steps_queued": len(enqueued),
        "steps":        enqueued,
    }