"""Second opinion on the catalog's species traits (colour, pattern, body shape, behaviour, social).

The traits were suggested by an AI and never checked by hand. This script shows an OpenAI vision
model each species' catalog photo, description and traits and asks it to report clear errors only.
The findings are a review list, not truth: each one is checked against sources before it is
applied (see TRAITCHECK.md).

  python data-pipeline/traitcheck.py check --model MODEL --price-in USD --price-out USD [--budget 6.5]
      Reviews every species (resumable; results in review/traitcheck.jsonl). Prices are USD per
      1M tokens from openai.com/api/pricing; the run stops before the budget would be exceeded.
  python data-pipeline/traitcheck.py report
      Writes review/traitcheck.md: the flagged species, most certain first, and the total cost.
  python data-pipeline/traitcheck.py apply [--dry-run]
      Applies the accepted fixes in input/trait_fixes.csv to input/traits.csv and patches
      public/catalog/catalog.sqlite (traits, habitat, lifestyle, version) without a full rebuild.

Needs OPENAI_API_KEY in the environment for `check`. Standard library and Pillow only.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIPE = ROOT / "data-pipeline"
CATALOG = ROOT / "public" / "catalog"
DB = CATALOG / "catalog.sqlite"
MANIFEST = CATALOG / "catalog-manifest.json"
TRAITS_CSV = PIPE / "input" / "traits.csv"
TRAITS_JSON = PIPE / "input" / "traits.json"
FIXES_CSV = PIPE / "input" / "trait_fixes.csv"
REVIEW = PIPE / "review"
RESULTS = REVIEW / "traitcheck.jsonl"
REPORT = REVIEW / "traitcheck.md"

# traits.csv column, trait type in traits.json, id prefix
COLUMNS = [
    ("colors", "color", "color-"),
    ("patterns", "pattern", "pattern-"),
    ("shapes", "body_shape", "shape-"),
    ("behaviors", "behavior", "behav-"),
    ("social", "social", "social-"),
]
TYPE_OF_PREFIX = {prefix: ttype for _, ttype, prefix in COLUMNS}
COLUMN_OF_TYPE = {ttype: (col, prefix) for col, ttype, prefix in COLUMNS}
CHECKED_MARK = "ki-geprüft"

SYSTEM_PROMPT = """You review trait annotations in a field guide for recreational divers and snorkellers.
Each species has traits that power an identification filter:
- color: the dominant colours a diver notices on a typical adult
- pattern: the main marking (stripes, bars, spots, eyespot, ...)
- body_shape: the overall form
- behavior: where and how it is usually seen (on the reef, buried in sand, open water, nocturnal, ...)
- social: alone, in pairs, groups, schools or colonies
Judge the species as divers typically see it, using the photo(s) AND your knowledge of the species.
A single photo may show an atypical individual, a juvenile, a colour morph or odd lighting.
Report only clear errors: a listed trait that is wrong for this species, or a clearly missing trait
that a diver would rely on (e.g. a striking colour or pattern). No matters of taste, no minor shades.
When a trait type shows "(none)" but applies to the species (e.g. the body shape of a fish, or
"colony" for a colonial coral), add the fitting trait(s): the filter skips species without one.
Use only trait ids from the allowed list. Return no findings when the annotation is fine; most are.
Also state whether the photo shows this species at all (false only if it clearly shows something
else, e.g. a different animal, a diagram, a map or an aquarium label)."""


# ---------------------------------------------------------------- shared

def vocabulary() -> list[dict]:
    return json.loads(TRAITS_JSON.read_text())


def read_traits_csv() -> tuple[list[str], list[dict], list[str]]:
    """(comment lines, rows, fieldnames) of input/traits.csv."""
    lines = TRAITS_CSV.read_text(encoding="utf-8").splitlines(keepends=True)
    comments = [line for line in lines if line.startswith("#")]
    body = [line for line in lines if not line.startswith("#")]
    reader = csv.DictReader(body, delimiter=";")
    return comments, list(reader), list(reader.fieldnames or [])


def write_traits_csv(comments: list[str], rows: list[dict], fields: list[str]) -> None:
    with TRAITS_CSV.open("w", newline="", encoding="utf-8") as f:
        f.writelines(comments)
        w = csv.DictWriter(f, fieldnames=fields, delimiter=";", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def catalog_species(con: sqlite3.Connection) -> list[dict]:
    con.row_factory = sqlite3.Row
    species = [dict(r) for r in con.execute(
        "SELECT id, scientific_name, common_name_de, common_name_en, category, family, description_en, habitat, lifestyle "
        "FROM species ORDER BY popularity DESC, scientific_name")]
    traits: dict[str, list[str]] = {}
    for r in con.execute("SELECT species_id, trait_id FROM species_trait"):
        traits.setdefault(r["species_id"], []).append(r["trait_id"])
    photos: dict[str, list[str]] = {}
    for r in con.execute("SELECT species_id, file FROM species_photo ORDER BY species_id, sort"):
        photos.setdefault(r["species_id"], []).append(r["file"])
    for s in species:
        s["traits"] = sorted(traits.get(s["id"], []))
        s["photos"] = photos.get(s["id"], [])
    return species


# ---------------------------------------------------------------- check

def output_schema(trait_ids: list[str]) -> dict:
    finding = {
        "type": "object",
        "properties": {
            "trait_type": {"type": "string", "enum": [t for _, t, _ in COLUMNS]},
            "remove": {"type": "array", "items": {"type": "string", "enum": trait_ids}},
            "add": {"type": "array", "items": {"type": "string", "enum": trait_ids}},
            "confidence": {"type": "string", "enum": ["high", "medium"]},
            "reason": {"type": "string"},
        },
        "required": ["trait_type", "remove", "add", "confidence", "reason"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "photo_shows_species": {"type": "boolean"},
            "photo_note": {"type": "string"},
            "findings": {"type": "array", "items": finding},
        },
        "required": ["photo_shows_species", "photo_note", "findings"],
        "additionalProperties": False,
    }


def species_prompt(s: dict, vocab: list[dict]) -> str:
    allowed = [t for t in vocab if s["category"] in t["applies_to"].split(",")]
    names = " / ".join(n for n in (s.get("common_name_en"), s.get("common_name_de")) if n)
    lines = [
        f"Species: {s['scientific_name']}" + (f" ({names})" if names else ""),
        f"Family: {s.get('family') or 'unknown'}; category: {s['category']}",
        f"Description: {(s.get('description_en') or '').strip()[:900]}",
        "",
        "Current traits:",
    ]
    for _, ttype, _ in COLUMNS:
        mine = [t for t in s["traits"] if any(v["id"] == t and v["type"] == ttype for v in vocab)]
        lines.append(f"- {ttype}: {', '.join(mine) if mine else '(none)'}")
    lines += ["", "Allowed traits for this category:"]
    for _, ttype, _ in COLUMNS:
        opts = [f"{t['id']} ({t['label_en']})" for t in allowed if t["type"] == ttype]
        if opts:
            lines.append(f"- {ttype}: {', '.join(opts)}")
    return "\n".join(lines)


def image_part(file: str, detail: str) -> dict:
    path = CATALOG / file
    mime = "image/webp" if path.suffix == ".webp" else "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode()
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}", "detail": detail}}


def call_openai(payload: dict, key: str) -> dict:
    body = json.dumps(payload).encode()
    for attempt in range(6):
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")[:500]
            if e.code in (429, 500, 502, 503) and "insufficient_quota" not in text:
                time.sleep(2 ** attempt * 2)
                continue
            raise RuntimeError(f"OpenAI {e.code}: {text}") from None
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt * 2)
    raise RuntimeError("OpenAI: no answer after several attempts")


def load_results() -> dict[str, dict]:
    if not RESULTS.exists():
        return {}
    out = {}
    for line in RESULTS.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            out[r["id"]] = r
    return out


def cmd_check(args: argparse.Namespace) -> None:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("OPENAI_API_KEY is not set (add it in the environment settings and start a new session).")
    vocab = vocabulary()
    trait_ids = [t["id"] for t in vocab]
    schema = output_schema(trait_ids)
    con = sqlite3.connect(DB)
    species = catalog_species(con)
    con.close()
    done = load_results()
    spent = sum(r["cost"] for r in done.values())
    todo = [s for s in species if s["id"] not in done and s["photos"]]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(done)} already checked (${spent:.3f}), {len(todo)} to go, budget ${args.budget:.2f}")
    REVIEW.mkdir(exist_ok=True)
    lock = threading.Lock()
    state = {"spent": spent, "count": 0, "stop": False, "per_species": None}

    def run(s: dict) -> None:
        with lock:
            # Stop before a request could take the total over budget (estimate: 3x the average so far).
            reserve = 3 * (state["per_species"] or 0.02)
            if state["stop"] or state["spent"] + reserve > args.budget:
                state["stop"] = True
                return
        content = [{"type": "text", "text": species_prompt(s, vocab)}]
        content += [image_part(f, args.detail) for f in s["photos"][: args.photos]]
        payload = {
            "model": args.model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "trait_review", "strict": True, "schema": schema}},
            "max_completion_tokens": args.max_output,
        }
        if args.reasoning:
            payload["reasoning_effort"] = args.reasoning
        try:
            res = call_openai(payload, key)
        except RuntimeError as e:
            with lock:
                state["stop"] = True
            print(f"stopped at {s['scientific_name']}: {e}", file=sys.stderr)
            return
        usage = res.get("usage") or {}
        cost = (usage.get("prompt_tokens", 0) * args.price_in + usage.get("completion_tokens", 0) * args.price_out) / 1e6
        message = res["choices"][0]["message"]
        try:
            result = json.loads(message.get("content") or "")
        except json.JSONDecodeError:
            result = {"error": "unparsable", "raw": (message.get("content") or message.get("refusal") or "")[:500]}
        row = {
            "id": s["id"],
            "scientific_name": s["scientific_name"],
            "model": res.get("model", args.model),
            "traits": s["traits"],
            "photos": s["photos"][: args.photos],
            "usage": {"in": usage.get("prompt_tokens", 0), "out": usage.get("completion_tokens", 0)},
            "cost": round(cost, 6),
            "result": result,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        with lock:
            with RESULTS.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            state["spent"] += cost
            state["count"] += 1
            state["per_species"] = (state["spent"] - spent) / state["count"]
            if state["count"] % 25 == 0 or state["count"] == len(todo):
                print(f"  {state['count']}/{len(todo)}  ${state['spent']:.3f}  (~${state['per_species']:.4f} per species)")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(run, todo))
    total = len(load_results())
    print(f"checked {total}/{len(species)} species, total ${state['spent']:.3f}" + (" (stopped early)" if state["stop"] else ""))


# ---------------------------------------------------------------- report

def cmd_report(_: argparse.Namespace) -> None:
    results = load_results()
    vocab = {t["id"]: t for t in vocabulary()}
    label = lambda i: f"{i} ({vocab[i]['label_de']})" if i in vocab else i  # noqa: E731
    flagged = []
    photos = []
    for r in results.values():
        res = r["result"]
        if "error" in res:
            flagged.append((2, r, [("error", res.get("raw", ""))]))
            continue
        if not res.get("photo_shows_species", True):
            photos.append(r)
        items = []
        rank = 1
        for f in res.get("findings", []):
            if not f["remove"] and not f["add"]:
                continue
            if f["confidence"] == "high":
                rank = 0
            parts = []
            if f["remove"]:
                parts.append("entfernen: " + ", ".join(label(i) for i in f["remove"]))
            if f["add"]:
                parts.append("ergänzen: " + ", ".join(label(i) for i in f["add"]))
            items.append((f"{f['trait_type']} [{f['confidence']}]", "; ".join(parts) + f" — {f['reason']}"))
        if items:
            flagged.append((rank, r, items))
    flagged.sort(key=lambda x: (x[0], x[1]["scientific_name"]))
    cost = sum(r["cost"] for r in results.values())
    lines = [
        "# Merkmalsprüfung (zweite Meinung per KI)",
        "",
        f"{len(results)} Arten geprüft, {len(flagged)} mit Hinweisen, {len(photos)} Fotos fraglich. Kosten: ${cost:.2f}.",
        "Die Hinweise sind Prüfaufträge, keine Wahrheit: jeder wird vor dem Übernehmen gegen Quellen geprüft.",
        "",
        "## Fragliche Fotos",
        "",
    ]
    lines += [f"- **{r['scientific_name']}** ({', '.join(r['photos'])}): {r['result'].get('photo_note', '')}" for r in photos] or ["- keine"]
    lines += ["", "## Merkmale", ""]
    for _, r, items in flagged:
        lines.append(f"### {r['scientific_name']} (`{r['id']}`)")
        lines.append(f"Jetzt: {', '.join(r['traits']) or '–'}")
        lines += [f"- {k}: {v}" for k, v in items]
        lines.append("")
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{REPORT}: {len(flagged)} species flagged, {len(photos)} photos questioned, ${cost:.2f} spent")


# ---------------------------------------------------------------- apply

HABITAT_TRAITS = {"shape-plant", "behav-buried", "behav-open-water", "behav-reef", "behav-bottom"}


def habitat_for(category: str, old: set[str], new: set[str], current: str | None) -> str | None:
    """The build's habitat rule (pipeline.habitat_of), applied only when a trait it reads changed.
    The build also reads FishBase's DemersPelag, which is not available here: without a deciding
    trait the habitat falls back to reef or bottom."""
    if old & HABITAT_TRAITS == new & HABITAT_TRAITS:
        return current
    if category == "coral_sponge_plant":
        return "seagrass" if "shape-plant" in new else "reef"
    if "behav-buried" in new:
        return "sand"
    if "behav-open-water" in new:
        return "open_water"
    if "behav-reef" in new:
        return "reef"
    if "behav-bottom" in new:
        return "bottom"
    return current if current not in ("sand", "open_water") else "reef"


def lifestyle_for(traits: set[str]) -> str:
    return "sessile" if "behav-sessile" in traits else "nocturnal" if "behav-nocturnal" in traits else "diurnal"


def ids_of_row(row: dict) -> set[str]:
    out = set()
    for col, _, prefix in COLUMNS:
        out |= {prefix + v.strip() for v in (row.get(col) or "").split(",") if v.strip()}
    return out


def set_row_traits(row: dict, traits: set[str]) -> None:
    for col, _, prefix in COLUMNS:
        row[col] = ",".join(sorted(t[len(prefix):] for t in traits if t.startswith(prefix)))


def cmd_apply(args: argparse.Namespace) -> None:
    vocab = vocabulary()
    applies = {t["id"]: t["applies_to"].split(",") for t in vocab}
    fixes = []
    if FIXES_CSV.exists():
        with FIXES_CSV.open(encoding="utf-8") as f:
            fixes = list(csv.DictReader((line for line in f if not line.startswith("#")), delimiter=";"))
    checked = {r["scientific_name"] for r in load_results().values()}
    comments, rows, fields = read_traits_csv()
    by_name = {r["scientific_name"]: r for r in rows}
    con = sqlite3.connect(DB)
    species = {s["scientific_name"]: s for s in catalog_species(con)}

    changed = []
    for fx in fixes:
        name = fx["scientific_name"].strip()
        s = species.get(name)
        if not s:
            sys.exit(f"trait_fixes.csv: {name} is not in the catalog")
        remove = {i.strip() for i in (fx.get("remove") or "").split(",") if i.strip()}
        add = {i.strip() for i in (fx.get("add") or "").split(",") if i.strip()}
        for i in remove | add:
            if i not in applies:
                sys.exit(f"trait_fixes.csv: unknown trait {i} for {name}")
            if s["category"] not in applies[i]:
                sys.exit(f"trait_fixes.csv: {i} does not exist for category {s['category']} ({name})")
        row = by_name.get(name)
        if row is None:  # species built from the automatic suggestion: start from the catalog's traits
            row = {f: "" for f in fields}
            row.update({"scientific_name": name, "common_name_de": ""})
            set_row_traits(row, set(s["traits"]))
            rows.append(row)
            by_name[name] = row
        new = (ids_of_row(row) - remove) | add
        set_row_traits(row, new)
        changed.append((s, new, fx.get("note", "")))

    for r in rows:
        if r["scientific_name"] in checked and r.get("reviewed") in ("ki", "no", ""):
            r["reviewed"] = CHECKED_MARK

    print(f"{len(changed)} species with corrected traits, {len(checked)} marked as {CHECKED_MARK}")
    for s, new, note in changed:
        old = set(s["traits"])
        print(f"  {s['scientific_name']}: -{sorted(old - new)} +{sorted(new - old)}  {note}")
    if args.dry_run:
        con.close()
        return

    write_traits_csv(comments, rows, fields)
    for s, new, _ in changed:
        new = {t for t in new if s["category"] in applies.get(t, [])}
        con.execute("DELETE FROM species_trait WHERE species_id = ?", (s["id"],))
        con.executemany("INSERT INTO species_trait VALUES (?, ?)", [(s["id"], t) for t in sorted(new)])
        con.execute(
            "UPDATE species SET habitat = ?, lifestyle = ? WHERE id = ?",
            (habitat_for(s["category"], set(s["traits"]), new, s["habitat"]), lifestyle_for(new), s["id"]),
        )
    # New catalog version, so installed apps download the corrected catalog.
    all_traits = sorted((sid, tid) for sid, tid in con.execute("SELECT species_id, trait_id FROM species_trait"))
    version = datetime.now(timezone.utc).strftime("%Y.%m.%d") + "-" + hashlib.sha1(json.dumps(all_traits).encode()).hexdigest()[:6]
    built_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    con.execute("UPDATE catalog_meta SET version = ?, built_at = ?", (version, built_at))
    con.commit()
    con.execute("VACUUM")
    con.close()
    manifest = json.loads(MANIFEST.read_text())
    manifest.update({"version": version, "built_at": built_at, "database_bytes": DB.stat().st_size})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    subprocess.run(["node", str(ROOT / "scripts" / "photo-id-index.mjs")], check=True)
    print(f"catalog {version} written")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--model", required=True)
    c.add_argument("--price-in", type=float, required=True, help="USD per 1M input tokens")
    c.add_argument("--price-out", type=float, required=True, help="USD per 1M output tokens (incl. reasoning)")
    c.add_argument("--budget", type=float, default=6.5, help="stop before total cost (incl. earlier runs) exceeds this")
    c.add_argument("--limit", type=int, default=0, help="only the next N species (pilot run)")
    c.add_argument("--photos", type=int, default=1, help="photos per species (1-3)")
    c.add_argument("--detail", default="auto", choices=["low", "high", "auto"])
    c.add_argument("--reasoning", default="", help="reasoning_effort for reasoning models, e.g. low")
    c.add_argument("--max-output", type=int, default=3000)
    c.add_argument("--workers", type=int, default=4)
    c.set_defaults(func=cmd_check)
    r = sub.add_parser("report")
    r.set_defaults(func=cmd_report)
    a = sub.add_parser("apply")
    a.add_argument("--dry-run", action="store_true")
    a.set_defaults(func=cmd_apply)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
