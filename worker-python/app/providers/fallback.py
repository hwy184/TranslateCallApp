from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")


async def run_with_fallback(
    providers: list[object],
    invoke: Callable[[object], Awaitable[T]],
) -> tuple[T, list[dict[str, str]]]:
    warnings: list[dict[str, str]] = []
    last_error: Exception | None = None

    for provider in providers:
        try:
            result = await invoke(provider)
            return result, warnings
        except Exception as exc:  # noqa: BLE001 - keep failure detail for warning payload
            provider_name = getattr(provider, "name", provider.__class__.__name__)
            warnings.append(
                {
                    "provider": str(provider_name),
                    "error": str(exc),
                }
            )
            last_error = exc

    if last_error is None:
        raise RuntimeError("fallback_chain_empty")
    raise last_error
