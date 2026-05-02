from fastapi import APIRouter, HTTPException
from ..models.event import EventRequest
from ..services.event_service import fire_event

router = APIRouter()


@router.post("/event", summary="Fire an event for a contact")
async def event(body: EventRequest):
    """
    Signals that something happened to a contact.

    - Logs the event to Postgres
    - Scans all active sequences for this contact
    - Cancels any pending steps that were gated on this event not having fired

    Request body:
        {
            "event_name": "user.completed_profile",
            "email": "john@gmail.com",
            "properties": {
                "method": "google_oauth"
            }
        }

    Response tells you exactly which sequences were affected and
    how many pending jobs were cancelled.
    """
    try:
        result = await fire_event(body.event_name, body.email, body.properties)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")