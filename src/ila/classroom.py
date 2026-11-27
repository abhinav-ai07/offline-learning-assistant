"""Classroom notes with the local llama.cpp multimodal server."""

import base64
import contextlib
import json
import re
import secrets
import socket
import struct
import subprocess
import threading
import time
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

from ila.llm.profiles import PROFILE_MODELS
from ila.notes import NoteResult

ROOT = Path(__file__).resolve().parents[2]
BINARY = ROOT / ".ila/runtime/llama-server.exe"
SPEC = PROFILE_MODELS["balanced"]
PROJECTOR = "mmproj-F16.gguf"
_MODEL_LOCK = threading.Lock()


def validate_image(image):
    # The studio re-encodes classroom photos as bounded PNGs before upload.
    try:
        data = base64.b64decode(image, validate=True)
    except ValueError as exc:
        raise ValueError("Invalid classroom image encoding") from exc
    if data[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" or len(data) < 33:
        raise ValueError("Expected a PNG classroom image")
    width, height = struct.unpack(">II", data[16:24])
    if not 1 <= min(width, height) <= max(width, height) <= 1600:
        raise ValueError("Classroom image dimensions exceed 1600 pixels")


@contextlib.contextmanager
def local_model(directory, vision, model_path=None):
    with _MODEL_LOCK, _run_local_model(directory, vision, model_path) as complete:
        yield complete


@contextlib.contextmanager
def _run_local_model(directory, vision, model_path):
    model = model_path or directory / SPEC.filename
    projector = directory / PROJECTOR
    files = [(model, SPEC.size_bytes)] if model_path is None else []
    if vision:
        files.append((projector, 668227264))
    for path, size in files:
        if not path.is_file() or path.stat().st_size != size:
            raise RuntimeError(f"Missing or incomplete classroom model component: {path}")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    key = secrets.token_hex(24)
    args = [
        str(BINARY),
        "-m",
        str(model),
        "--offline",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--api-key",
        key,
        "-c",
        "8192",
        "-np",
        "1",
        "-t",
        "6",
        "--reasoning",
        "off",
        "--no-warmup",
    ]
    if vision:
        args += ["--mmproj", str(projector), "--image-max-tokens", "1024"]
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    url = f"http://127.0.0.1:{port}"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    process = subprocess.Popen(
        args, stdout=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
    )
    try:
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"llama.cpp failed loading {model} (exit {process.returncode})")
            try:
                with client.open(
                    urllib.request.Request(url + "/health", headers=headers), timeout=2
                ):
                    break
            except OSError:
                time.sleep(0.25)
        else:
            raise RuntimeError(f"Timed out loading {model}")

        def complete(content, limit, schema=None, *, messages=None, temperature=0.1, stop=None):
            payload = {
                "messages": messages or [{"role": "user", "content": content}],
                "temperature": temperature,
                "max_tokens": limit,
            }
            if stop:
                payload["stop"] = list(stop)
            if schema:
                payload["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {"name": "study_notes", "schema": schema},
                }
            request = urllib.request.Request(
                url + "/v1/chat/completions", json.dumps(payload).encode(), headers
            )
            with client.open(request, timeout=600) as response:
                choice = json.load(response)["choices"][0]
            answer = choice["message"]["content"].strip()
            if not answer or choice["finish_reason"] == "length":
                raise RuntimeError("Qwen returned an empty or truncated response")
            return answer

        yield complete
    finally:
        process.terminate()
        process.wait()


