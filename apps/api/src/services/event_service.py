import json
from datetime import datetime, timezone

from ..services.db import get_pool
from ..services.sequence_loader import load_sequence
from ..queue.producer import cancel_pending_steps


async def fire_event(event_name: str, email: str, properties: dict) -> dict:
    """
    Fires an event for a contact. Three things happen:

    1. Log the event to contact_events table
       (condition evaluator reads this table at job fire time)

    2. Find all active enrollments for this contact
       (a contact can be in multiple sequences simultaneously)

    3. For each active enrollment, load the sequence YAML and check:
       - Are there any future steps gated on event_not_fired: {this_event}?
       - If yes, those steps are now invalid — cancel them from the queue

    This is the "smart cancellation" that makes the engine feel intelligent.
    Without this, the engine would send emails even after conditions changed.
    """
    pool = await get_pool()
    fired_at = datetime.now(timezone.utc).isoformat()

    async with pool.acquire() as conn:

        # --- Step 1: Log the event ---
        await conn.execute("""
            INSERT INTO contact_events (email, event_name, properties, fired_at)
            VALUES ($1, $2, $3, $4)
        """,
            email,
            event_name,
            json.dumps(properties),
            fired_at,
        )

        # --- Step 2: Find all active enrollments for this contact ---
        enrollments = await conn.fetch("""
            SELECT sequence_id FROM enrollments
            WHERE email = $1 AND status = 'active'
        """, email)

    # --- Step 3: Check each sequence for steps that should be cancelled ---
    total_cancelled = 0
    sequences_affected = []

    for row in enrollments:
        sequence_id = row["sequence_id"]
        sequence = load_sequence(sequence_id)

        if not sequence:
            continue

        steps = sequence.get("steps", [])

        # Find steps that are gated on this event NOT having fired
        # e.g.  condition: { event_not_fired: user.completed_profile }
        # Now that the event HAS fired, these steps should be skipped
        steps_to_cancel = []
        for step in steps:
            condition = step.get("condition", {})
            if condition.get("event_not_fired") == event_name:
                steps_to_cancel.append(step["id"])

        if steps_to_cancel:
            # cancel_pending_steps removes them from the BullMQ delayed queue
            cancelled = await cancel_pending_steps(sequence_id, email)
            total_cancelled += cancelled
            sequences_affected.append({
                "sequence_id":     sequence_id,
                "steps_cancelled": steps_to_cancel,
            })

    return {
        "logged":             True,
        "email":              email,
        "event_name":         event_name,
        "fired_at":           fired_at,
        "total_cancelled":    total_cancelled,
        "sequences_affected": sequences_affected,
    }