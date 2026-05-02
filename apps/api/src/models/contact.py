from pydantic import BaseModel, EmailStr, Field
from typing import Any, Optional


class Contact(BaseModel):
    """
    Represents a contact being enrolled into a sequence.

    email      - required, uniquely identifies the contact
    timezone   - used by the scheduler to fire emails at the right local time
    properties - any extra key/value data your app wants to store
                 e.g. { "plan": "free", "completed_profile": false }
                 These are what condition evaluator checks against later.
    """
    email: EmailStr
    name: Optional[str] = None
    timezone: Optional[str] = "UTC"
    properties: Optional[dict[str, Any]] = Field(default_factory=dict)


class EnrollRequest(BaseModel):
    """
    Body of POST /enroll
    """
    sequence_id: str
    contact: Contact


class UnenrollRequest(BaseModel):
    """
    Body of POST /unenroll
    """
    sequence_id: str
    email: EmailStr