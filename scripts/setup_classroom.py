"""Install the pinned Windows classroom inference components during online setup."""

import hashlib
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_URL = "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/"
MODELS = {
    "Qwen3.5-2B-Q4_K_M.gguf": "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
    "mmproj-F16.gguf": "7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7",
}


def install(path, url, checksum):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        with path.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() == checksum:
                return
        raise RuntimeError(f"Checksum mismatch for existing file {path}")
    partial = path.with_suffix(path.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as response, partial.open("wb") as out:
        shutil.copyfileobj(response, out)
    with partial.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != checksum:
            raise RuntimeError(f"Checksum mismatch for download {partial}")
    partial.replace(path)


if __name__ == "__main__":
    directory = Path(os.environ.get("ILA_LLM__MODEL_DIR", ROOT / ".ila/models/llm"))
    for name, digest in MODELS.items():
        install(directory / name, MODEL_URL + name, digest)
    runtime = ROOT / ".ila/runtime"
    name = "llama-b12719-bin-win-cpu-x64.zip"
    install(
        runtime / name,
        "https://github.com/ggml-org/llama.cpp/releases/download/b12719/" + name,
        "e5fd57de2071f7f46e9d1825ac56ec60afa838880c4642a0eb22253e39eebecc",
    )
    with zipfile.ZipFile(runtime / name) as archive:
        archive.extractall(runtime)
