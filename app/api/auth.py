"""Auth endpoints: login (issue JWT) and current-admin lookup."""

from fastapi import APIRouter, Depends, HTTPException, status

from ..database.models import Admin
from ..database.repo import BaseRepo, get_repo
from ..schemas import AdminOut, LoginRequest, TokenResponse
from ..services.security import (
    create_access_token,
    get_current_admin,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    req: LoginRequest, repo: BaseRepo = Depends(get_repo)
) -> TokenResponse:
    admin = await repo.admins.by_login(req.login)
    if admin is None or not verify_password(req.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid login or password",
        )
    return TokenResponse(access_token=create_access_token(admin.login))


@router.get("/me", response_model=AdminOut)
async def me(admin: Admin = Depends(get_current_admin)) -> AdminOut:
    return AdminOut.model_validate(admin)
