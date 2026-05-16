"""Build a spike manifest by pulling the currently-retained sessions.

Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env, queries PostgREST
for sessions with retained_audio_path set, joins passages, and writes a
JSON array shaped for spike_compare.py.

Usage:
  python build_manifest.py --out ../../spike-audio/manifest_round2b.json
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    args = p.parse_args()

    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    select = (
        "id,retained_audio_path,score_accuracy,score_wpm,score_phrasing,"
        "count_omissions,count_substitutions,created_at,"
        "profiles(full_name,grade),"
        "passages(title,content,grade_level,difficulty,word_count)"
    )
    query = urllib.parse.urlencode({
        "select": select,
        "retained_audio_path": "not.is.null",
        "order": "created_at.desc",
    })

    req = urllib.request.Request(
        f"{url}/rest/v1/sessions?{query}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read())

    out = []
    for r in rows:
        passages = r.get("passages") or {}
        profiles = r.get("profiles") or {}
        out.append({
            "session_id": r["id"],
            "retained_audio_path": r.get("retained_audio_path"),
            "passage_title": passages.get("title"),
            "grade_level": passages.get("grade_level"),
            "difficulty": passages.get("difficulty"),
            "word_count": passages.get("word_count"),
            "student_name": profiles.get("full_name"),
            "student_grade": profiles.get("grade"),
            "passage_text": passages.get("content"),
            "whisper": {
                "score_accuracy": r["score_accuracy"],
                "score_wpm": r["score_wpm"],
                "score_phrasing": r["score_phrasing"],
                "count_omissions": r["count_omissions"],
                "count_substitutions": r["count_substitutions"],
            },
        })

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"Wrote {args.out} ({len(out)} sessions).", file=sys.stderr)


if __name__ == "__main__":
    main()
