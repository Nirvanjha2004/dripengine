from fastapi import APIRouter, HTTPException
from ..models.contact import EnrollRequest
from ..services.enroll_service import enroll_contact

router = APIRouter()


@router.post("/enroll", summary="Enroll a contact into a sequence")
async def enroll(body: EnrollRequest):
    """
    Enrolls a contact into an email sequence.

    - Validates the sequence exists
    - Stores the contact and their properties
    - Queues all steps as delayed BullMQ jobs

    Request body:
        {
            "sequence_id": "onboarding",
            "contact": {
                "email": "john@gmail.com",
                "name": "John",
                "timezone": "Asia/Kolkata",
                "properties": {
                    "plan": "free",
                    "completed_profile": false
                }
            }
        }
    """
    try:
        result = await enroll_contact(body.sequence_id, body.contact)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")