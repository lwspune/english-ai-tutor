"""One-shot seed of MP3 pronunciation for every vocabulary word.

Calls generate-vocab-audio in a poll loop. The edge function fetches its own
batch of pending words server-side (anon can't read vocabulary_words). We
keep calling until remaining_pending = 0. Idempotent — words that already
have audio_path are skipped. ~$0.13 total OpenAI cost for all 865 words.
"""

import json
import os
import sys
import time
import urllib.request

SUPABASE_URL = "https://ixxrwbvrkkrlzwizloai.supabase.co"
ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "sb_publishable_681tDNx_2QF_CTwAs-6Zlg_WBZVtqss")
BATCH = 20  # server caps at 30; 20 leaves headroom under the 60s edge-function timeout


def run_batch(limit: int = BATCH) -> dict:
    body = json.dumps({"limit": limit}).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/generate-vocab-audio",
        data=body,
        headers={
            "Content-Type": "application/json",
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def main():
    total_generated = 0
    total_failed = 0
    iteration = 0
    while True:
        iteration += 1
        try:
            res = run_batch()
        except Exception as e:
            print(f"  batch {iteration} request failed: {e}", file=sys.stderr)
            time.sleep(2)
            continue

        results = res.get("results", [])
        remaining = res.get("remaining_pending", 0)
        gen = sum(1 for r in results if r.get("status") == "generated")
        fail = sum(1 for r in results if r.get("status") == "failed")
        total_generated += gen
        total_failed += fail
        print(f"Batch {iteration}: generated {gen}, failed {fail}, remaining pending {remaining}", file=sys.stderr)
        if fail:
            failures = [r for r in results if r.get("status") == "failed"][:3]
            print(f"  sample failures: {failures}", file=sys.stderr)
        if not results and remaining == 0:
            break
        if not results:
            # Edge function returned nothing but pending > 0 — bail to avoid infinite loop
            print(f"  no rows processed but {remaining} still pending — stopping", file=sys.stderr)
            break
        time.sleep(0.5)

    print(f"\nDone. Generated {total_generated}, failed {total_failed}.", file=sys.stderr)


if __name__ == "__main__":
    main()
