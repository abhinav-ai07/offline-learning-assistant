"""faster-whisper (CTranslate2) implementation of the ASR provider."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np

from ila.asr.base import AsrInfo, TranscriptResult
from ila.config import AsrSettings

if TYPE_CHECKING:  # pragma: no cover
    from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)


def _cuda_available() -> bool:
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:  # pragma: no cover - depends on the local runtime
        return False


def resolve_device(requested: str) -> str:
    if requested == "auto":
        return "cuda" if _cuda_available() else "cpu"
    return requested


class FasterWhisperProvider:
    """Runs Whisper locally through CTranslate2 (no network, no API keys)."""

    def __init__(self, settings: AsrSettings) -> None:
        self._settings = settings
        self._batched: Any = None
        self._info = self._load_model()

    # ------------------------------------------------------------------ loading
    def _candidates(self) -> list[tuple[str, str]]:
        """Ordered (device, compute_type) pairs to try."""
        settings = self._settings
        device = resolve_device(settings.device)

        candidates: list[tuple[str, str]] = [(device, settings.compute_type)]
        if device == "cuda":
            # Broken/partial CUDA installs are common: keep a CPU path ready.
            cpu_type = "float32" if settings.compute_type == "float32" else "int8"
            candidates.append(("cpu", cpu_type))
        if settings.compute_type != "float32":
            candidates.append((device, "float32"))
        return list(dict.fromkeys(candidates))

    def _validate(self, model: WhisperModel, device_name: str) -> None:
        """Force one real inference so a half-installed CUDA runtime fails here."""
        if device_name != "cuda":
            return
        probe = np.zeros(int(16_000 * 0.5), dtype=np.float32)
        segments, _ = model.transcribe(probe, beam_size=1, without_timestamps=True)
        list(segments)

    def _load_model(self) -> AsrInfo:
        from faster_whisper import WhisperModel

        settings = self._settings
        model_dir = Path(settings.model_dir).expanduser()
        model_dir.mkdir(parents=True, exist_ok=True)

        last_error: Exception | None = None
        for device_name, compute_type in self._candidates():
            try:
                logger.info(
                    "loading whisper model=%s device=%s compute=%s dir=%s",
                    settings.model,
                    device_name,
                    compute_type,
                    model_dir,
                )
                model = WhisperModel(
                    settings.model,
                    device=device_name,
                    compute_type=compute_type,
                    cpu_threads=settings.cpu_threads,
                    download_root=str(model_dir),
                    local_files_only=settings.local_files_only,
                )
                self._validate(model, device_name)
            except (ValueError, RuntimeError, OSError) as exc:
                last_error = exc
                logger.warning("model load failed (%s/%s): %s", device_name, compute_type, exc)
                continue
            self._model = model
            return AsrInfo(
                engine="faster-whisper",
                model=settings.model,
                device=device_name,
                compute_type=compute_type,
            )

        raise RuntimeError(
            f"Could not load Whisper model {settings.model!r}. "
            "Run `ila download-model <name>` while online, or check ILA_ASR__MODEL."
        ) from last_error

    @property
    def info(self) -> AsrInfo:
        return self._info

    # --------------------------------------------------------------- inference
    def transcribe(
        self,
        audio: np.ndarray,
        *,
        initial_prompt: str | None = None,
        language: str | None = None,
    ) -> TranscriptResult:
        settings = self._settings
        samples = np.ascontiguousarray(audio, dtype=np.float32).reshape(-1)
        if samples.size == 0:
            return TranscriptResult(text="")

        segments, info = self._model.transcribe(
            samples,
            language=language if language is not None else settings.language,
            beam_size=settings.beam_size,
            initial_prompt=initial_prompt or None,
            condition_on_previous_text=False,
            vad_filter=False,  # segmentation already happened upstream
            without_timestamps=True,
            word_timestamps=False,
        )

        texts: list[str] = []
        logprobs: list[float] = []
        no_speech: list[float] = []
        for segment in segments:
            text = segment.text.strip()
            if text:
                texts.append(text)
            logprobs.append(float(segment.avg_logprob))
            no_speech.append(float(segment.no_speech_prob))

        return TranscriptResult(
            text=" ".join(texts).strip(),
            language=getattr(info, "language", None),
            avg_logprob=float(np.mean(logprobs)) if logprobs else -10.0,
            no_speech_prob=max(no_speech) if no_speech else 1.0,
            duration_s=samples.size / 16_000,
        )

    def transcribe_stream(
        self,
        audio: np.ndarray,
        *,
        initial_prompt: str | None = None,
        language: str | None = None,
        final: bool = True,
    ) -> TranscriptResult:
        """Optimized single-window decode for real-time mic streaming.

        Uses Silero VAD (matching the batch file path) plus greedy ``beam_size=1``
        for fast partials and capped beam search for finals so CPU inference keeps
        pace with live microphone audio.
        """
        settings = self._settings
        samples = np.ascontiguousarray(audio, dtype=np.float32).reshape(-1)
        if samples.size == 0:
            return TranscriptResult(text="")

        if not final and samples.size > 16_000 * 12:
            samples = samples[-16_000 * 12 :]

        beam = min(settings.beam_size, 3) if final else 1
        segments, info = self._model.transcribe(
            samples,
            language=language if language is not None else settings.language,
            beam_size=beam,
            initial_prompt=initial_prompt or None,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 350, "speech_pad_ms": 200},
            without_timestamps=True,
            word_timestamps=False,
        )

        texts: list[str] = []
        logprobs: list[float] = []
        no_speech: list[float] = []
        for segment in segments:
            text = segment.text.strip()
            if text:
                texts.append(text)
            logprobs.append(float(segment.avg_logprob))
            no_speech.append(float(segment.no_speech_prob))

        return TranscriptResult(
            text=" ".join(texts).strip(),
            language=getattr(info, "language", None),
            avg_logprob=float(np.mean(logprobs)) if logprobs else -10.0,
            no_speech_prob=max(no_speech) if no_speech else 1.0,
            duration_s=samples.size / 16_000,
        )

    def transcribe_file_batched(
        self,
        path: str | Path,
        *,
        batch_size: int = 8,
        language: str | None = None,
    ) -> tuple[list[tuple[str, float, float]], float]:
        """Transcribe an uploaded audio/video file on CPU in parallel VAD batches."""
        from faster_whisper import BatchedInferencePipeline
        from ila.audio import decode_audio
        from ila.text import normalize_transcript

        samples = decode_audio(path, sample_rate=16_000)
        duration_s = float(samples.size) / 16_000.0
        if samples.size == 0:
            return [], 0.0

        if self._batched is None:
            self._batched = BatchedInferencePipeline(model=self._model)

        settings = self._settings
        segments, _ = self._batched.transcribe(
            samples,
            language=language if language is not None else settings.language,
            beam_size=settings.beam_size,
            batch_size=max(1, batch_size),
            vad_filter=True,
            without_timestamps=False,
            word_timestamps=False,
            condition_on_previous_text=False,
            no_speech_threshold=settings.no_speech_threshold,
            log_prob_threshold=settings.logprob_threshold,
        )

        lines: list[tuple[str, float, float]] = []
        for segment in segments:
            text = normalize_transcript(segment.text)
            if not text:
                continue
            no_speech = float(getattr(segment, "no_speech_prob", 0.0))
            avg_logprob = float(getattr(segment, "avg_logprob", 0.0))
            if no_speech >= settings.no_speech_threshold and avg_logprob <= settings.logprob_threshold:
                continue
            lines.append((text, round(float(segment.start), 2), round(float(segment.end), 2)))

        return lines, duration_s
