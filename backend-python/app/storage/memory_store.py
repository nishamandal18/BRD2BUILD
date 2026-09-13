import asyncio
from typing import Dict, List, Optional

from app.models.schemas import JobRecord
from app.storage.base import JobStore


class InMemoryJobStore(JobStore):
    def __init__(self) -> None:
        self._items: Dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()

    async def save(self, record: JobRecord) -> JobRecord:
        async with self._lock:
            record.touch()
            self._items[record.job_id] = record.model_copy(deep=True)
            return self._items[record.job_id].model_copy(deep=True)

    async def get(self, job_id: str) -> Optional[JobRecord]:
        async with self._lock:
            item = self._items.get(job_id)
            return item.model_copy(deep=True) if item else None

    async def list(self) -> List[JobRecord]:
        async with self._lock:
            return [
                r.model_copy(deep=True)
                for r in sorted(self._items.values(), key=lambda x: x.created_at, reverse=True)
            ]

    async def delete(self, job_id: str) -> bool:
        async with self._lock:
            return self._items.pop(job_id, None) is not None
