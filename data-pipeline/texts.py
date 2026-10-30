"""German and English species descriptions, written from the structured data (never copied from a source)."""
from __future__ import annotations

TRAIT_DE = {
    "color": {"red": "rot", "orange": "orange", "yellow": "gelb", "green": "grün", "blue": "blau", "violet": "violett",
              "pink": "rosa", "brown": "braun", "black": "schwarz", "white": "weiß", "grey": "grau", "silver": "silbrig"},
    "pattern": {"plain": "einfarbig", "stripes": "mit Längsstreifen", "bars": "mit Querbändern", "spots": "gepunktet",
                "blotches": "gefleckt bis marmoriert", "eyespot": "mit Augenfleck", "reticulated": "mit Netzmuster",
                "bicolor": "deutlich zweifarbig"},
    "shape": {"compressed": "seitlich abgeflacht und hochrückig", "fusiform": "spindelförmig", "elongated": "langgestreckt",
              "eel": "aal- bis schlangenförmig", "round": "rundlich", "flat": "flach gebaut", "box": "kastenförmig",
              "odd": "ungewöhnlich geformt", "slug": "schneckenartig ohne Gehäuse", "shell": "mit Schale oder Gehäuse",
              "crab": "krebsartig", "cephalopod": "mit Fangarmen", "star": "sternförmig", "spiny": "stachelig",
              "worm": "walzen- bis wurmförmig", "turtle": "mit Panzer", "mammal": "säugetiertypisch stromlinienförmig",
              "jelly": "gallertig", "branching": "verzweigt", "massive": "massiv bis knollig", "plate": "platten- oder tischförmig",
              "fan": "fächerförmig", "soft": "weich und lederartig", "tube": "röhren- oder vasenförmig",
              "anemone": "polypenartig mit Tentakelkranz", "encrusting": "krustenförmig", "plant": "blattartig"},
}
TRAIT_EN = {
    "color": {"red": "red", "orange": "orange", "yellow": "yellow", "green": "green", "blue": "blue", "violet": "purple",
              "pink": "pink", "brown": "brown", "black": "black", "white": "white", "grey": "grey", "silver": "silvery"},
    "pattern": {"plain": "plain", "stripes": "striped", "bars": "barred", "spots": "spotted", "blotches": "blotched to mottled",
                "eyespot": "with an eyespot", "reticulated": "reticulated", "bicolor": "clearly two-toned"},
    "shape": {"compressed": "laterally compressed and deep-bodied", "fusiform": "spindle-shaped", "elongated": "elongated",
              "eel": "eel-like", "round": "rounded", "flat": "flattened", "box": "box-shaped", "odd": "unusually shaped",
              "slug": "slug-like without a shell", "shell": "shelled", "crab": "crustacean-shaped", "cephalopod": "armed with tentacles",
              "star": "star-shaped", "spiny": "spiny", "worm": "cylindrical to worm-like", "turtle": "armoured",
              "mammal": "streamlined", "jelly": "gelatinous", "branching": "branching", "massive": "massive to boulder-like",
              "plate": "plate- or table-shaped", "fan": "fan-shaped", "soft": "soft and leathery", "tube": "tube- or vase-shaped",
              "anemone": "polyp-like with a ring of tentacles", "encrusting": "encrusting", "plant": "leafy"},
}
BEHAV_DE = {"open-water": "oft im Freiwasser", "reef": "meist über dem Riff", "bottom": "bevorzugt am Boden",
            "buried": "gräbt sich gern im Sand ein", "crevice": "versteckt sich gern in Spalten und Höhlen",
            "nocturnal": "vor allem nachts aktiv", "cleaner": "betreibt Putzerstationen", "camouflage": "hervorragend getarnt",
            "symbiosis": "lebt in enger Gemeinschaft mit anderen Arten", "sessile": "festsitzend"}
BEHAV_EN = {"open-water": "often in open water", "reef": "usually above the reef", "bottom": "prefers the bottom",
            "buried": "often buried in sand", "crevice": "likes to hide in crevices and caves", "nocturnal": "mainly active at night",
            "cleaner": "runs cleaning stations", "camouflage": "superbly camouflaged",
            "symbiosis": "lives in close association with other species", "sessile": "sessile"}
SOCIAL_DE = {"school": "in Schwärmen", "group": "in Gruppen", "pair": "paarweise", "solitary": "meist einzeln", "colony": "in Kolonien"}
SOCIAL_EN = {"school": "in schools", "group": "in groups", "pair": "in pairs", "solitary": "mostly alone", "colony": "in colonies"}
IUCN_DE = {"LC": "nicht gefährdet", "NT": "potenziell gefährdet", "VU": "gefährdet", "EN": "stark gefährdet",
           "CR": "vom Aussterben bedroht", "DD": "unzureichend erforscht"}
