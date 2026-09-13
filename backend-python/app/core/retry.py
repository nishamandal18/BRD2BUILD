"""Retry helpers with exponential backoff."""

import asyncio
import functools
import random
from typing import Any, Callable, Optional, Tuple, Type, TypeVar

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


def async_retry(
    *,
    attempts: Optional[int] = None,
    exceptions: Tuple[Type[BaseException], ...] = (Exception,),
    min_wait: Optional[float] = None,
    max_wait: Optional[float] = None,
) -> Callable[[F], F]:
    """Decorator for async functions with exponential backoff + jitter."""

    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            settings = get_settings()
            max_attempts = attempts or settings.retry_attempts
            wait_min = min_wait if min_wait is not None else settings.retry_min_wait_seconds
            wait_max = max_wait if max_wait is not None else settings.retry_max_wait_seconds

            last_exc: Optional[BaseException] = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return await fn(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt >= max_attempts:
                        logger.error(
                            "Retry exhausted for %s after %s attempts: %s",
                            fn.__name__,
                            max_attempts,
                            exc,
                        )
                        raise
                    sleep_for = min(wait_max, wait_min * (2 ** (attempt - 1)))
                    sleep_for = sleep_for * (0.5 + random.random())  # jitter
                    logger.warning(
                        "Retry %s/%s for %s after error: %s (sleep=%.2fs)",
                        attempt,
                        max_attempts,
                        fn.__name__,
                        exc,
                        sleep_for,
                    )
                    await asyncio.sleep(sleep_for)
            assert last_exc is not None
            raise last_exc

        return wrapper  # type: ignore[return-value]

    return decorator
