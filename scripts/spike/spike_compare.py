"""Phase 1 spike: pull retained audio + compare FA vs Whisper.

Reads a manifest of sessions (built by build_manifest.py), signs the
storage path directly via the service-role-authenticated Storage API,
downloads the audio, runs forced alignment, and writes a per-session CSV
row comparing the new FA scores against the stored Whisper scores.

Usage:
  python spike_compare.py --manifest ../../spike-audio/manifest_round2b.json \\
      --supabase-url https://xxx.supabase.co \\
      --service-role-key $env:SUPABASE_SERVICE_ROLE_KEY \\
      --out ../../spike-audio/results_round2b.csv \\
      --detail-dir ../../spike-audio/details_round2b \\
      --audio-dir ../../spike-audio/files_round2b

The manifest is a JSON array of objects, each shaped like:
  {
    "session_id": "...",
    "retained_audio_path": "<student_id>/<timestamp>.webm",
    "passage_text": "...",
    "passage_title": "...",
    "grade_level": "...",
    "difficulty": "...",
    "whisper": { "score_accuracy": 100, "score_wpm": 196, "score_phrasing": 100,
                 "count_omissions": 0, "count_substitutions": 0 }
  }

This is a local research script — it talks to the Storage API with the
service-role key directly, bypassing the teacher-JWT-gated
retained-audio-url edge function (which exists for the browser teacher
dashboard, not local scripts).
"""

import argparse
import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from spike_fa import run_forced_alignment


def sign_storage_path(supabase_url: str, sr_key: str, bucket: str, path: str,
                      expires_in: int = 600) -> str:
    """Mint a signed URL for a storage object using service-role auth."""
    encoded_path = urllib.parse.quote(path, safe="/")
    req = urllib.request.Request(
        f"{supabase_url}/storage/v1/object/sign/{bucket}/{encoded_path}",
        data=json.dumps({"expiresIn": expires_in}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {sr_key}",
            "apikey": sr_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())
    signed = body.get("signedURL") or body.get("signedUrl")
    if not signed:
        raise RuntimeError(f"sign failure: {body}")
    # Storage returns a path like "/object/sign/..."; prepend the host + /storage/v1
    if signed.startswith("/"):
        return f"{supabase_url}/storage/v1{signed}"
    return signed


def download(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=60) as resp:
        dest.write_bytes(resp.read())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", required=True)
    p.add_argument("--supabase-url", required=True)
    p.add_argument("--service-role-key", required=True,
                   help="Supabase service-role key (from env $SUPABASE_SERVICE_ROLE_KEY)")
    p.add_argument("--bucket", default="audio")
    p.add_argument("--out", default="../../spike-audio/results.csv")
    p.add_argument("--detail-dir", default="../../spike-audio/details")
    p.add_argument("--audio-dir", default="../../spike-audio/files")
    args = p.parse_args()

    sessions = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    print(f"[compare] {len(sessions)} session(s) to process", file=sys.stderr)
    Path(args.detail_dir).mkdir(parents=True, exist_ok=True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for i, s in enumerate(sessions, 1):
        sid = s["session_id"]
        title = s.get("passage_title", "(unknown)")
        text = s["passage_text"]
        storage_path = s.get("retained_audio_path")
        print(f"\n[{i}/{len(sessions)}] {sid}: '{title}'", file=sys.stderr)

        if not storage_path:
            print(f"  no retained_audio_path in manifest — skipping", file=sys.stderr)
            continue

        try:
            url = sign_storage_path(args.supabase_url, args.service_role_key,
                                    args.bucket, storage_path)
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
