"""Combine batch_*.json into entries.json and generate insert SQL."""
import json
import re
from pathlib import Path

here = Path(__file__).parent

# Batch 1 was named entries.json; everything else is batch_NN.json
batch_files = sorted(here.glob("batch_*.json"))
first_file = here / "entries.json"  # original batch 1 (30 entries)

all_entries = []
seen_words = set()
dup_words = []

def add_entries(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    for e in data["entries"]:
        w = e["word"]
        if w in seen_words:
            dup_words.append(w)
            continue
        seen_words.add(w)
        all_entries.append(e)

# Read original entries.json (batch 1) first, then batch_02 onwards
if first_file.exists() and not str(first_file).endswith("batch_01.json"):
    # check if entries.json is actually batch 1 (30 entries) or already consolidated
    test = json.loads(first_file.read_text(encoding="utf-8"))
    if len(test.get("entries", [])) <= 35:
        add_entries(first_file)

for bf in batch_files:
    add_entries(bf)

# Write consolidated entries.json (overwrite)
out = {"entries": all_entries}
(here / "entries.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

# Validation report
print(f"Total entries: {len(all_entries)}")
print(f"Unique words: {len(seen_words)}")
print(f"Duplicates skipped: {len(dup_words)}")
if dup_words:
    print(f"  duplicate words: {dup_words[:10]}")

# Quick sanity: every entry has required fields
required = {"word", "part_of_speech", "definition", "example_sentence", "synonyms", "antonyms", "difficulty"}
malformed = []
for e in all_entries:
    missing = required - set(e.keys())
    if missing:
        malformed.append((e.get("word", "??"), missing))
if malformed:
    print(f"\nMALFORMED ENTRIES: {len(malformed)}")
    for w, m in malformed[:5]:
        print(f"  {w}: missing {m}")
else:
    print("\nAll entries well-formed.")

# Difficulty distribution
from collections import Counter
diff_counts = Counter(e["difficulty"] for e in all_entries)
print(f"\nDifficulty distribution: {dict(diff_counts)}")

# Part-of-speech distribution
pos_counts = Counter(e["part_of_speech"] for e in all_entries)
print(f"Part-of-speech distribution: {dict(pos_counts)}")
