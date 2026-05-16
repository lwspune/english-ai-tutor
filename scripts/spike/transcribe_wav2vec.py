"""Free-form wav2vec2 transcription of one or more audio files.

Used to spot-check whether FA's confidence scores are honest, AND to
detect AI-assistant cheating (chatbot reading the passage to the student).
The acoustic-only model has no LM, so it can't hallucinate coherent
conversational phrases — if "would you like me to continue" appears in a
transcript, it was in the audio.

Usage:
  python transcribe_wav2vec.py --audio f1.webm f2.webm ...
"""

import argparse
import sys

import torch
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

from spike_fa import MODEL_NAME, TARGET_SR, decode_to_pcm


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--audio", nargs="+", required=True)
    args = p.parse_args()

    print(f"Loading {MODEL_NAME}...", file=sys.stderr)
    processor = Wav2Vec2Processor.from_pretrained(MODEL_NAME)
    model = Wav2Vec2ForCTC.from_pretrained(MODEL_NAME).eval()

    for audio in args.audio:
        print(f"\n=== {audio} ===", file=sys.stderr)
        try:
            waveform = decode_to_pcm(audio)
        except Exception as e:
            print(f"  decode failed: {e}", file=sys.stderr)
            continue
        duration_s = len(waveform) / TARGET_SR
        print(f"  duration: {duration_s:.2f}s", file=sys.stderr)

        inputs = processor(waveform, sampling_rate=TARGET_SR, return_tensors="pt", padding=True)
        with torch.no_grad():
            logits = model(inputs.input_values).logits
        pred_ids = torch.argmax(logits, dim=-1)
        transcript = processor.batch_decode(pred_ids)[0]

        print(f"--- TRANSCRIPT ({audio}) ---")
        print(transcript)


if __name__ == "__main__":
    main()
