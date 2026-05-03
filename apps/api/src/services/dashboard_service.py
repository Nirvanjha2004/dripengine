from .db import get_pool


async def get_overview() -> dict:
    """
    Home page summary stats.
    Returns total counts across all sequences and contacts.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        total_enrolled = await conn.fetchval("""
            SELECT COUNT(*) FROM enrollments WHERE status = 'active'
        """)

        total_unenrolled = await conn.fetchval("""
            SELECT COUNT(*) FROM enrollments WHERE status = 'unenrolled'
        """)

        total_contacts = await conn.fetchval("""
            SELECT COUNT(*) FROM contacts
        """)

        total_sent = await conn.fetchval("""
            SELECT COUNT(*) FROM delivery_events WHERE status = 'sent'
        """)

        total_skipped = await conn.fetchval("""
            SELECT COUNT(*) FROM delivery_events WHERE status = 'skipped'
        """)

        total_failed = await conn.fetchval("""
            SELECT COUNT(*) FROM delivery_events WHERE status = 'failed'
        """)

        # Emails sent in last 24 hours
        sent_today = await conn.fetchval("""
            SELECT COUNT(*) FROM delivery_events
            WHERE status = 'sent'
              AND created_at >= NOW() - INTERVAL '24 hours'
        """)

        # Recent activity — last 5 delivery events
        recent = await conn.fetch("""
            SELECT email, sequence_id, step_id, status, reason, created_at AS attempted_at
            FROM delivery_events
            ORDER BY created_at DESC
            LIMIT 5
        """)

    return {
        "contacts":         int(total_contacts),
        "active_enrolled":  int(total_enrolled),
        "unenrolled":       int(total_unenrolled),
        "total_sent":       int(total_sent),
        "total_skipped":    int(total_skipped),
        "total_failed":     int(total_failed),
        "sent_today":       int(sent_today),
        "recent_activity": [dict(r) for r in recent],
    }


async def get_sequences_health() -> dict:
    """
    Per-sequence breakdown.
    For each sequence: how many active, sent, failed, skipped.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        # Active enrollments per sequence
        enrollments = await conn.fetch("""
            SELECT sequence_id, COUNT(*) as count
            FROM enrollments
            WHERE status = 'active'
            GROUP BY sequence_id
            ORDER BY count DESC
        """)

        # Delivery stats per sequence
        delivery_stats = await conn.fetch("""
            SELECT
                sequence_id,
                status,
                COUNT(*) as count
            FROM delivery_events
            GROUP BY sequence_id, status
        """)

    # Build a map: sequence_id -> { sent, skipped, failed }
    stats_map: dict = {}
    for row in delivery_stats:
        sid = row["sequence_id"]
        if sid not in stats_map:
            stats_map[sid] = {"sent": 0, "skipped": 0, "failed": 0}
        stats_map[sid][row["status"]] = int(row["count"])

    sequences = []
    for row in enrollments:
        sid = row["sequence_id"]
        sequences.append({
            "sequence_id":    sid,
            "active":         int(row["count"]),
            "sent":           stats_map.get(sid, {}).get("sent", 0),
            "skipped":        stats_map.get(sid, {}).get("skipped", 0),
            "failed":         stats_map.get(sid, {}).get("failed", 0),
        })

    # Also include sequences that have delivery logs but no active enrollments
    for sid, stats in stats_map.items():
        if not any(s["sequence_id"] == sid for s in sequences):
            sequences.append({
                "sequence_id": sid,
                "active":      0,
                **stats,
            })

    return {"sequences": sequences}


async def get_contact_timeline(email: str) -> dict:
    """
    Full history for a single contact.
    Returns their properties, all enrollments, all events fired,
    and every delivery log entry — ordered by time.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        contact = await conn.fetchrow("""
            SELECT email, name, timezone, properties
            FROM contacts WHERE email = $1
        """, email)

        if not contact:
            return {"found": False, "email": email}

        enrollments = await conn.fetch("""
            SELECT sequence_id, status, current_step,
                   enrolled_at, unenrolled_at
            FROM enrollments
            WHERE email = $1
            ORDER BY enrolled_at DESC
        """, email)

        events = await conn.fetch("""
            SELECT event_name, properties, fired_at
            FROM contact_events
            WHERE email = $1
            ORDER BY fired_at DESC
        """, email)

        delivery = await conn.fetch("""
            SELECT sequence_id, step_id, status, reason, created_at AS attempted_at
            FROM delivery_events
            WHERE email = $1
            ORDER BY created_at DESC
        """, email)

    return {
        "found":       True,
        "contact":     dict(contact),
        "enrollments": [dict(r) for r in enrollments],
        "events":      [dict(r) for r in events],
        "delivery":    [dict(r) for r in delivery],
    }


async def get_delivery_logs(
    page: int = 1,
    limit: int = 50,
    status: str = None,
    sequence_id: str = None,
) -> dict:
    """
    Paginated delivery log feed.
    Supports filtering by status (sent/skipped/failed)
    and by sequence_id.
    """
    pool = await get_pool()
    offset = (page - 1) * limit

    # Build WHERE clause dynamically based on filters
    conditions = []
    params = []
    param_count = 0

    if status:
        param_count += 1
        conditions.append(f"status = ${param_count}")
        params.append(status)

    if sequence_id:
        param_count += 1
        conditions.append(f"sequence_id = ${param_count}")
        params.append(sequence_id)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    param_count += 1
    params.append(limit)
    param_count += 1
    params.append(offset)

    async with pool.acquire() as conn:

        logs = await conn.fetch(f"""
            SELECT id AS job_id, email, sequence_id, step_id,
                   status, reason, created_at AS attempted_at
            FROM delivery_events
            {where}
            ORDER BY created_at DESC
            LIMIT ${param_count - 1} OFFSET ${param_count}
        """, *params)

        total = await conn.fetchval(f"""
            SELECT COUNT(*) FROM delivery_events {where}
        """, *params[:-2] if params else [])

    return {
        "logs":       [dict(r) for r in logs],
        "total":      int(total),
        "page":       page,
        "limit":      limit,
        "total_pages": -(-int(total) // limit),  # ceiling division
    }