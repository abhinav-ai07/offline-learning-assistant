"""The captioning pipeline: audio source -> segmentation -> on-device ASR.

Design notes
------------
* Utterance-based, not sliding-window: a ``final`` caption is produced only
  once the speaker pauses, so text is never duplicated or rewritten on screen.
* ``partial`` captions are emitted while the speaker keeps talking so the UI
  feels live. They share an ``utterance_id`` with the eventual final and must be
  treated as previews.
* Each final caption seeds the decoder prompt for the next window, which
  improves spelling of names and technical terms across a lecture.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Iterator

import numpy as np

from ila.asr.base import AsrProvider
from ila.audio import AudioSource
from ila.config import PartialSettings, Settings, VadSettings
from ila.events import CaptionEvent
from ila.segmenter import SpeechSegmenter, Utterance
from ila.text import clean_caption, normalize_transcript

logger = logging.getLogger(__name__)


class CaptionPipeline:
    """Wires an audio source to the segmenter and the ASR engine."""

    def __init__(
        self,
        source: AudioSource,
        asr: AsrProvider,
        *,
        segmenter: SpeechSegmenter | None = None,
        partials: PartialSettings | None = None,
        prompt_chars: int = 600,
        no_speech_threshold: float = 0.6,
        logprob_threshold: float = -1.0,
    ) -> None:
        self.source = source
        self.asr = asr
        self.segmenter = segmenter or SpeechSegmenter(sample_rate=source.sample_rate)
        self.partials = partials or PartialSettings()
        self.prompt_chars = prompt_chars
        self.no_speech_threshold = no_speech_threshold
        self.logprob_threshold = logprob_threshold

    @classmethod
    def from_settings(
        cls,
        settings: Settings,
        source: AudioSource,
        asr: AsrProvider,
    ) -> CaptionPipeline:
        vad = settings.vad
        return cls(
            source,
            asr,
            segmenter=build_segmenter(settings.audio.sample_rate, vad, settings.partials),
            partials=settings.partials,
            no_speech_threshold=settings.asr.no_speech_threshold,
            logprob_threshold=settings.asr.logprob_threshold,
        )

    # ------------------------------------------------------------------ stream
    def events(self, stop: Callable[[], bool] | None = None) -> Iterator[CaptionEvent]:
        """Yield caption events until the source ends or ``stop()`` is true."""
        context = ""
        for block in self.source.blocks():
            if stop is not None and stop():
                break
            utterances = self.segmenter.feed(block)
            # If multiple partials queued from buffered blocks, only decode finals + the latest partial
            last_partial_idx = max(
                (i for i, u in enumerate(utterances) if not u.final),
                default=-1,
            )
            for idx, utterance in enumerate(utterances):
                if not utterance.final and idx != last_partial_idx:
                    continue
                event = self._run_utterance(utterance, context)
                if event is None:
                    continue
                if utterance.final:
                    context = self._next_context(context, event.text)
                yield event

        if stop is not None and stop():
            return
        for utterance in self.segmenter.flush():
            event = self._run_utterance(utterance, context)
            if event is None:
                continue
            context = self._next_context(context, event.text)
            yield event

    # ------------------------------------------------------------------ helpers
    def _run_utterance(self, utterance: Utterance, context: str) -> CaptionEvent | None:
        if not utterance.final and not self.partials.enabled:
            return None

        audio = _normalize_quiet_speech(utterance.audio)
        started = time.perf_counter()
        try:
            stream_fn = getattr(self.asr, "transcribe_stream", None)
            if callable(stream_fn):
                result = stream_fn(
                    audio,
                    initial_prompt=context or None,
                    final=utterance.final,
                )
            else:
                result = self.asr.transcribe(audio, initial_prompt=context or None)
        except Exception:
            logger.exception("transcription failed for utterance %s", utterance.utterance_id)
            return None
        latency_ms = (time.perf_counter() - started) * 1000.0

        text = normalize_transcript(result.text)
        if not text:
            return None

        if (
            utterance.final
            and result.no_speech_prob >= self.no_speech_threshold
            and result.avg_logprob <= self.logprob_threshold
        ):
            logger.debug(
                "dropping likely hallucination (no_speech=%.2f logprob=%.2f): %r",
                result.no_speech_prob,
                result.avg_logprob,
                text[:80],
            )
            return None

        event = CaptionEvent(
            utterance_id=utterance.utterance_id,
            text=text,
            start=utterance.start,
            end=utterance.end,
            final=utterance.final,
            language=result.language,
            avg_logprob=round(result.avg_logprob, 4),
            no_speech_prob=round(result.no_speech_prob, 4),
            latency_ms=round(latency_ms, 1),
            audio_s=round(float(np.size(utterance.audio)) / self.source.sample_rate, 3),
        )
        return clean_caption(event)

    def _next_context(self, context: str, text: str) -> str:
        if not text:
            return context
        combined = f"{context} {text}".strip()
        return combined[-self.prompt_chars :]


def _normalize_quiet_speech(audio: np.ndarray) -> np.ndarray:
    """Boost soft microphone speech toward standard loudness without amplifying dead silence."""
    samples = np.ascontiguousarray(audio, dtype=np.float32).reshape(-1)
    if samples.size == 0:
        return samples
    peak = float(np.max(np.abs(samples)))
    if 0.005 <= peak < 0.25:
        gain = min(12.0, 0.5 / peak)
        return np.clip(samples * gain, -1.0, 1.0).astype(np.float32, copy=False)
    return samples


def build_segmenter(
    sample_rate: int, vad: VadSettings, partials: PartialSettings
) -> SpeechSegmenter:
    return SpeechSegmenter(
        sample_rate=sample_rate,
        frame_ms=vad.frame_ms,
        start_margin_db=vad.start_margin_db,
        end_margin_db=vad.end_margin_db,
        min_silence_ms=vad.min_silence_ms,
        pre_roll_ms=vad.pre_roll_ms,
        post_roll_ms=vad.post_roll_ms,
        min_speech_ms=vad.min_speech_ms,
        max_segment_s=vad.max_segment_s,
        partial_after_s=partials.after_s if partials.enabled else 1e9,
        partial_interval_s=partials.interval_s,
    )
