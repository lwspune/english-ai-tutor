"""Phase 1 spike: forced-alignment scoring on a single audio clip.

Loads wav2vec2-base-960h, decodes audio via ffmpeg, runs CTC forced alignment
against the expected passage text, and emits per-word scores + summary metrics.

NO accent rules are applied here — this script reports raw FA confidence so
we can honestly compare against Whisper. Accent rule layer is Phase 1 Step 4
of the production service, not the spike.

Usage:
  python spike_fa.py --audio path/to/audio.webm --text "expected passage" --out result.json
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
import torch
from torchaudio.functional import forced_align, merge_tokens
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

try:
    import imageio_ffmpeg
    FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG_BIN = "ffmpeg"

MODEL_NAME = "facebook/wav2vec2-base-960h"
TARGET_SR = 16_000
PAUSE_THRESHOLD = 0.4
WORD_CONFIDENCE_THRESHOLD = 0.30
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def normalize_word(w: str) -> str:
    return re.sub(r"[^a-z]", "", w.lower())


def decode_to_pcm(audio_path: str) -> np.ndarray:
    """Decode any audio file to mono 16kHz float32 PCM via ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        subprocess.run(
            [
                FFMPEG_BIN, "-y", "-loglevel", "error",
                "-i", audio_path,
                "-ac", "1", "-ar", str(TARGET_SR),
                "-f", "wav", tmp_path,
            ],
            check=True,
        )
        with wave.open(tmp_path, "rb") as wf:
            if wf.getframerate() != TARGET_SR:
                raise RuntimeError(f"Expected {TARGET_SR} Hz, got {wf.getframerate()}")
            if wf.getnchannels() != 1:
                raise RuntimeError(f"Expected mono, got {wf.getnchannels()} channels")
            frames = wf.readframes(wf.getnframes())
        samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        return samples
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def build_targets(words: list[str], processor) -> tuple[list[int], list[tuple[int, int]]]:
    """Build CTC target token sequence with '|' separators.
    Returns (token_ids, word_to_token_range) where each range is [start, end)
    in the token_ids list, EXCLUDING separators."""
    vocab = processor.tokenizer.get_vocab()
    word_sep_id = vocab["|"]

    token_ids: list[int] = []
    word_ranges: list[tuple[int, int]] = []
    for i, w in enumerate(words):
        cw = normalize_word(w)
        start = len(token_ids)
        for ch in cw.upper():
            if ch in vocab:
                token_ids.append(vocab[ch])
        end = len(token_ids)
        word_ranges.append((start, end))
        if i < len(words) - 1:
            token_ids.append(word_sep_id)
    return token_ids, word_ranges


def score_word(spans, char_start: int, char_end: int) -> tuple[float | None, int | None, int | None]:
    """Given the merged token-span list (one entry per target token, in order),
    slice [char_start, char_end) for this word and return (avg_linear_prob, first_frame, last_frame)."""
    relevant = spans[char_start:char_end]
    if not relevant:
        return None, None, None
    avg = float(np.mean([float(np.exp(s.score)) for s in relevant]))
    return avg, relevant[0].start, relevant[-1].end


def run_forced_alignment(audio_path: str, expected_text: str) -> dict:
    processor = Wav2Vec2Processor.from_pretrained(MODEL_NAME)
    model = Wav2Vec2ForCTC.from_pretrained(MODEL_NAME).to(DEVICE).eval()

    waveform = decode_to_pcm(audio_path)
    duration_s = len(waveform) / TARGET_SR

    words = [w for w in re.split(r"\s+", expected_text.strip()) if w]
    token_ids, word_ranges = build_targets(words, processor)

    inputs = processor(waveform, sampling_rate=TARGET_SR, return_tensors="pt", padding=True)
    with torch.no_grad():
        logits = model(inputs.input_values.to(DEVICE)).logits
    log_probs = torch.log_softmax(logits, dim=-1).cpu()
    n_frames = log_probs.shape[1]
    frame_dur = duration_s / n_frames

    targets = torch.tensor([token_ids], dtype=torch.int32)
    aligned_tokens, alignment_scores = forced_align(log_probs, targets, blank=0)
    spans = merge_tokens(aligned_tokens[0], alignment_scores[0])
    # `token` in each span is the index into the targets[0] tensor (not the vocab id).

    word_results = []
    for i, (start_idx, end_idx) in enumerate(word_ranges):
        # word_ranges indexes into `token_ids`, but separators are also in token_ids.
        # The token-index space in spans aligns to positions in targets[0] = token_ids.
        # Since the ranges already exclude separators, we filter spans by token index.
        avg, frame_start, frame_end = score_word(spans, start_idx, end_idx)
        if avg is None:
            word_results.append({
                "word": words[i],
                "spoken": "",
                "status": "omission",
                "score": 0.0,
                "start": None,
                "end": None,
                "accent_tolerated": False,
            })
            continue
        status = "correct" if avg >= WORD_CONFIDENCE_THRESHOLD else "substitution"
        word_results.append({
            "word": words[i],
            "spoken": words[i] if status == "correct" else "(low_conf)",
            "status": status,
            "score": round(avg, 3),
            "start": round(frame_start * frame_dur, 2),
            "end": round(frame_end * frame_dur, 2),
            "accent_tolerated": False,
        })

    correct = sum(1 for w in word_results if w["status"] == "correct")
    omissions = sum(1 for w in word_results if w["status"] == "omission")
    subs = sum(1 for w in word_results if w["status"] == "substitution")
    score_accuracy = round(100 * correct / max(len(words), 1))

    long_pauses = 0
    at_punct = 0
    for i in range(len(word_results) - 1):
        cur, nxt = word_results[i], word_results[i + 1]
        if cur["end"] is None or nxt["start"] is None:
            continue
        gap = nxt["start"] - cur["end"]
        if gap >= PAUSE_THRESHOLD:
            long_pauses += 1
            if cur["word"].rstrip()[-1:] in ".,!?;:":
                at_punct += 1
    score_phrasing = 100 if long_pauses == 0 else round(100 * at_punct / long_pauses)
    score_wpm = round((len(words) / duration_s) * 60) if duration_s > 0 else 0

    return {
        "engine_version": "fa-spike-v1",
        "model": MODEL_NAME,
        "duration_seconds": round(duration_s, 2),
        "score_accuracy": score_accuracy,
        "score_wpm": score_wpm,
        "score_phrasing": score_phrasing,
        "count_omissions": omissions,
        "count_substitutions": subs,
        "word_count": len(words),
        "word_results": word_results,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--audio", required=True)
    p.add_argument("--text", required=True)
    p.add_argument("--out", default="-")
    args = p.parse_args()

    result = run_forced_alignment(args.audio, args.text)
    out_str = json.dumps(result, indent=2)
    if args.out == "-":
        print(out_str)
    else:
        Path(args.out).write_text(out_str)
        print(f"Wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
