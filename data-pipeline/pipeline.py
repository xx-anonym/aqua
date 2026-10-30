#!/usr/bin/env python3
"""
Builds the species catalog (catalog.sqlite + WebP photos) for the Aqua app from open sources.

  python data-pipeline/pipeline.py candidates  # iNaturalist: most observed marine species per region
  python data-pipeline/pipeline.py enrich      # WoRMS, GBIF (regions, IUCN), FishBase/SeaLifeBase, iNat names
  python data-pipeline/pipeline.py traits      # writes input/traits_review.csv with suggestions to review
  python data-pipeline/pipeline.py photos      # CC0 / CC BY photos -> WebP (640 px) + thumbnails
  python data-pipeline/pipeline.py build       # public/catalog/catalog.sqlite + catalog-manifest.json
  python data-pipeline/pipeline.py all
  python data-pipeline/pipeline.py seed        # small dev catalog from src/test/fixtures (no network)

Every HTTP response is cached under data-pipeline/cache, so reruns are fast and polite.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import sources as src
from texts import describe

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
INPUT = ROOT / "input"
CACHE = ROOT / "cache"
PUBLIC = REPO / "public" / "catalog"
SCHEMA = (ROOT / "schema" / "catalog.sql").read_text()

PHOTO_EDGE = 640
THUMB_EDGE = 320
MAX_PHOTOS = 3
ALLOWED_LICENSES = {"cc0", "cc-by"}

# (key, iNaturalist taxon id, category, default group, top-N per region)
GROUPS = [
    ("fish", 47178, "fish", None, 30),
    ("sharks_rays", 47273, "fish", None, 6),
    ("nudibranchs", 47113, "creature", "nudibranch", 10),
    ("sacoglossa", 47801, "creature", "sea_slug", 1),
    ("cephalopods", 47459, "creature", "cephalopod", 3),
    ("decapods", 47186, "creature", "crustacean", 6),
    ("mantis_shrimps", 49796, "creature", "crustacean", 1),
    ("echinoderms", 47549, "creature", "echinoderm", 6),
    ("sea_turtles", 372234, "creature", "turtle", 3),
    ("sea_snakes", 492346, "creature", "sea_snake", 1),
    ("cetaceans", 152871, "creature", "mammal", 2),
    ("sirenians", 46306, "creature", "mammal", 1),
    ("cowries", 50687, "creature", "mollusc", 2),
    ("giant_clams", 50592, "creature", "mollusc", 1),
    ("flatworms", 52318, "creature", "flatworm", 2),
    ("polychaetes", 47490, "creature", "worm", 2),
    ("jellyfish", 48332, "creature", "jellyfish", 2),
    ("anthozoa", 47533, "coral_sponge_plant", None, 10),
    ("hydrozoa", 48921, "coral_sponge_plant", "hydrozoan", 2),
    ("sponges", 48824, "coral_sponge_plant", "sponge", 3),
    ("ascidians", 47811, "coral_sponge_plant", "tunicate", 2),
    ("seagrasses", 48073, "coral_sponge_plant", "seagrass", 2),
]
# The Mediterranean is a single region, so it gets a larger share of the catalog.
REGION_FACTOR = {"mediterranean": 1.6}
MIN_REGION_OCCURRENCES = 3

SOURCES = [
    {"name": "iNaturalist", "url": "https://www.inaturalist.org", "license": "Fotos CC0 / CC BY (pro Foto angegeben)",
     "usage": "Artenauswahl nach Beobachtungshäufigkeit, deutsche und englische Trivialnamen, Fotos"},
    {"name": "WoRMS – World Register of Marine Species", "url": "https://www.marinespecies.org", "license": "CC BY 4.0",
     "usage": "Gültige wissenschaftliche Namen, Familie, Lebensraum (marin)"},
    {"name": "GBIF – Global Biodiversity Information Facility", "url": "https://www.gbif.org",
     "license": "Daten je Datensatz CC0 / CC BY / CC BY-NC", "usage": "Fundorte für die Regionszuordnung, IUCN-Status-Kürzel"},
    {"name": "FishBase", "url": "https://www.fishbase.se", "license": "CC BY-NC 3.0 (nicht-kommerziell)",
     "usage": "Maximalgröße, Tiefenbereich, Lebensraum, Körperform, deutsche Namen (Fische)"},
    {"name": "SeaLifeBase", "url": "https://www.sealifebase.se", "license": "CC BY-NC 3.0 (nicht-kommerziell)",
     "usage": "Maximalgröße und Tiefenbereich weiterer Meerestiere"},
    {"name": "IUCN Red List", "url": "https://www.iucnredlist.org", "license": "Nur Status-Kürzel (über GBIF)",
     "usage": "Schutzstatus"},
]


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_json(path: Path):
    return json.loads(path.read_text())


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1))


def regions() -> list[dict]:
    return load_json(INPUT / "regions.json")


def leaf_regions() -> list[dict]:
    return [r for r in regions() if r["geometry"]]


# Hand-made boxes where the polygon's bounding box would swallow neighbouring regions.
BBOX_OVERRIDES = {
    "pacific-islands": [(127, 5, 180, 30), (162, -36, 180, 5), (-180, -36, -125, 30)],
}


def bboxes(region: dict) -> list[tuple[float, float, float, float]]:
    if region["id"] in BBOX_OVERRIDES:
        return BBOX_OVERRIDES[region["id"]]
    ring = region["geometry"]["coordinates"][0]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    lo, hi = min(xs), max(xs)
    if hi > 180:  # crosses the date line: split into two boxes
        return [(lo, min(ys), 180, max(ys)), (-180, min(ys), hi - 360, max(ys))]
    return [(lo, min(ys), hi, max(ys))]


def clip_x(ring: list, limit: float, keep_left: bool) -> list:
    """Sutherland-Hodgman clip of a ring against the vertical line x = limit."""
    inside = (lambda p: p[0] <= limit) if keep_left else (lambda p: p[0] >= limit)
    out = []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if inside(b):
            if not inside(a):
                t = (limit - a[0]) / (b[0] - a[0])
                out.append((limit, a[1] + t * (b[1] - a[1])))
            out.append(tuple(b))
        elif inside(a):
            t = (limit - a[0]) / (b[0] - a[0])
            out.append((limit, a[1] + t * (b[1] - a[1])))
    if out and out[0] != out[-1]:
        out.append(out[0])
    return out


def ring_wkt(ring: list) -> str:
    ring = [p for i, p in enumerate(ring) if i == 0 or p != ring[i - 1]]
    # GBIF wants counter-clockwise outer rings.
    area = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:]))
    pts = ring if area > 0 else list(reversed(ring))
    return "((" + ",".join(f"{round(x, 4)} {round(y, 4)}" for x, y in pts) + "))"


def wkt(region: dict) -> str:
    ring = [tuple(p) for p in region["geometry"]["coordinates"][0]]
    if max(p[0] for p in ring) <= 180:
        return "POLYGON" + ring_wkt(ring)
    # GBIF expects longitudes in [-180, 180]: split polygons that cross the date line.
    west = clip_x(ring, 180, keep_left=True)
    east = [(x - 360, y) for x, y in clip_x(ring, 180, keep_left=False)]
    return "MULTIPOLYGON(" + ring_wkt(west) + "," + ring_wkt(east) + ")"


# ---------------------------------------------------------------- step 1: candidates

def step_candidates() -> None:
    cands: dict[int, dict] = {}
    for region in leaf_regions():
        factor = REGION_FACTOR.get(region["id"], 1.0)
        for key, taxon_id, category, group, top_n in GROUPS:
            n = max(1, round(top_n * factor))
            # Ask for more than needed: freshwater/land species are filtered out later.
            per_page = min(200, n * 3)
            merged: dict[int, dict] = {}
            for box in bboxes(region):
                for r in src.inat_species_counts(taxon_id, box, per_page):
                    t = r["taxon"]
                    m = merged.setdefault(t["id"], {"taxon": t, "count": 0})
                    m["count"] += r["count"]
            ranked = sorted(merged.values(), key=lambda m: -m["count"])
            for m in ranked:
                t = m["taxon"]
                c = cands.setdefault(
                    t["id"],
                    {
                        "inat_id": t["id"],
                        "name": t["name"],
                        "common_de": t.get("preferred_common_name"),
                        "category": category,
                        "group": group,
                        "group_source": key,
                        "region_counts": {},
                        "observations": t.get("observations_count", 0),
                    },
                )
                c["region_counts"][region["id"]] = c["region_counts"].get(region["id"], 0) + m["count"]
            # Position in this region's ranking; select_species() takes the top-N marine ones per slot.
            for idx, m in enumerate(ranked):
                cands[m["taxon"]["id"]].setdefault("positions", {})[f"{region['id']}:{key}"] = idx
        print(f"{region['id']}: {len(cands)} candidates so far", flush=True)
    save_json(CACHE / "candidates.json", list(cands.values()))
    print(f"candidates: {len(cands)}")


# ---------------------------------------------------------------- step 2: enrich

FB_SHAPE = {
    "fusiform / normal": "fusiform",
    "elongated": "elongated",
    "short and / or deep": "compressed",
    "eel-like": "eel",
    "flattened": "flat",
    "other": "odd",
}


def load_fishbase() -> dict[str, dict]:
    import pyarrow.parquet as pq

    out: dict[str, dict] = {}
    for db in ("fb", "slb"):
        cols = ["SpecCode", "Genus", "Species", "Length", "CommonLength", "DepthRangeShallow", "DepthRangeDeep",
                "DepthRangeComShallow", "DepthRangeComDeep", "DemersPelag", "BodyShapeI", "Dangerous", "Saltwater", "FamCode"]
        table = pq.read_table(src.fishbase_table(db, "species"))
        cols = [c for c in cols if c in table.column_names]
        for row in table.select(cols).to_pylist():
            name = f"{row['Genus']} {row['Species']}"
            row["db"] = db
            out.setdefault(name, row)
        # German common names
        try:
            names = pq.read_table(src.fishbase_table(db, "comnames"), columns=["SpecCode", "ComName", "Language"]).to_pylist()
        except Exception:  # noqa: BLE001 - table layout differs between versions
            names = []
        by_code: dict[int, str] = {}
        for n in names:
            if n.get("Language") == "German" and n.get("ComName") and n["SpecCode"] not in by_code:
                by_code[n["SpecCode"]] = n["ComName"]
        for name, row in out.items():
            if row["db"] == db and row["SpecCode"] in by_code:
                row.setdefault("german", by_code[row["SpecCode"]])
    return out


def select_species(cands: list[dict]) -> list[dict]:
    """Keeps, per region and group, the top-N species that survived the marine filter."""
    by_slot: dict[str, list[dict]] = defaultdict(list)
    for c in cands:
        for slot, pos in c.get("positions", {}).items():
            by_slot[slot].append((pos, c))
    keep: dict[int, dict] = {}
    quotas = {key: n for key, _, _, _, n in GROUPS}
    for slot, items in by_slot.items():
        region_id, key = slot.split(":")
        n = max(1, round(quotas[key] * REGION_FACTOR.get(region_id, 1.0)))
        chosen = 0
        for _, c in sorted(items, key=lambda x: x[0]):
            if not c.get("ok"):
                continue
            keep[c["inat_id"]] = c
            chosen += 1
            if chosen >= n:
                break
    return list(keep.values())


def step_enrich() -> None:
    cands = load_json(CACHE / "candidates.json")
    names = sorted({c["name"] for c in cands})
    print(f"WoRMS: matching {len(names)} names", flush=True)
    worms = src.worms_match(names)
    for c in cands:
        w = worms.get(c["name"])
        c["ok"] = False
        if not w or w.get("rank") != "Species":
            continue
        if w.get("isMarine") != 1 or w.get("isTerrestrial") == 1:
            continue
        if w.get("status") != "accepted" and w.get("valid_AphiaID"):
            valid = src.worms_record(w["valid_AphiaID"]) or w
            if valid.get("rank") == "Species":
                w = valid
        c["worms"] = {k: w.get(k) for k in ("AphiaID", "valid_name", "scientificname", "family", "order", "class", "phylum", "genus")}
        c["ok"] = True
    marine = [c for c in cands if c["ok"]]
    print(f"marine species: {len(marine)} of {len(cands)}", flush=True)

    selected = select_species(cands)
    print(f"selected after quotas: {len(selected)}", flush=True)

    # GBIF: keys, regional occurrence counts, IUCN status
    for c in selected:
        name = c["worms"]["valid_name"] or c["name"]
        m = src.gbif_match(name) or {}
        if m.get("matchType") == "NONE" or not m.get("usageKey"):
            m = src.gbif_match(c["name"]) or {}
        c["gbif_key"] = m.get("speciesKey") or m.get("usageKey")
        c["iucn"] = src.gbif_iucn(c["gbif_key"]) if c["gbif_key"] else None
    keys = [c["gbif_key"] for c in selected if c["gbif_key"]]
    region_hits: dict[str, dict[int, int]] = {}
    for region in leaf_regions():
        region_hits[region["id"]] = src.gbif_region_counts(wkt(region), keys)
        print(f"GBIF {region['id']}: {len(region_hits[region['id']])} species with records", flush=True)
    for c in selected:
        c["regions"] = sorted(
            r["id"] for r in leaf_regions() if region_hits[r["id"]].get(c["gbif_key"] or -1, 0) >= MIN_REGION_OCCURRENCES
        )

    # iNaturalist: names in both languages, curated photos, popularity
    ids = [c["inat_id"] for c in selected]
    de = {t["id"]: t for t in src.inat_taxa(ids, "de")}
    en = {t["id"]: t for t in src.inat_taxa(ids, "en")}
    fishbase = load_fishbase()
    out = []
    for c in selected:
        if not c["regions"]:
            continue
        tde, ten = de.get(c["inat_id"], {}), en.get(c["inat_id"], {})
        sci = c["worms"]["valid_name"] or c["name"]
        fb = fishbase.get(sci) or fishbase.get(c["name"]) or {}
        common_de = tde.get("preferred_common_name") or fb.get("german")
        common_en = ten.get("preferred_common_name")
        # iNat falls back to English or scientific names when no German name exists.
        if common_de and (common_de == common_en and tde.get("preferred_common_name") and fb.get("german")):
            common_de = fb["german"]
        photos = [
            {
                "id": tp["photo"]["id"],
                "url": tp["photo"].get("url"),
                "license": tp["photo"].get("license_code"),
                "author": tp["photo"].get("attribution_name") or tp["photo"].get("attribution"),
                "attribution": tp["photo"].get("attribution"),
                "source": f"https://www.inaturalist.org/photos/{tp['photo']['id']}",
            }
            for tp in tde.get("taxon_photos", [])
            if tp.get("photo", {}).get("license_code") in ALLOWED_LICENSES
        ]
        out.append(
            {
                "id": slug(sci),
                "scientific_name": sci,
                "inat_id": c["inat_id"],
                "aphia_id": c["worms"]["AphiaID"],
                "family": c["worms"]["family"],
                "order": c["worms"]["order"],
                "class": c["worms"]["class"],
                "phylum": c["worms"]["phylum"],
                "category": c["category"],
                "group_source": c["group_source"],
                "group": c["group"],
                "common_name_de": common_de,
                "common_name_en": common_en,
                "observations": ten.get("observations_count") or c.get("observations") or 0,
                "region_counts": c["region_counts"],
                "regions": c["regions"],
                "iucn": c["iucn"],
                "fishbase": {k: fb.get(k) for k in ("db", "Length", "CommonLength", "DepthRangeShallow", "DepthRangeDeep",
                                                     "DepthRangeComShallow", "DepthRangeComDeep", "DemersPelag",
                                                     "BodyShapeI", "Dangerous")} if fb else None,
                "photos": photos,
            }
        )
    # Deduplicate (synonyms can collapse onto one accepted name)
    unique: dict[str, dict] = {}
    for s in out:
        if s["id"] not in unique or s["observations"] > unique[s["id"]]["observations"]:
            unique[s["id"]] = s
    species = sorted(unique.values(), key=lambda s: -s["observations"])
    save_json(CACHE / "species.json", species)
    print(f"enriched species: {len(species)}")


# ---------------------------------------------------------------- step 3: traits

FAMILY_SHAPE = {
    "Tetraodontidae": "round", "Diodontidae": "round", "Ostraciidae": "box", "Aracanidae": "box",
    "Syngnathidae": "odd", "Antennariidae": "odd", "Solenostomidae": "odd", "Centriscidae": "odd",
    "Muraenidae": "eel", "Ophichthidae": "eel", "Congridae": "eel", "Plotosidae": "eel",
    "Chaetodontidae": "compressed", "Pomacanthidae": "compressed", "Acanthuridae": "compressed",
    "Ephippidae": "compressed", "Zanclidae": "compressed", "Siganidae": "compressed", "Monodactylidae": "compressed",
    "Dasyatidae": "flat", "Mobulidae": "flat", "Myliobatidae": "flat", "Aetobatidae": "flat", "Torpedinidae": "flat",
    "Rajidae": "flat", "Bothidae": "flat", "Soleidae": "flat", "Pleuronectidae": "flat", "Rhinobatidae": "flat",
    "Glaucostegidae": "flat", "Rhinidae": "flat", "Squatinidae": "flat", "Platycephalidae": "flat",
    "Uranoscopidae": "elongated", "Fistulariidae": "elongated", "Aulostomidae": "elongated", "Sphyraenidae": "elongated",
    "Belonidae": "elongated", "Synodontidae": "elongated", "Gobiidae": "elongated", "Blenniidae": "elongated",
    "Tripterygiidae": "elongated", "Labridae": "fusiform", "Scaridae": "fusiform",
}
CLASS_SHAPE = {
    "Asteroidea": "star", "Ophiuroidea": "star", "Crinoidea": "star", "Echinoidea": "spiny", "Holothuroidea": "worm",
    "Cephalopoda": "cephalopod", "Malacostraca": "crab", "Polychaeta": "worm", "Scyphozoa": "jelly",
    "Mammalia": "mammal", "Reptilia": "turtle", "Testudines": "turtle", "Ascidiacea": "tube", "Demospongiae": "tube",
    "Calcarea": "tube", "Hexactinellida": "tube",
}


def group_of(s: dict) -> str:
    """Finer group key used for icons, texts and default traits."""
    if s["group"]:
        return s["group"]
    cls, order, fam = s.get("class") or "", s.get("order") or "", s.get("family") or ""
    if s["group_source"] == "sharks_rays":
        return "ray" if FAMILY_SHAPE.get(fam) == "flat" else "shark"
    if s["category"] == "fish":
        return "fish"
    if s["group_source"] == "anthozoa":
        if order == "Scleractinia":
            return "hard_coral"
        if order == "Actiniaria":
            return "anemone"
        if order in ("Zoantharia", "Corallimorpharia", "Ceriantharia"):
            return "anemone"
        if order == "Antipatharia":
            return "black_coral"
        if fam in ("Plexauridae", "Gorgoniidae", "Melithaeidae", "Ellisellidae", "Subergorgiidae", "Acanthogorgiidae",
                   "Paramuriceidae", "Isididae", "Corallidae", "Anthothelidae"):
            return "gorgonian"
        return "soft_coral"
    return cls.lower() or "other"


def suggest_traits(s: dict) -> dict[str, list[str]]:
    fb = s.get("fishbase") or {}
    shape: list[str] = []
    behav: list[str] = []
    fam, cls = s.get("family") or "", s.get("class") or ""
    if s["category"] == "fish":
        sh = FAMILY_SHAPE.get(fam) or FB_SHAPE.get((fb.get("BodyShapeI") or "").strip())
        if sh:
            shape.append(sh)
        dp = (fb.get("DemersPelag") or "").lower()
        if "reef" in dp:
            behav.append("reef")
        elif "pelagic" in dp:
            behav.append("open-water")
        elif "demersal" in dp:
            behav.append("bottom")
    elif s["category"] == "creature":
        sh = CLASS_SHAPE.get(cls)
        if s["group"] in ("nudibranch", "sea_slug", "flatworm"):
            sh = "slug"
        elif s["group"] in ("mollusc",):
            sh = "shell"
        elif s["group"] == "sea_snake":
            sh = "turtle"
        if sh:
            shape.append(sh)
        behav.append("bottom")
    else:
        g = group_of(s)
        sh = {"hard_coral": "massive", "soft_coral": "soft", "gorgonian": "fan", "anemone": "anemone", "black_coral": "branching",
              "sponge": "tube", "tunicate": "tube", "seagrass": "plant", "hydrozoan": "branching"}.get(g)
        if sh:
            shape.append(sh)
        behav.append("sessile")
    return {"colors": [], "patterns": [], "shapes": shape, "behaviors": behav, "social": []}


TRAIT_COLUMNS = ["scientific_name", "common_name_de", "colors", "patterns", "shapes", "behaviors", "social", "reviewed"]


def read_traits_csv(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    return {r["scientific_name"]: r for r in rows}


def step_traits() -> None:
    species = load_json(CACHE / "species.json")
    curated = read_traits_csv(INPUT / "traits.csv")
    rows = []
    for s in species:
        if s["scientific_name"] in curated:
            continue
        sug = suggest_traits(s)
        rows.append({
            "scientific_name": s["scientific_name"],
            "common_name_de": s.get("common_name_de") or "",
            "colors": ",".join(sug["colors"]),
            "patterns": ",".join(sug["patterns"]),
            "shapes": ",".join(sug["shapes"]),
            "behaviors": ",".join(sug["behaviors"]),
            "social": ",".join(sug["social"]),
            "reviewed": "no",
        })
    with (INPUT / "traits_review.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=TRAIT_COLUMNS, delimiter=";")
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} species without curated traits -> input/traits_review.csv")


# ---------------------------------------------------------------- step 4: photos

def more_photos(s: dict) -> list[dict]:
    """Top-voted research-grade observation photos with an allowed license, if curated ones are not enough."""
    data = src.get_json(
        f"{src.INAT}/observations",
        {"taxon_id": s["inat_id"], "photo_license": "cc0,cc-by", "quality_grade": "research", "order_by": "votes",
         "per_page": 8, "photos": "true"},
    )
    out = []
    for obs in (data or {}).get("results", []):
        for p in obs.get("photos", [])[:1]:
            if p.get("license_code") in ALLOWED_LICENSES:
                out.append({
                    "id": p["id"], "url": p.get("url"), "license": p["license_code"],
                    "author": p.get("attribution_name") or (obs.get("user") or {}).get("login") or p.get("attribution"),
                    "attribution": p.get("attribution"),
                    "source": f"https://www.inaturalist.org/observations/{obs['id']}",
                })
    return out


def step_photos() -> None:
    from PIL import Image, ImageOps

    species = load_json(CACHE / "species.json")
    raw_dir = CACHE / "photos-raw"
    out_dir = CACHE / "photos"
    for i, s in enumerate(species):
        photos = list(s["photos"])
        if len(photos) < MAX_PHOTOS:
            seen = {p["id"] for p in photos}
            photos += [p for p in more_photos(s) if p["id"] not in seen]
        chosen = []
        for p in photos:
            if len(chosen) >= MAX_PHOTOS or not p.get("url"):
                continue
            large = re.sub(r"/(square|small|medium|thumb|original)\.", "/large.", p["url"])
            raw = raw_dir / f"{p['id']}.jpg"
            if not src.download(large, raw):
                continue
            try:
                img = ImageOps.exif_transpose(Image.open(raw)).convert("RGB")
            except Exception:  # noqa: BLE001 - skip broken downloads
                raw.unlink(missing_ok=True)
                continue
            n = len(chosen)
            rel = f"img/{s['id']}-{n + 1}.webp"
            full = img.copy()
            full.thumbnail((PHOTO_EDGE, PHOTO_EDGE))
            (out_dir / rel).parent.mkdir(parents=True, exist_ok=True)
            full.save(out_dir / rel, "WEBP", quality=56, method=6)
            if n == 0:
                thumb = ImageOps.fit(img, (THUMB_EDGE, THUMB_EDGE * 3 // 4), centering=(0.5, 0.5))
                (out_dir / "thumb").mkdir(parents=True, exist_ok=True)
                thumb.save(out_dir / "thumb" / f"{s['id']}.webp", "WEBP", quality=55, method=6)
            chosen.append({**p, "file": rel, "bytes": (out_dir / rel).stat().st_size})
        s["chosen_photos"] = chosen
        if (i + 1) % 25 == 0:
            print(f"photos: {i + 1}/{len(species)}", flush=True)
    save_json(CACHE / "species.json", species)
    print("photos done")


# ---------------------------------------------------------------- step 5: build

def trait_ids(row: dict) -> list[str]:
    ids = []
    for col, prefix in (("colors", "color"), ("patterns", "pattern"), ("shapes", "shape"), ("behaviors", "behav"), ("social", "social")):
        for v in (row.get(col) or "").split(","):
            v = v.strip()
            if v:
                ids.append(f"{prefix}-{v}")
    return ids


def habitat_of(s: dict, traits: list[str]) -> str:
    dp = ((s.get("fishbase") or {}).get("DemersPelag") or "").lower()
    if s["category"] == "coral_sponge_plant":
        return "seagrass" if "shape-plant" in traits else "reef"
    if "behav-buried" in traits:
        return "sand"
    if "pelagic" in dp or "behav-open-water" in traits:
        return "open_water"
    if "reef" in dp or "behav-reef" in traits:
        return "reef"
    if "demersal" in dp:
        return "bottom"
    return "reef"


def num(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def write_catalog(db_path: Path, species: list[dict], version: str) -> None:
    traits = load_json(INPUT / "traits.json")
    valid_traits = {t["id"] for t in traits}
    if db_path.exists():
        db_path.unlink()
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    con.execute("INSERT INTO catalog_meta VALUES (?, ?, ?)",
                (version, datetime.now(timezone.utc).isoformat(timespec="seconds"), json.dumps(SOURCES, ensure_ascii=False)))
    con.executemany("INSERT INTO trait VALUES (:id, :type, :label_de, :label_en, :icon, :applies_to, :sort)", traits)
    for r in regions():
        con.execute("INSERT INTO region VALUES (?, ?, ?, ?, ?, ?)",
                    (r["id"], r["name_de"], r["name_en"], r["parent_id"], json.dumps(r["geometry"]) if r["geometry"] else None, r["sort"]))
    for s in species:
        con.execute(
            """INSERT INTO species (id, scientific_name, common_name_de, common_name_en, category, group_key, family,
                 description_de, description_en, habitat, lifestyle, max_size_cm, depth_min_m, depth_max_m, iucn_status,
                 is_premium, popularity, worms_aphia_id, inat_taxon_id, thumb)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)""",
            (s["id"], s["scientific_name"], s.get("common_name_de"), s.get("common_name_en"), s["category"], s.get("group_key"),
             s.get("family"), s.get("description_de"), s.get("description_en"), s.get("habitat"), s.get("lifestyle"),
             s.get("max_size_cm"), s.get("depth_min_m"), s.get("depth_max_m"), s.get("iucn"), s.get("popularity", 0),
             s.get("aphia_id"), s.get("inat_id"), s.get("thumb")),
        )
        for t in s.get("traits", []):
            if t in valid_traits:
                con.execute("INSERT OR IGNORE INTO species_trait VALUES (?, ?)", (s["id"], t))
            else:
                print(f"  unknown trait {t} for {s['scientific_name']}", file=sys.stderr)
        for r in s.get("regions", []):
            con.execute("INSERT INTO species_region VALUES (?, ?)", (s["id"], r))
        for i, p in enumerate(s.get("photo_rows", [])):
            con.execute("INSERT INTO species_photo VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (s["id"], p["file"], p["author"], p["license"], p["source"], p.get("bytes", 0), i))
    con.commit()
    con.execute("VACUUM")
    con.close()


def write_manifest(db_path: Path, species: list[dict], version: str) -> None:
    photos = [p for s in species for p in s.get("photo_rows", [])]
    manifest = {
        "version": version,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "species": len(species),
        "database_bytes": db_path.stat().st_size,
        "photos": [{"file": p["file"], "bytes": p.get("bytes", 0)} for p in photos],
        "photo_bytes": sum(p.get("bytes", 0) for p in photos),
    }
    save_json(PUBLIC / "catalog-manifest.json", manifest)


def step_build() -> None:
    species = load_json(CACHE / "species.json")
    curated = read_traits_csv(INPUT / "traits.csv")
    out = []
    missing = 0
    for s in species:
        if not s.get("chosen_photos"):
            continue  # every catalog entry needs at least one openly licensed photo
        row = curated.get(s["scientific_name"])
        traits = trait_ids(row) if row else []
        if not row:
            missing += 1
            sug = suggest_traits(s)
            traits = trait_ids({k: ",".join(v) for k, v in sug.items()})
        if row and row.get("common_name_de"):
            s["common_name_de"] = row["common_name_de"]
        fb = s.get("fishbase") or {}
        s["group_key"] = group_of(s)
        s["traits"] = traits
        s["max_size_cm"] = num(fb.get("Length"))
        s["depth_min_m"] = num(fb.get("DepthRangeComShallow")) or num(fb.get("DepthRangeShallow")) or (0 if fb.get("DepthRangeDeep") else None)
        s["depth_max_m"] = num(fb.get("DepthRangeComDeep")) or num(fb.get("DepthRangeDeep"))
        if s["depth_min_m"] is not None and s["depth_max_m"] is not None and s["depth_min_m"] > s["depth_max_m"]:
            s["depth_min_m"], s["depth_max_m"] = s["depth_max_m"], s["depth_min_m"]
        s["habitat"] = habitat_of(s, traits)
        s["lifestyle"] = "sessile" if "behav-sessile" in traits else "nocturnal" if "behav-nocturnal" in traits else "diurnal"
        s["popularity"] = int(sum(s["region_counts"].values()))
        s["thumb"] = f"thumb/{s['id']}.webp"
        s["photo_rows"] = s["chosen_photos"]
        s["description_de"], s["description_en"] = describe(s, load_json(INPUT / "regions.json"))
        out.append(s)
    version = datetime.now(timezone.utc).strftime("%Y.%m.%d") + "-" + hashlib.sha1(
        json.dumps([(s["id"], s["traits"]) for s in out]).encode()).hexdigest()[:6]

    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    PUBLIC.mkdir(parents=True)
    shutil.copytree(CACHE / "photos" / "img", PUBLIC / "img")
    shutil.copytree(CACHE / "photos" / "thumb", PUBLIC / "thumb")
    # Drop images of species that did not make it into the catalog
    keep = {s["id"] for s in out}
    for f in list((PUBLIC / "img").iterdir()) + list((PUBLIC / "thumb").iterdir()):
        sid = re.sub(r"-\d+$", "", f.stem) if f.parent.name == "img" else f.stem
        if sid not in keep:
            f.unlink()
    db_path = PUBLIC / "catalog.sqlite"
    write_catalog(db_path, out, version)
    write_manifest(db_path, out, version)
    total = sum(f.stat().st_size for f in PUBLIC.rglob("*") if f.is_file())
    print(f"catalog {version}: {len(out)} species ({missing} without curated traits), {total / 1e6:.1f} MB")


def step_seed() -> None:
    """Development catalog from the 34-species test fixture, without photos."""
    seed = load_json(REPO / "src" / "test" / "fixtures" / "seed-species.json")
    for s in seed:
        s.update({"iucn": s.get("iucn_status"), "thumb": None, "photo_rows": [], "aphia_id": None, "inat_id": None})
    PUBLIC.mkdir(parents=True, exist_ok=True)
    db_path = PUBLIC / "catalog.sqlite"
    write_catalog(db_path, seed, "seed")
    write_manifest(db_path, seed, "seed")
    print(f"seed catalog: {len(seed)} species")


STEPS = {
    "candidates": step_candidates,
    "enrich": step_enrich,
    "traits": step_traits,
    "photos": step_photos,
    "build": step_build,
    "seed": step_seed,
}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "all":
        for name in ("candidates", "enrich", "traits", "photos", "build"):
            print(f"== {name}", flush=True)
            STEPS[name]()
    else:
        STEPS[cmd]()
