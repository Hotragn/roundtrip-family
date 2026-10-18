"""Export every Telugu text a parent sees, with the clip that reads it, for a native-speaker review.

    uv run python -m speech.review    # writes docs/review/telugu-review.csv and docs/review/index.html

Reads the demo weeks (cards, steps, phrase meanings and spellings, everything else in Telugu
script), the synthetic diary and apps/web/messages/te.json. A row's clip is the one voicing that
exact text; a phrase's Telugu meaning and spelling point to the clip of the phrase itself. The
review columns start empty: only a reviewer fills them (docs/review/README.md). Stdlib only.
"""

from __future__ import annotations

import csv
import html
import json
import re
from pathlib import Path

from .sources import DIARY_PATH, MANIFEST_PATH, REPO, WEEKS_DIR, clip_key

MESSAGES_TE = REPO / "apps" / "web" / "messages" / "te.json"
REVIEW_DIR = REPO / "docs" / "review"
TELUGU = re.compile(r"[\u0C00-\u0C7F]")
COLUMNS = ["id", "source", "where", "text", "clip", "heard_with", "natural", "correct", "fix", "notes"]


def walk(node, path=""):
    """(json path, string) for every string in a JSON tree."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")
    elif isinstance(node, str):
        yield path, node


def rows(weeks_dir: Path = WEEKS_DIR, diary_path: Path = DIARY_PATH, messages: Path = MESSAGES_TE, manifest_path: Path = MANIFEST_PATH) -> list[dict]:
    clips = json.loads(manifest_path.read_text(encoding="utf-8"))["clips"] if manifest_path.exists() else {}

    def clip_for(lang: str, text: str) -> str:
        key = clip_key(lang, text)
        return f"apps/web/public/audio/{key}.mp3" if key in clips else ""

    out: list[dict] = []

    def add(source: str, where: str, text: str, clip: str = "", heard_with: str = "") -> None:
        if TELUGU.search(text):
            out.append({"source": source, "where": where, "text": text, "clip": clip, "heard_with": heard_with})

    docs = [(p.name, json.loads(p.read_text(encoding="utf-8"))) for p in sorted(weeks_dir.glob("*.json"))]
    if diary_path.exists():
        docs.append((diary_path.name, json.loads(diary_path.read_text(encoding="utf-8"))))
    for name, doc in docs:
        local = doc.get("household", {}).get("localLanguage", "")
        for where, text in walk(doc):
            clip, heard = clip_for("te", text), ""
            phrase = re.match(r"(.*\.phrases\[\d+\])\.(meaning|pronunciation)$", where)
            if phrase and not clip:
                node = doc
                for part in re.findall(r"[^.\[\]]+", phrase.group(1)):
                    node = node[int(part)] if part.isdigit() else node[part]
                clip, heard = clip_for(local, node["local"]), node["local"]
            add(name, where, text, clip, heard)
    if messages.exists():
        for where, text in walk(json.loads(messages.read_text(encoding="utf-8"))):
            add(messages.name, where, text)
    for i, row in enumerate(out, start=1):
        row["id"] = i
    return out


def write_csv(items: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:  # the BOM lets Excel read Telugu
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in items:
            w.writerow({c: r.get(c, "") for c in COLUMNS})


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Telugu review</title>
<style>
body{{font:16px/1.5 system-ui,sans-serif;margin:16px;background:#fff;color:#111}}
table{{border-collapse:collapse;width:100%}} td,th{{border:1px solid #ccc;padding:6px;vertical-align:top;text-align:left}}
.te{{font-size:20px}} .where{{color:#555;font-size:13px;word-break:break-all}} textarea{{width:100%;min-height:3em}}
audio{{width:220px}} button{{font-size:16px;padding:8px 14px}}
</style></head><body>
<h1>Telugu review</h1>
<p>{count} texts. For each one, play the clip if there is one, then answer: does it sound natural, is it correct, and what should it say instead. When you finish, press <b>Download my answers</b> and send the file back (see README.md). Answers stay in this page until you download them.</p>
<p><button id="dl">Download my answers</button></p>
<table><thead><tr><th>#</th><th>Text</th><th>Clip</th><th>Natural?</th><th>Correct?</th><th>Fix</th></tr></thead><tbody>
{body}
</tbody></table>
<script>
const cols={columns};
const rows={data};
function pick(id,name){{const el=document.querySelector(`[data-id="${{id}}"][data-f="${{name}}"]`);return el?el.value:""}}
function cell(v){{v=String(v??"");return /[",\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}}
document.getElementById("dl").onclick=()=>{{
  const lines=[cols.join(",")];
  for(const r of rows){{for(const f of ["natural","correct","fix","notes"])r[f]=pick(r.id,f);lines.push(cols.map(c=>cell(r[c])).join(","))}}
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["\\ufeff"+lines.join("\\n")],{{type:"text/csv"}}));
  a.download="telugu-review-answers.csv";a.click();
}};
</script></body></html>
"""


def choice(i: int, field: str) -> str:
    opts = "".join(f"<option>{o}</option>" for o in ("", "yes", "no", "not sure"))
    return f'<select data-id="{i}" data-f="{field}" aria-label="{field} {i}">{opts}</select>'


def write_html(items: list[dict], path: Path) -> None:
    body = []
    for r in items:
        i = r["id"]
        audio = f'<audio controls preload="none" src="../../{html.escape(r["clip"])}"></audio>' if r["clip"] else "no clip"
        if r["heard_with"]:
            audio += f'<div class="where">plays: {html.escape(r["heard_with"])}</div>'
        body.append(
            f'<tr><td>{i}</td><td><div class="te" lang="te">{html.escape(r["text"])}</div>'
            f'<div class="where">{html.escape(r["source"])}: {html.escape(r["where"])}</div></td>'
            f"<td>{audio}</td><td>{choice(i, 'natural')}</td><td>{choice(i, 'correct')}</td>"
            f'<td><textarea data-id="{i}" data-f="fix" aria-label="fix {i}" lang="te"></textarea>'
            f'<textarea data-id="{i}" data-f="notes" aria-label="notes {i}" placeholder="notes"></textarea></td></tr>'
        )
    data = json.dumps([{c: r.get(c, "") for c in COLUMNS} for r in items], ensure_ascii=False).replace("</", "<\\/")
    path.write_text(PAGE.format(count=len(items), body="\n".join(body), columns=json.dumps(COLUMNS), data=data), encoding="utf-8")


def main() -> int:
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    items = rows()
    write_csv(items, REVIEW_DIR / "telugu-review.csv")
    write_html(items, REVIEW_DIR / "index.html")
    print(f"{len(items)} Telugu texts, {sum(1 for r in items if r['clip'])} with a clip, in {REVIEW_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
