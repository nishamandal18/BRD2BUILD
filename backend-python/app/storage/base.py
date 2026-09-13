from abc import ABC, abstractmethod
from typing import List, Optional

from app.models.schemas import JobRecord


class JobStore(ABC):
    @abstractmethod
    async def save(self, record: JobRecord) -> JobRecord: ...

    @abstractmethod
    async def get(self, job_id: str) -> Optional[JobRecord]: ...

    @abstractmethod
    async def list(self) -> List[JobRecord]: ...

    @abstractmethod
    async def delete(self, job_id: str) -> bool: ...
