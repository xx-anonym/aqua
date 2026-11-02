"""HTTP access to the open data sources with an on-disk cache and polite rate limits."""
from __future__ import annotations

import hashlib
import http.client
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
USER_AGENT = "aqua-catalog-pipeline/0.1 (private, non-commercial dive log app)"

# Minimum seconds between requests per host (iNaturalist asks for <= 1 req/s).
RATE = {
    "query.wikidata.org": 62.0,  # the query service currently allows about one request per minute
    "api.inaturalist.org": 1.05,
    "www.marinespecies.org": 0.25,
    "api.gbif.org": 0.1,
    "api.obis.org": 0.2,
}
_last: dict[str, float] = {}
_lock = threading.Lock()


def _throttle(host: str) -> None:
    gap = RATE.get(host, 0.2)
    with _lock:
        wait = _last.get(host, 0) + gap - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()


def get_json(url: str, params: dict | None = None, *, cache: bool = True, retries: int = 4):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"
    key = hashlib.sha1(url.encode()).hexdigest()
    path = CACHE / "http" / key[:2] / f"{key}.json"
    if cache and path.exists():
        return json.loads(path.read_text())
    host = urllib.parse.urlparse(url).netloc
    for attempt in range(retries):
        _throttle(host)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as res:
                body = res.read()
                data = json.loads(body) if body.strip() else None
            break
        except urllib.error.HTTPError as e:
            if e.code == 204:
                data = None
                break
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                retry_after = e.headers.get("Retry-After") if e.headers else None
                wait = int(retry_after) if retry_after and retry_after.isdigit() else 0
                time.sleep(max(2 ** (attempt + 1), wait, 65 if e.code == 429 else 0))
                continue
            if e.code == 404:
                data = None
                break
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < retries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            raise
    if cache:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))
    return data


def download(url: str, dest: Path, retries: int = 4) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    host = urllib.parse.urlparse(url).netloc
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        _throttle(host)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as res:
                data = res.read()
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(data)
            tmp.replace(dest)  # never leave a truncated file behind
            return True
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return False
            if attempt < retries - 1:
                time.sleep(2 ** (attempt + 1))
        except (urllib.error.URLError, TimeoutError, http.client.IncompleteRead, ConnectionError):
            if attempt < retries - 1:
                time.sleep(2 ** (attempt + 1))
    return False


# ---------------------------------------------------------------- iNaturalist

INAT = "https://api.inaturalist.org/v1"
INAT_GBIF_DATASET = "50c9509d-22c7-4a22-a47d-8c48425ef4a7"


def inat_species_counts(taxon_id: int, bbox: tuple[float, float, float, float], per_page: int) -> list[dict]:
    """Most observed species (research grade) of a taxon inside a bounding box."""
    swlng, swlat, nelng, nelat = bbox
    params = {
        "taxon_id": taxon_id,
        "quality_grade": "research",
        "swlat": swlat,
        "swlng": swlng,
        "nelat": nelat,
        "nelng": nelng,
        "rank": "species",
        "per_page": per_page,
        "locale": "de",
    }
    data = get_json(f"{INAT}/observations/species_counts", params)
    return data["results"] if data else []


def inat_taxa(ids: list[int], locale: str) -> list[dict]:
    out = []
    for i in range(0, len(ids), 30):
        chunk = ",".join(str(x) for x in ids[i : i + 30])
        data = get_json(f"{INAT}/taxa/{chunk}", {"locale": locale})
        out.extend(data["results"] if data else [])
    return out


# ---------------------------------------------------------------- WoRMS

WORMS = "https://www.marinespecies.org/rest"


def worms_match(names: list[str]) -> dict[str, dict | None]:
    """Exact-or-fuzzy WoRMS record per name; accepted name, family and habitat flags."""
    out: dict[str, dict | None] = {}
    for i in range(0, len(names), 50):
        chunk = names[i : i + 50]
        data = get_json(f"{WORMS}/AphiaRecordsByMatchNames", {"scientificnames[]": chunk, "marine_only": "false"})
        for name, matches in zip(chunk, data or [[] for _ in chunk]):
            best = None
            for m in matches or []:
                if m.get("status") == "accepted" or best is None:
                    best = m
                if m.get("status") == "accepted":
                    break
            out[name] = best
    return out


def worms_record(aphia_id: int) -> dict | None:
    return get_json(f"{WORMS}/AphiaRecordByAphiaID/{aphia_id}")


