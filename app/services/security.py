"""Authentication: password hashing (bcrypt) and JWT access tokens.

The rest of the app depends only on the helpers here, never on passlib/jwt
directly. `get_current_admin` is the FastAPI dependency that guards protected
routes and yields the acting Admin (so callers can attribute balance changes).
"""

import datetime as dt
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext

from ..config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, JWT_SECRET
from ..database.models import Admin
from ..database.repo import BaseRepo, get_repo

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# tokenUrl is where the OpenAPI "Authorize" button posts; matches our login route.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    """Issue a signed JWT whose `sub` is the admin login."""
    expire = dt.datetime.now(dt.timezone.utc) + dt.timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    """Return the token's subject (admin login), or None if invalid/expired."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    repo: BaseRepo = Depends(get_repo),
) -> Admin:
    """Resolve the authenticated admin from the bearer token, or raise 401."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    login = decode_token(token)
    if login is None:
        raise credentials_exc
    admin = await repo.admins.by_login(login)
    if admin is None:
        raise credentials_exc
    return admin


async def get_current_superuser(
    admin: Admin = Depends(get_current_admin),
) -> Admin:
    """Require the acting admin to be a superuser (admin management)."""
    if not admin.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required",
        )
    return admin
