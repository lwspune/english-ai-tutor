"""Quick per-word analysis of spike detail JSON for manual review."""
import json
import sys
from pathlib import Path
from statistics import mean, median


def report(label, path):
    d = json.loads(Path(path).read_text())
    ws = d["word_results"]
    correct = [w for w in ws if w["status"] == "correct"]
    subs = [w for w in ws if w["status"] == "substitution"]
    oms = [w for w in ws if w["status"] == "omission"]
    scores = [w["score"] for w in ws if w["score"] > 0]
    print(f"\n=== {label} ===")
    print(f"FA accuracy: {d['score_accuracy']}%  duration: {d['duration_seconds']}s  WPM: {d['score_wpm']}")
    print(f"counts: {len(correct)} correct, {len(subs)} subs, {len(oms)} omissions")
    print(f"score range: min={min(scores):.3f}  median={median(scores):.3f}  mean={mean(scores):.3f}  max={max(scores):.3f}")
    print(f"\nLow-scoring (called substitution, threshold 0.30):")
    for w in sorted(subs, key=lambda x: x["score"]):
        print(f"  {w['score']:.3f}  {w['word']}")
    print(f"\nOmissions (no acoustic signal found):")
    for w in oms:
        print(f"  {w['word']}")
    print(f"\nLowest-scoring correct words (just above threshold):")
    for w in sorted(correct, key=lambda x: x["score"])[:8]:
        print(f"  {w['score']:.3f}  {w['word']}")


if __name__ == "__main__":
    report("Session 1: clean read (Whisper 100%)",
           Path(__file__).parent / "../../spike-audio/details/dd924006-11f0-4967-bb47-953be70b2d09.json")
    report("Session 2: disfluent (Whisper 66%)",
           Path(__file__).parent / "../../spike-audio/details/d3f3bccf-113e-43f9-8a62-cb3355292cbc.json")
