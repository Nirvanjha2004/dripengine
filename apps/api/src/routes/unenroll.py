from fastapi import APIRouter, HTTPException
from ..models.contact import UnenrollRequest
from ..services.unenroll_service import unenroll_contact

router = APIRouter()


@router.post("/unenroll", summary="Remove a contact from a sequence")
async def unenroll(body: UnenrollRequest):
    try:
        result = await unenroll_contact(body.sequence_id, body.email)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")