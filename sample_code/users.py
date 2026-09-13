"""User domain helpers."""

from typing import Dict, Optional


class UserNotFoundError(Exception):
    pass


class UserService:
    def __init__(self, db_session) -> None:
        self.db = db_session

    def get_user(self, user_id: int) -> Dict:
        if user_id <= 0:
            raise ValueError("user_id must be positive")
        row = self.db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise UserNotFoundError(f"user {user_id} not found")
        return {"id": row[0], "email": row[1], "active": bool(row[2])}

    def create_user(self, email: str, active: bool = True) -> Dict:
        if not email or "@" not in email:
            raise ValueError("invalid email")
        self.db.execute(
            "INSERT INTO users(email, active) VALUES (?, ?)",
            (email.lower(), int(active)),
        )
        self.db.commit()
        return {"email": email.lower(), "active": active}
