from datetime import datetime, timezone
from ..services.db import get_pool
from ..queue.producer import cancel_pending_steps


async def unenroll_contact(sequence_id: str, email: str) -> dict:
    """
    Unenrolls a contact from a sequence. Two things happen:

    1. Mark the enrollment as 'unenrolled' in Postgres
       (we never hard delete — you want the history)

    2. Cancel all their pending jobs from the BullMQ queue
       so no future emails go out for this sequence

    This is called when:
      - A user upgrades (cancel the upgrade nudge sequence)
      - A user manually unsubscribes
      - Your app logic decides they should leave the sequence
    """
    pool = await get_pool()
    now = datetime.now(timezone.utc).isoformat()

    async with pool.acquire() as conn:

        result = await conn.execute("""
            UPDATE enrollments
            SET status        = 'unenrolled',
                unenrolled_at = $1
            WHERE email       = $2
              AND sequence_id = $3
              AND status      = 'active'
        """, now, email, sequence_id)

        # result string looks like "UPDATE 1" or "UPDATE 0"
        rows_updated = int(result.split()[-1])

    if rows_updated == 0:
        raise ValueError(
            f"{email} is not actively enrolled in '{sequence_id}'."
        )

    # Cancel all pending jobs for this contact in this sequence
    cancelled = await cancel_pending_steps(sequence_id, email)

    return {
        "unenrolled":      True,
        "email":           email,
        "sequence_id":     sequence_id,
        "unenrolled_at":   now,
        "jobs_cancelled":  cancelled,
    }