# ---------------------------------------------------------------- GBIF

GBIF = "https://api.gbif.org/v1"


def gbif_match(name: str) -> dict | None:
    return get_json(f"{GBIF}/species/match", {"name": name, "strict": "true"})


def gbif_iucn(usage_key: int) -> str | None:
    data = get_json(f"{GBIF}/species/{usage_key}/iucnRedListCategory")
    return (data or {}).get("code")


def gbif_region_counts(polygon_wkt: str, species_keys: list[int]) -> dict[int, int]:
    """Human-observation occurrence counts per species inside a polygon (one faceted request per chunk)."""
    counts: dict[int, int] = {}
    for i in range(0, len(species_keys), 60):
        chunk = species_keys[i : i + 60]
        data = get_json(
            f"{GBIF}/occurrence/search",
            {
                "geometry": polygon_wkt,
                "basisOfRecord": "HUMAN_OBSERVATION",
                "taxonKey": chunk,
                "facet": "speciesKey",
                "facetLimit": 1000,
                "limit": 0,
            },
        )
        for facet in (data or {}).get("facets", []):
            for c in facet["counts"]:
                counts[int(c["name"])] = counts.get(int(c["name"]), 0) + c["count"]
    return counts


def gbif_facet(params: dict, species_keys: list[int], facet: str, limit: int) -> dict[str, int]:
    """Human-observation occurrence counts of our species, grouped by `facet` (chunked by species)."""
    counts: dict[str, int] = {}
    for i in range(0, len(species_keys), 120):
        data = get_json(
            f"{GBIF}/occurrence/search",
            {
                **params,
                "basisOfRecord": "HUMAN_OBSERVATION",
                "taxonKey": species_keys[i : i + 120],
                "facet": facet,
                "facetLimit": limit,
                "limit": 0,
            },
        )
        for f in (data or {}).get("facets", []):
            for c in f["counts"]:
                counts[c["name"]] = counts.get(c["name"], 0) + c["count"]
    return counts


# ---------------------------------------------------------------- German names (Wikidata, WoRMS)

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"


def wikidata_german_names(names: list[str]) -> dict[str, dict[str, list[str]]]:
    """Per scientific name: German label, German common names (P1843) and the German Wikipedia title."""
    out: dict[str, dict[str, list[str]]] = {}
    for i in range(0, len(names), 100):
        chunk = names[i : i + 100]
        values = " ".join(json.dumps(n) for n in chunk)
        query = f"""SELECT ?name ?label ?common ?article WHERE {{
  VALUES ?name {{ {values} }}
  ?item wdt:P225 ?name .
  OPTIONAL {{ ?item rdfs:label ?label FILTER(LANG(?label) = "de") }}
  OPTIONAL {{ ?item wdt:P1843 ?common FILTER(LANG(?common) = "de") }}
  OPTIONAL {{ ?article schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> }}
}}"""
        data = get_json(WIKIDATA_SPARQL, {"query": query, "format": "json"})
        for b in (data or {}).get("results", {}).get("bindings", []):
            entry = out.setdefault(b["name"]["value"], {"label": [], "common": [], "article": []})
            for key in ("label", "common"):
                if key in b and b[key]["value"] not in entry[key]:
                    entry[key].append(b[key]["value"])
            if "article" in b:
                title = urllib.parse.unquote(b["article"]["value"].rsplit("/", 1)[-1]).replace("_", " ")
                if title not in entry["article"]:
                    entry["article"].append(title)
    return out


def worms_german_names(aphia_id: int) -> list[str]:
    data = get_json(f"{WORMS}/AphiaVernacularsByAphiaID/{aphia_id}")
    return [v["vernacular"] for v in data or [] if v.get("language_code") == "deu" and v.get("vernacular")]


# ---------------------------------------------------------------- FishBase / SeaLifeBase

FB_PARQUET = "https://huggingface.co/datasets/cboettig/fishbase/resolve/main/data/{db}/{version}/parquet/{table}.parquet"


def fishbase_table(db: str, table: str, version: str = "v25.04") -> Path:
    dest = CACHE / "fishbase" / f"{db}_{version}_{table}.parquet"
    if not download(FB_PARQUET.format(db=db, version=version, table=table), dest):
        raise RuntimeError(f"could not download {db}/{table}")
    return dest
