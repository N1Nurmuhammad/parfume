"""Admin management: list, create and delete dashboard admins."""

from fastapi import APIRouter, Depends, HTTPException

from ..database.models import Admin
from ..database.repo import BaseRepo, get_repo
from ..schemas import AdminIn, AdminOut
from ..services.security import get_current_admin, hash_password

router = APIRouter(prefix="/admins", tags=["admins"])


@router.get("", response_model=list[AdminOut])
async def list_admins(repo: BaseRepo = Depends(get_repo)) -> list[AdminOut]:
    return [AdminOut.model_validate(a) for a in await repo.admins.list()]


@router.post("", response_model=AdminOut, status_code=201)
async def create_admin(
    body: AdminIn, repo: BaseRepo = Depends(get_repo)
) -> AdminOut:
    login = body.login.strip()
    if not login or not body.password:
        raise HTTPException(status_code=400, detail="login and password required")
    if await repo.admins.by_login(login) is not None:
        raise HTTPException(status_code=409, detail="login already exists")
    admin = await repo.admins.add(
        login, hash_password(body.password), is_superuser=body.is_superuser
    )
    await repo.commit()
    return AdminOut.model_validate(admin)


@router.delete("/{admin_id}", status_code=204)
async def delete_admin(
    admin_id: int,
    repo: BaseRepo = Depends(get_repo),
    current: Admin = Depends(get_current_admin),
) -> None:
    if admin_id == current.id:
        raise HTTPException(status_code=400, detail="cannot delete yourself")
    if await repo.admins.count() <= 1:
        raise HTTPException(status_code=400, detail="cannot delete the last admin")
    if not await repo.admins.delete(admin_id):
        raise HTTPException(status_code=404, detail="admin not found")
    await repo.commit()
