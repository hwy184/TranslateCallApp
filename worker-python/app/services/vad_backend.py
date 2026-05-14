from __future__ import annotations

import audioop
import logging
from dataclasses import dataclass

logger = logging.getLogger("worker.vad")


@dataclass
class VADDecision:
    voiced: bool
    score: float
    backend: str


class BaseVADBackend:
    name = "base"

    def detect(self, pcm16: bytes, sample_rate: int) -> VADDecision:
        raise NotImplementedError


class EnergyVADBackend(BaseVADBackend):
    name = "energy"

    def __init__(self, *, energy_threshold: int) -> None:
        self._energy_threshold = energy_threshold

    def detect(self, pcm16: bytes, sample_rate: int) -> VADDecision:
        del sample_rate
        rms = audioop.rms(pcm16, 2)
        return VADDecision(
            voiced=rms >= self._energy_threshold,
            score=float(rms),
            backend=self.name,
        )


class SileroVADBackend(BaseVADBackend):
    name = "silero"

    def __init__(self, *, threshold: float) -> None:
        try:
            import numpy as np  # type: ignore
            import torch  # type: ignore
            from silero_vad import load_silero_vad  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"silero_vad_dependency_unavailable: {exc}") from exc

        self._np = np
        self._torch = torch
        self._model = load_silero_vad()
        self._threshold = threshold

    def detect(self, pcm16: bytes, sample_rate: int) -> VADDecision:
        # Silero expects float32 audio in [-1, 1] and generally works best with 16kHz.
        audio = self._np.frombuffer(pcm16, dtype=self._np.int16).astype(self._np.float32) / 32768.0
        if audio.size == 0:
            return VADDecision(voiced=False, score=0.0, backend=self.name)
        tensor = self._torch.from_numpy(audio)
        score = float(self._model(tensor, sample_rate).item())
        return VADDecision(
            voiced=score >= self._threshold,
            score=score,
            backend=self.name,
        )


def build_vad_backend(*, backend: str, energy_threshold: int, silero_threshold: float) -> BaseVADBackend:
    requested = (backend or "energy").strip().lower()
    if requested == "silero":
        try:
            logger.info("vad_backend_selected backend=silero threshold=%s", silero_threshold)
            return SileroVADBackend(threshold=silero_threshold)
        except Exception as exc:  # noqa: BLE001
            logger.warning("vad_backend_fallback_to_energy reason=%s", str(exc))
    logger.info("vad_backend_selected backend=energy threshold=%s", energy_threshold)
    return EnergyVADBackend(energy_threshold=energy_threshold)