def chunks(text, size=5600):
    while len(text) > size:
        cut = text.rfind("\n", size // 2, size)
        if cut < 0:
            cut = text.rfind(" ", size // 2, size)
        if cut < 0:
            cut = size
        yield text[:cut]
        text = text[cut:].lstrip()
    if text:
        yield text


def grounded_points(complete, sources, evidence, sections, seen, cited):
    schema = {
        "type": "object",
        "properties": {
            "points": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        key: {"type": "string"} for key in ("topic", "explanation", "quote")
                    },
                    "required": ["topic", "explanation", "quote"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["points"],
        "additionalProperties": False,
    }
    prompt = (
        "Write revision notes for a student. Use ONLY the supplied evidence. Skip filler, "
        "subscription requests, apparent transcription errors and repetitive boilerplate. "
        "Group points by the actual topics. Each point must contain a short topic heading, "
        "one clear explanation, and an exact contiguous supporting quote copied from ONE "
        "source without the source label. Only include a formula, example, diagram or method "
        "if it literally appears. Never introduce a new number, procedure or concept. "
        "If the teacher only introduces a question, say so. Do not supply its answer. "
        "Keep numbered visual material distinct from speech. Begin with an overview and end "
        "with revision points only where they add information. Avoid repeating points. "
        "For a short passage, one to four points suffice.\n" + sources
    )
    for point in json.loads(complete(prompt, 2600, schema))["points"]:
        quote = " ".join(point["quote"].split()).casefold()
        explanation = point["explanation"].strip()
        topic = point["topic"].strip()
        if not quote or not explanation or not topic or explanation.casefold() in seen:
            continue
        matches = [label for text, label in evidence if quote in " ".join(text.split()).casefold()]
        if not matches or not set(re.findall(r"\d+", topic + " " + explanation)).issubset(
            re.findall(r"\d+", quote)
        ):
            continue
        if quote in cited or any(
            SequenceMatcher(None, explanation.casefold(), prior).ratio() > 0.9
            and re.findall(r"\d+", explanation) == re.findall(r"\d+", prior)
            for prior in seen
        ):
            continue
        cited.add(quote)
        seen.add(explanation.casefold())
        sections.setdefault(topic, []).append(
            f"- {explanation} *({', '.join(dict.fromkeys(matches))})*"
        )


def classroom_notes(settings, lines, title, images, syllabus=None, previous_observations=None):
    started = time.monotonic()
    for image in images:
        validate_image(image)
    directory = Path(settings.model_dir)
    # Suppress obvious video promotions and repeated ASR loops only in the notes input.
    spoken = []
    previous = ""
    for line in lines:
        normalized = " ".join(line.text.lower().split())
        if re.search(r"\bsubscribe to (?:our|my|the|this) channel\b", normalized):
            continue
        if normalized == previous:
            continue
        label = f"Spoken {line.start:.1f}s" if line.start is not None else "Spoken"
        spoken.append(f"[{label}] {line.text}")
        previous = normalized
    sources = "\n".join(spoken)
    observations = list(previous_observations or [])
    with local_model(directory, bool(images)) as complete:
        for index, image in enumerate(images, 1):
            description = complete(
                [
                    {
                        "type": "text",
                        "text": (
                            "Read the classroom image as evidence. Transcribe visible equations, "
                            "labels, table values and arrows. Mark unreadable details. "
                            "Output only observations; do not interpret motives or add activities. "
                            "Do not infer missing details."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64," + image}},
                ],
                800,
            )
            observations.append(f"[Image {index}] {description}")
        sources += "\n" + "\n".join(observations)
        evidence = [
            (line.text, f"Spoken {line.start:.1f}s" if line.start is not None else "Spoken")
            for line in lines
        ] + [(text, f"Image {i}") for i, text in enumerate(observations, 1)]
        sections = {}
        seen = set()
        cited = set()
        for section in chunks(sources, 7000):
            grounded_points(complete, section, evidence, sections, seen, cited)
    if not sections:
        raise RuntimeError(
            "Qwen could not support its notes with quotations from the lecture sources"
        )
    summary = "\n\n".join(
        "### " + topic + "\n\n" + "\n".join(points) for topic, points in sections.items()
    )
    if observations:
        summary += "\n\n## Classroom image observations\n\n" + "\n\n".join(observations)
    return NoteResult(
        title=title,
        summary=summary,
        used_llm=True,
        model=SPEC.filename,
        profile="balanced",
        image_observations=observations,
        sentences=len(lines),
        latency_s=time.monotonic() - started,
        curriculum=syllabus.to_dict() if syllabus else None,
    )