IUCN_EN = {"LC": "least concern", "NT": "near threatened", "VU": "vulnerable", "EN": "endangered",
           "CR": "critically endangered", "DD": "data deficient"}


def _join(items: list[str], last: str) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" {last} " + items[-1]


def _fmt(v: float | None) -> str:
    if v is None:
        return ""
    return str(int(v)) if float(v).is_integer() else f"{v:.1f}".replace(".", ",")


def _split(traits: list[str]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {"color": [], "pattern": [], "shape": [], "behav": [], "social": []}
    for t in traits:
        prefix, _, value = t.partition("-")
        out.setdefault(prefix, []).append(value)
    return out


def describe(s: dict, regions: list[dict]) -> tuple[str, str]:
    t = _split(s.get("traits", []))
    name_de = s.get("common_name_de") or s["scientific_name"]
    name_en = s.get("common_name_en") or s["scientific_name"]
    region_names = {r["id"]: (r["name_de"], r["name_en"]) for r in regions}
    de: list[str] = []
    en: list[str] = []

    fam = s.get("family")
    de.append(f"{name_de} ({s['scientific_name']}) gehört zur Familie {fam}." if fam else f"{name_de} ({s['scientific_name']}).")
    en.append(f"{name_en} ({s['scientific_name']}) belongs to the family {fam}." if fam else f"{name_en} ({s['scientific_name']}).")

    look_de = [TRAIT_DE["shape"][x] for x in t["shape"] if x in TRAIT_DE["shape"]][:1]
    look_en = [TRAIT_EN["shape"][x] for x in t["shape"] if x in TRAIT_EN["shape"]][:1]
    cols_de = [TRAIT_DE["color"][x] for x in t["color"] if x in TRAIT_DE["color"]]
    cols_en = [TRAIT_EN["color"][x] for x in t["color"] if x in TRAIT_EN["color"]]
    pat_de = [TRAIT_DE["pattern"][x] for x in t["pattern"] if x in TRAIT_DE["pattern"] and x != "plain"]
    pat_en = [TRAIT_EN["pattern"][x] for x in t["pattern"] if x in TRAIT_EN["pattern"] and x != "plain"]
    if look_de or cols_de:
        parts = []
        if look_de:
            parts.append(look_de[0])
        if cols_de:
            parts.append("überwiegend " + _join(cols_de, "und") + " gefärbt")
        if pat_de:
            parts.append(_join(pat_de, "und"))
        de.append("Erkennungsmerkmale: " + _join(parts, "sowie") + ".")
        parts_en = []
        if look_en:
            parts_en.append(look_en[0])
        if cols_en:
            parts_en.append("mostly " + _join(cols_en, "and"))
        if pat_en:
            parts_en.append(_join(pat_en, "and"))
        en.append("Key features: " + "; ".join(parts_en) + ".")

    size, dmin, dmax = s.get("max_size_cm"), s.get("depth_min_m"), s.get("depth_max_m")
    if size:
        de.append(f"Die Art wird bis zu {_fmt(size)} cm groß.")
        en.append(f"It grows to about {_fmt(size)} cm.")
    if dmax:
        de.append(f"Typischer Tiefenbereich: {_fmt(dmin or 0)} bis {_fmt(dmax)} m.")
        en.append(f"Typical depth range: {_fmt(dmin or 0)} to {_fmt(dmax)} m.")

    behav_de = [BEHAV_DE[x] for x in t["behav"] if x in BEHAV_DE][:3]
    behav_en = [BEHAV_EN[x] for x in t["behav"] if x in BEHAV_EN][:3]
    social_de = [SOCIAL_DE[x] for x in t["social"] if x in SOCIAL_DE][:2]
    social_en = [SOCIAL_EN[x] for x in t["social"] if x in SOCIAL_EN][:2]
    if behav_de:
        de.append("Verhalten: " + ", ".join(behav_de) + ".")
        en.append("Behaviour: " + ", ".join(behav_en) + ".")
    if social_de:
        de.append("Auftreten: " + _join(social_de, "oder") + ".")
        en.append("Occurrence: " + _join(social_en, "or") + ".")

    regs = [region_names[r] for r in s.get("regions", []) if r in region_names]
    if regs:
        de.append("Im Katalog nachgewiesen für: " + ", ".join(r[0] for r in regs) + ".")
        en.append("Recorded in: " + ", ".join(r[1] for r in regs) + ".")
    iucn = s.get("iucn")
    if iucn in IUCN_DE:
        de.append(f"Rote Liste der IUCN: {IUCN_DE[iucn]} ({iucn}).")
        en.append(f"IUCN Red List: {IUCN_EN[iucn]} ({iucn}).")
    return " ".join(de), " ".join(en)
