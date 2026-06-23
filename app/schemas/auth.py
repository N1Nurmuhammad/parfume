"""Schemas for authentication."""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    login: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminIn(BaseModel):
    login: str
    password: str
    is_superuser: bool = False


class AdminOut(BaseModel):
    id: int
    login: str
    is_superuser: bool

    model_config = {"from_attributes": True}
