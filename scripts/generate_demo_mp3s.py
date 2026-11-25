"""Generate authentic MP3 lecture demo audio files from NCERT curricula.
Uses Windows SAPI text-to-speech to render high-fidelity audio,
then encodes directly to standard MP3 using PyAV.
"""

from __future__ import annotations

import os
import subprocess
import wave
from pathlib import Path

import av
from ila.demo import DEMOS

DEMO_AUDIO_DIR = Path(__file__).resolve().parent.parent / "demo_audio"
DEMO_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Curate specific demo lectures to generate
CURATED_LECTURES = [
    {
        "filename": "Class10_Science_Light_Reflection.mp3",
        "title": "NCERT Class 10 Science - Light: Reflection and Refraction",
        "demo_id": "class10-science-light",
    },
    {
        "filename": "Class10_Maths_Quadratic_Equations.mp3",
        "title": "NCERT Class 10 Mathematics - Quadratic Equations",
        "demo_id": "class10-maths-quadratics",
    },
    {
        "filename": "Class10_Maths_Real_Numbers.mp3",
        "title": "NCERT Class 10 Mathematics - Real Numbers & Fundamental Theorem of Arithmetic",
        "text": (
            "Good morning students. Today we explore Chapter 1 of NCERT Class 10 Mathematics, Real Numbers. "
            "Our primary foundation is the Fundamental Theorem of Arithmetic. "
            "The theorem states that every composite number can be expressed uniquely as a product of prime numbers, "
            "apart from the order in which the prime factors occur. "
            "For example, let us factorize thirty-six. Thirty-six is two times two times three times three, which is two squared times three squared. "
            "We also use this method to compute the Highest Common Factor, or HCF, and the Least Common Multiple, or LCM. "
            "The HCF is the product of the smallest powers of each common prime factor involved in the numbers. "
            "The LCM is the product of the greatest powers of each prime factor involved in the numbers. "
            "An essential formula to remember is: for any two positive integers a and b, the product of HCF of a and b and LCM of a and b is equal to the product of a and b. "
            "Finally, we can rigorously prove that square root of two and square root of three are irrational numbers using the method of contradiction. "
            "Review these core theorems and practice exercise one point one."
        ),
    },
    {
        "filename": "Class9_Science_Motion.mp3",
        "title": "NCERT Class 9 Science - Motion, Velocity and Acceleration",
        "demo_id": "class9-science-motion",
    },
]


def wav_to_mp3(wav_path: Path, mp3_path: Path) -> None:
    """Encode a WAV audio file to MP3 using PyAV."""
    with wave.open(str(wav_path), "rb") as w:
        rate = w.getframerate()

    input_container = av.open(str(wav_path))
    output_container = av.open(str(mp3_path), "w")
    stream = output_container.add_stream("mp3", rate=rate)

    for frame in input_container.decode(audio=0):
        for packet in stream.encode(frame):
            output_container.mux(packet)
    for packet in stream.encode():
        output_container.mux(packet)

    input_container.close()
    output_container.close()


def generate_speech(text: str, wav_path: Path) -> None:
    """Invoke Windows Speech Synthesis to render speech directly to a WAV file."""
    # Escape quotes for PowerShell string
    clean_text = text.replace('"', '""').replace("'", "''")
    ps_script = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.SetOutputToWaveFile('{wav_path.as_posix()}')
$synth.Speak('{clean_text}')
$synth.Dispose()
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_script],
        check=True,
        capture_output=True,
    )


def main() -> None:
    demo_dict = {d.id: d for d in DEMOS}
    print(f"[*] Generating demo MP3 audio files in: {DEMO_AUDIO_DIR}")

    for item in CURATED_LECTURES:
        filename = item["filename"]
        title = item["title"]
        mp3_path = DEMO_AUDIO_DIR / filename
        wav_path = DEMO_AUDIO_DIR / f"{filename}.tmp.wav"

        if "demo_id" in item:
            demo_obj = demo_dict[item["demo_id"]]
            text = " ".join(line.text for line in demo_obj.lines)
        else:
            text = item["text"]

        print(f"[*] Synthesizing: {title} -> {filename}...")
        generate_speech(text, wav_path)

        # Convert to high-quality MP3
        wav_to_mp3(wav_path, mp3_path)
        wav_path.unlink(missing_ok=True)

        size_kb = mp3_path.stat().st_size / 1024
        print(f"[+] Created {filename} ({size_kb:.1f} KB)")

    print("\n[+] All demo MP3 files successfully generated and verified!")


if __name__ == "__main__":
    main()

