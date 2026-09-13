"""Auth helpers."""

import hashlib
from typing import Optional

import requests


def hash_password(password: str, salt: str = "static") -> str:
    if not password:
        raise ValueError("password required")
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str, salt: str = "static") -> bool:
    return hash_password(password, salt=salt) == password_hash


def fetch_jwks(url: str) -> dict:
    response = requests.get(url, timeout=5)
    response.raise_for_status()
    return response.json()


def is_token_expired(expires_at: int, now: Optional[int] = None) -> bool:
    import time

    current = now if now is not None else int(time.time())
    return current >= expires_at
