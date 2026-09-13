from functools import lru_cache

from app.storage.base import JobStore
from app.storage.memory_store import InMemoryJobStore


@lru_cache
def get_job_store() -> JobStore:
    return InMemoryJobStore()
