from pydantic import BaseModel, EmailStr
from typing import Any, Optional


class EventRequest(BaseModel):
    """
    Body of POST /event

    event_name  - the thing that happened, e.g. "user.completed_profile"
    email       - which contact this event belongs to
    properties  - optional extra data about the event (not used for conditions
                  right now, but stored for future analytics / branching)

    Example:
        {
            "event_name": "user.completed_profile",
            "email": "john@gmail.com",
            "properties": { "method": "google_oauth" }
        }
    """
    event_name: str
    email: EmailStr
    properties: Optional[dict[str, Any]] = {}


class EventRecord(BaseModel):
    """
    Internal model — what gets written to Postgres when an event fires.
    """
    email: str
    event_name: str
    properties: dict[str, Any]
    fired_at: str  # ISO timestamp string