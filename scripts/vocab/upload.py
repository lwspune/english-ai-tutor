"""Upload entries.json to Supabase via vocab-insert edge function in batches."""
import json
import sys
import urllib.request
from pathlib import Path

SUPABASE_URL = "https://ixxrwbvrkkrlzwizloai.supabase.co"
ANON_KEY = "sb_publishable_681tDNx_2QF_CTwAs-6Zlg_WBZVtqss"

here = Path(__file__).parent
data = json.loads((here / "entries.json").read_text(encoding="utf-8"))
entries = data["entries"]

BATCH = 100
total_uploaded = 0
for i in range(0, len(entries), BATCH):
    batch = entries[i:i+BATCH]
    body = json.dumps({"entries": batch}).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/vocab-insert",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ANON_KEY}",
            "apikey": ANON_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            n = result.get("inserted_or_updated", len(batch))
            total_uploaded += n
            print(f"batch {i//BATCH + 1}: {n} rows  (total {total_uploaded}/{len(entries)})", file=sys.stderr)
    except urllib.error.HTTPError as e:
        print(f"FAIL batch starting at {i}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)

print(f"\nDone. Uploaded {total_uploaded} rows.", file=sys.stderr)
