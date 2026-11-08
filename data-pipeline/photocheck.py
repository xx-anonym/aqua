"""Catalog photo check: are the species photos living animals as divers see them?

The automatic photo choice (most-voted iNaturalist observations) sometimes picks a stranded fish,
a catch in someone's hand, a museum specimen or a drawing. This script lets an OpenAI vision model
classify every catalog photo, then finds better ones:

  python data-pipeline/photocheck.py check --model MODEL --price-in USD --price-out USD [--budget 1.9]
      Classifies the catalog photos of every species (resumable; review/photocheck.jsonl).
  python data-pipeline/photocheck.py candidates --model MODEL --price-in USD --price-out USD [--budget ...]
          [--min-good 1] [--per-species 8]
      For species with fewer than --min-good good photos (default: none): looks at more
      iNaturalist observations (CC0 / CC BY) and lets the model classify those
      (review/photocandidates.jsonl).
  python data-pipeline/photocheck.py plan
      Writes the new photo order per species into input/photo_overrides.json (good photos first,
      then weak but living ones; dead, caught, specimen, drawing and unusable ones dropped) and
      review/photocheck.md. Species already in the overrides are left alone. Then run
      `pipeline.py photos <species...>` (names in review/photocheck-species.txt) and `pipeline.py build`.

The budget covers both paid steps together (costs from the reported token usage).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sqlite3
import sys
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as src  # noqa: E402
from traitcheck import auth_headers, call_openai  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PIPE = ROOT / "data-pipeline"
CATALOG = ROOT / "public" / "catalog"
IMAGES = ROOT / "catalog-images"  # the catalog photos (their own Vercel project)
DB = CATALOG / "catalog.sqlite"
REVIEW = PIPE / "review"
CHECK = REVIEW / "photocheck.jsonl"
CANDIDATES = REVIEW / "photocandidates.jsonl"
REPORT = REVIEW / "photocheck.md"
OVERRIDES = PIPE / "input" / "photo_overrides.json"
CACHE = PIPE / "cache"
SPECIES_JSON = CACHE / "species.json"
CAND_DIR = CACHE / "photo-candidates"

KINDS = [
    "live_underwater",      # what a diver or snorkeller sees: wanted
    "live_surface_or_shore",  # alive at the surface, in a tide pool, on rocks at low tide: acceptable
    "dead_or_stranded",
    "caught_or_in_hand",
    "aquarium",
    "specimen_or_museum",
    "illustration",
    "other",
]
GOOD = {"live_underwater", "live_surface_or_shore"}
MAX_PHOTOS = 3

PROMPT = """You check photos for a field guide app for recreational divers and snorkellers.
For each photo (in the given order) say what it shows:
- live_underwater: the living animal or plant in the water, as a diver or snorkeller would see it
- live_surface_or_shore: alive, but at the surface, in a tide pool or on rocks/sand at low tide
- dead_or_stranded: a dead animal, washed up, or remains (shells count only if clearly empty/dead)
- caught_or_in_hand: on a hook, in a net, held in a hand, on a boat or market, in a bucket
- aquarium: in an aquarium or tank
- specimen_or_museum: preserved specimen, jar, museum or lab
- illustration: drawing, painting, plate or diagram
- other: anything else (map, wrong subject, unusable)
quality: 1 (useless) to 5 (excellent field-guide photo: subject large, sharp, typical colours).
Do not judge the species identity, only the kind of photo and its quality."""


def schema(n: int) -> dict:
    return {
        "type": "object",
        "properties": {
            "photos": {
                "type": "array",
                "minItems": n,
                "maxItems": n,
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": KINDS},
                        "quality": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
                        "note": {"type": "string"},
                    },
                    "required": ["kind", "quality", "note"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["photos"],
        "additionalProperties": False,
    }


def image_part(path: Path) -> dict:
    mime = "image/webp" if path.suffix == ".webp" else "image/jpeg"
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}", "detail": "low"}}


def read_jsonl(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    return {r["id"]: r for r in (json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())}


def spent() -> float:
    return sum(r["cost"] for f in (CHECK, CANDIDATES) for r in read_jsonl(f).values())


def classify(images: list[Path], name: str, args, key) -> tuple[list[dict], dict, float]:
    payload = {
        "model": args.model,
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": [{"type": "text", "text": f"Species: {name}. {len(images)} photo(s)."}] + [image_part(p) for p in images]},
        ],
        "response_format": {"type": "json_schema", "json_schema": {"name": "photo_check", "strict": True, "schema": schema(len(images))}},
        "max_completion_tokens": 1500,
    }
    if args.reasoning:
        payload["reasoning_effort"] = args.reasoning
    res = call_openai(payload, key)
    usage = res.get("usage") or {}
    cost = (usage.get("prompt_tokens", 0) * args.price_in + usage.get("completion_tokens", 0) * args.price_out) / 1e6
    photos = json.loads(res["choices"][0]["message"]["content"])["photos"]
    return photos, {"in": usage.get("prompt_tokens", 0), "out": usage.get("completion_tokens", 0)}, cost


def run_jobs(jobs: list, out: Path, args, key) -> None:
    """jobs: (id, name, [image paths], extra dict). Appends one result line per job."""
    lock = threading.Lock()
    state = {"spent": spent(), "n": 0, "stop": False, "avg": None}
    print(f"{len(jobs)} to check, ${state['spent']:.3f} spent so far, budget ${args.budget:.2f}")

    def run(job):
        sid, name, images, extra = job
        with lock:
            if state["stop"] or state["spent"] + 3 * (state["avg"] or 0.005) > args.budget:
                state["stop"] = True
                return
        try:
            photos, usage, cost = classify(images, name, args, key)
        except Exception as e:  # noqa: BLE001 - report and stop
            with lock:
                state["stop"] = True
            print(f"stopped at {name}: {e}", file=sys.stderr)
            return
        row = {"id": sid, "scientific_name": name, **extra, "result": photos, "usage": usage, "cost": round(cost, 6),
               "model": args.model, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        with lock:
            with out.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            state["spent"] += cost
            state["n"] += 1
            state["avg"] = (state["avg"] or cost) * 0.9 + cost * 0.1
            if state["n"] % 50 == 0 or state["n"] == len(jobs):
                print(f"  {state['n']}/{len(jobs)}  ${state['spent']:.3f}")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(run, jobs))
    print(f"done: ${state['spent']:.3f} spent in total" + (" (stopped early)" if state["stop"] else ""))


def openai_key() -> str | None:
    key = os.environ.get("OPENAI_API_KEY") or None
    try:
        urllib.request.urlopen(urllib.request.Request("https://api.openai.com/v1/models", headers=auth_headers(key)), timeout=30).read()
    except Exception as e:  # noqa: BLE001
        sys.exit(f"OpenAI not reachable with the stored credentials: {e}")
    return key


def catalog_photos() -> list[tuple[str, str, list[str]]]:
    con = sqlite3.connect(DB)
    names = dict(con.execute("SELECT id, scientific_name FROM species"))
    order = [r[0] for r in con.execute("SELECT id FROM species ORDER BY popularity DESC, scientific_name")]
    photos: dict[str, list[str]] = {}
    for sid, file in con.execute("SELECT species_id, file FROM species_photo ORDER BY species_id, sort"):
        photos.setdefault(sid, []).append(file.split("?", 1)[0])  # without the ?v= fingerprint
    con.close()
    return [(sid, names[sid], photos.get(sid, [])) for sid in order]


def cmd_check(args) -> None:
    key = openai_key()
    REVIEW.mkdir(exist_ok=True)
    done = read_jsonl(CHECK)
    jobs = [(sid, name, [IMAGES / f for f in files], {"files": files})
            for sid, name, files in catalog_photos() if files and sid not in done]
    if args.limit:
        jobs = jobs[: args.limit]
    run_jobs(jobs, CHECK, args, key)


def good_count(result: list[dict]) -> int:
    return sum(1 for p in result if p["kind"] in GOOD and p["quality"] >= 3)


def cmd_candidates(args) -> None:
    key = openai_key()
    checked = read_jsonl(CHECK)
    done = read_jsonl(CANDIDATES)
    species = {s["id"]: s for s in json.loads(SPECIES_JSON.read_text())}
    chosen_obs = {sid: {p["source"] for p in s.get("chosen_photos", [])} for sid, s in species.items()}
    jobs = []
    for sid, row in checked.items():
        # Species with fewer good photos than --min-good (default: none at all) get candidates;
        # the others are only reordered by `plan`.
        if sid in done or good_count(row["result"]) >= args.min_good:
            continue
        s = species.get(sid)
        if not s or not s.get("inat_id"):
            continue
        data = src.get_json(f"{src.INAT}/observations", {
            "taxon_id": s["inat_id"], "photo_license": "cc0,cc-by", "quality_grade": "research",
            "order_by": "votes", "per_page": 20, "photos": "true"})
        cands = []
        for obs in (data or {}).get("results", []):
            p = (obs.get("photos") or [None])[0]
            url = f"https://www.inaturalist.org/observations/{obs['id']}"
            if not p or p.get("license_code") not in ("cc0", "cc-by") or url in chosen_obs.get(sid, set()):
                continue
            small = (p.get("url") or "").replace("/square.", "/medium.")
            dest = CAND_DIR / f"{p['id']}.jpg"
            if small and src.download(small, dest):
                cands.append({"observation": obs["id"], "photo": p["id"], "file": str(dest.relative_to(PIPE))})
            if len(cands) >= args.per_species:
                break
        if cands:
            jobs.append((sid, row["scientific_name"], [PIPE / c["file"] for c in cands], {"candidates": cands}))
    print(f"{len(jobs)} species get candidates")
    run_jobs(jobs, CANDIDATES, args, key)


def obs_entry(source: str, photo_id: int) -> dict:
    """Override entry for an existing catalog photo: its observation, or the taxon photo id."""
    if "/observations/" in source:
        return {"observation": int(source.rstrip("/").split("/")[-1])}
    return {"photo": photo_id}


def cmd_plan(_args) -> None:
    checked = read_jsonl(CHECK)
    cands = read_jsonl(CANDIDATES)
    species = {s["id"]: s for s in json.loads(SPECIES_JSON.read_text())}
    overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    planned, unresolved, lines = [], [], []
    for sid, row in sorted(checked.items(), key=lambda x: x[1]["scientific_name"]):
        s = species.get(sid)
        if not s or s["scientific_name"] in overrides:
            continue  # chosen by hand already
        current = [dict(p, kind=r["kind"], quality=r["quality"]) for p, r in zip(s.get("chosen_photos", []), row["result"])]
        options = [(p["kind"] in GOOD, p["quality"], obs_entry(p["source"], p["id"]), p.get("source")) for p in current]
        for c, r in zip((cands.get(sid) or {}).get("candidates", []), (cands.get(sid) or {}).get("result", [])):
            options.append((r["kind"] in GOOD, r["quality"], {"observation": c["observation"]}, f"https://www.inaturalist.org/observations/{c['observation']}"))
        # Bad: dead, caught, specimen, drawing … or unusable (quality 1). Weak: alive but small or soft
        # (quality 2) – kept, after the good ones. Good: alive, quality 3 or better.
        good = sorted([o for o in options if o[0] and o[1] >= 3], key=lambda o: -o[1])
        weak = [o for o in options if o[0] and o[1] == 2]
        first = current[0] if current else None
        first_fine = first and first["kind"] in GOOD and first["quality"] >= 3
        bad_current = [p for p in current if p["kind"] not in GOOD or p["quality"] <= 1]
        if first_fine and not bad_current:
            continue
        if not good:
            unresolved.append((row["scientific_name"], [p["kind"] for p in current]))
            continue
        good = good + weak
        # Good photos first (current ones keep their place among equals), at most three.
        new = [o[2] for o in good][:MAX_PHOTOS]
        if [obs_entry(p["source"], p["id"]) for p in current] == new:
            continue
        overrides[s["scientific_name"]] = {
            "photos": new,
            "note": "photocheck: " + ", ".join(f"{p['kind']} q{p['quality']}" for p in current) + " -> good photos first",
        }
        planned.append(s["scientific_name"])
        lines.append(f"- *{s['scientific_name']}*: vorher {', '.join(p['kind'] for p in current)}; jetzt {len(new)} gute Fotos")
    OVERRIDES.write_text(json.dumps(overrides, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = [
        "# Fotoprüfung (Bildmodell)",
        "",
        f"{len(checked)} Arten geprüft, {len(planned)} mit neuer Fotoauswahl, {len(unresolved)} ohne gutes Foto. Kosten: ${spent():.2f}.",
        "",
        "## Neue Fotoauswahl",
        "",
        *lines,
        "",
        "## Ohne gutes Foto (bleiben vorerst)",
        "",
        *[f"- *{n}*: {', '.join(k)}" for n, k in unresolved],
        "",
    ]
    REPORT.write_text("\n".join(report), encoding="utf-8")
    print(f"{len(planned)} species with a new photo choice, {len(unresolved)} without a good photo")
    (REVIEW / "photocheck-species.txt").write_text("\n".join(planned) + "\n", encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, fn in (("check", cmd_check), ("candidates", cmd_candidates)):
        c = sub.add_parser(name)
        c.add_argument("--model", required=True)
        c.add_argument("--price-in", type=float, required=True)
        c.add_argument("--price-out", type=float, required=True)
        c.add_argument("--budget", type=float, default=1.9)
        if name == "candidates":
            c.add_argument("--min-good", type=int, default=1, help="look for candidates below this many good photos")
            c.add_argument("--per-species", type=int, default=8, help="candidate photos per species")
        c.add_argument("--limit", type=int, default=0)
        c.add_argument("--reasoning", default="")
        c.add_argument("--workers", type=int, default=6)
        c.set_defaults(func=fn)
    sub.add_parser("plan").set_defaults(func=cmd_plan)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
