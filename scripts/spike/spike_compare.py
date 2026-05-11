"""Phase 1 spike: pull retained audio + compare FA vs Whisper.

Reads a manifest of sessions (produced by SQL → JSON), calls the
spike-audio-url edge function to get a short-lived signed URL for each
audio file, downloads it, runs forced alignment, and writes a per-session
CSV row comparing the new FA scores against the stored Whisper scores.

Usage:
  python spike_compare.py --manifest manifest.json --anon-key sb_publishable_... \\
      --supabase-url https://xxx.supabase.co --out results.csv

The manifest is a JSON array of objects, each shaped like:
  {
    "session_id": "...",
    "passage_text": "...",
    "passage_title": "...",
    "grade_level": "...",
    "difficulty": "...",
    "whisper": { "score_accuracy": 100, "score_wpm": 196, "score_phrasing": 100,
                 "count_omissions": 0, "count_substitutions": 0 }
  }
"""

import argparse
import csv
import json
import sys
import urllib.request
from pathlib import Path

from spike_fa import run_forced_alignment


def get_signed_url(supabase_url: str, anon_key: str, session_id: str) -> str:
    req = urllib.request.Request(
        f"{supabase_url}/functions/v1/spike-audio-url",
        data=json.dumps({"sessionId": session_id}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {anon_key}",
            "apikey": anon_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())
    if "url" not in body:
        raise RuntimeError(f"signed-url failure: {body}")
    return body["url"]


def download(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=60) as resp:
        dest.write_bytes(resp.read())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", required=True)
    p.add_argument("--supabase-url", required=True)
    p.add_argument("--anon-key", required=True)
    p.add_argument("--out", default="../../spike-audio/results.csv")
    p.add_argument("--detail-dir", default="../../spike-audio/details")
    p.add_argument("--audio-dir", default="../../spike-audio/files")
    args = p.parse_args()

    sessions = json.loads(Path(args.manifest).read_text())
    print(f"[compare] {len(sessions)} session(s) to process", file=sys.stderr)
    Path(args.detail_dir).mkdir(parents=True, exist_ok=True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for i, s in enumerate(sessions, 1):
        sid = s["session_id"]
        title = s.get("passage_title", "(unknown)")
        text = s["passage_text"]
        print(f"\n[{i}/{len(sessions)}] {sid}: '{title}'", file=sys.stderr)

        try:
            url = get_signed_url(args.supabase_url, args.anon_key, sid)
        except Exception as e:
            print(f"  signed URL failed: {e}", file=sys.stderr)
            continue

        audio_path = Path(args.audio_dir) / f"{sid}.webm"
        try:
            download(url, audio_path)
        except Exception as e:
            print(f"  download failed: {e}", file=sys.stderr)
            continue

        try:
            fa = run_forced_alignment(str(audio_path), text)
        except Exception as e:
            print(f"  FA failed: {e}", file=sys.stderr)
            import traceback; traceback.print_exc(file=sys.stderr)
            continue

        Path(args.detail_dir, f"{sid}.json").write_text(json.dumps(fa, indent=2))

        w = s["whisper"]
        gap = w["score_accuracy"] - fa["score_accuracy"]
        rows.append({
            "session_id": sid,
            "passage": title,
            "grade": s.get("grade_level"),
            "difficulty": s.get("difficulty"),
            "word_count": fa["word_count"],
            "whisper_acc": w["score_accuracy"],
            "fa_acc": fa["score_accuracy"],
            "gap_acc": gap,
            "whisper_wpm": w["score_wpm"],
            "fa_wpm": fa["score_wpm"],
            "whisper_phrasing": w["score_phrasing"],
            "fa_phrasing": fa["score_phrasing"],
            "whisper_omissions": w["count_omissions"],
            "fa_omissions": fa["count_omissions"],
            "whisper_subs": w["count_substitutions"],
            "fa_subs": fa["count_substitutions"],
            "duration_s": fa["duration_seconds"],
            "manual_verdict": "",
            "notes": "",
        })
        print(f"  whisper_acc={w['score_accuracy']}  fa_acc={fa['score_accuracy']}  gap={gap:+d}", file=sys.stderr)

    if rows:
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nWrote {args.out} ({len(rows)} rows).", file=sys.stderr)
        avg_gap = sum(r["gap_acc"] for r in rows) / len(rows)
        print(f"Mean accuracy gap (whisper − fa): {avg_gap:+.1f} points", file=sys.stderr)


if __name__ == "__main__":
    main()
