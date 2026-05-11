"""Generate seed SQL from entries.json. Splits into chunks small enough for one execute_sql call."""
import json
from pathlib import Path

here = Path(__file__).parent
data = json.loads((here / "entries.json").read_text(encoding="utf-8"))
entries = data["entries"]

CHUNK_SIZE = 200  # 200 entries per file

def sql_escape(s):
    return s.replace("'", "''")

chunks = [entries[i:i+CHUNK_SIZE] for i in range(0, len(entries), CHUNK_SIZE)]

for idx, chunk in enumerate(chunks, 1):
    out = []
    out.append("insert into vocabulary_words (word, part_of_speech, definition, example_sentence, synonyms, antonyms, difficulty) values")
    rows = []
    for e in chunk:
        word = sql_escape(e["word"])
        pos = sql_escape(e["part_of_speech"])
        defn = sql_escape(e["definition"])
        ex = sql_escape(e["example_sentence"])
        syn_json = sql_escape(json.dumps(e["synonyms"], ensure_ascii=False))
        ant_json = sql_escape(json.dumps(e["antonyms"], ensure_ascii=False))
        diff = e["difficulty"]
        rows.append(f"  ('{word}', '{pos}', '{defn}', '{ex}', '{syn_json}'::jsonb, '{ant_json}'::jsonb, '{diff}')")
    out.append(",\n".join(rows))
    out.append("on conflict (word) do nothing;")
    sql = "\n".join(out)
    (here / f"seed_chunk_{idx:02d}.sql").write_text(sql, encoding="utf-8")
    print(f"chunk {idx}: {len(chunk)} entries, {len(sql):,} chars")

print(f"\nTotal: {len(entries)} entries in {len(chunks)} chunks")
