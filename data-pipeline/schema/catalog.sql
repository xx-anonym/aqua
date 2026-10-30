-- Read-only species catalog shipped with the app as catalog.sqlite.
-- Shared by the Python pipeline (build_catalog.py) and the TypeScript seed/test builder.

CREATE TABLE catalog_meta (
  version   TEXT NOT NULL,
  built_at  TEXT NOT NULL,
  sources   TEXT NOT NULL            -- JSON array: [{name, url, license, usage}]
);

CREATE TABLE species (
  id               TEXT PRIMARY KEY,  -- stable slug of the scientific name, referenced by user data
  scientific_name  TEXT NOT NULL,
  common_name_de   TEXT,
  common_name_en   TEXT,
  category         TEXT NOT NULL CHECK (category IN ('fish', 'creature', 'coral_sponge_plant')),
  group_key        TEXT,              -- finer group, e.g. nudibranch, crustacean, ray
  family           TEXT,
  description_de   TEXT,
  description_en   TEXT,
  habitat          TEXT,              -- habitat key, e.g. reef, sand, open_water
  lifestyle        TEXT,              -- short lifestyle key, e.g. diurnal, nocturnal
  max_size_cm      REAL,
  depth_min_m      REAL,
  depth_max_m      REAL,
  iucn_status      TEXT,              -- status code only (LC, NT, VU, EN, CR, DD, NE)
  is_premium       INTEGER NOT NULL DEFAULT 0,
  popularity       INTEGER NOT NULL DEFAULT 0,  -- observation count, used for default sorting
  worms_aphia_id   INTEGER,
  inat_taxon_id    INTEGER,
  thumb            TEXT               -- path of the grid thumbnail relative to /catalog/
);

CREATE TABLE species_photo (
  species_id  TEXT NOT NULL REFERENCES species(id),
  file        TEXT NOT NULL,          -- path relative to /catalog/
  author      TEXT NOT NULL,
  license     TEXT NOT NULL,          -- cc0, cc-by, cc-by-sa
  source_url  TEXT NOT NULL,
  bytes       INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX species_photo_species ON species_photo(species_id);

CREATE TABLE trait (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('color', 'pattern', 'body_shape', 'behavior', 'social')),
  label_de    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  icon        TEXT NOT NULL,
  applies_to  TEXT NOT NULL DEFAULT 'fish,creature,coral_sponge_plant',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE species_trait (
  species_id  TEXT NOT NULL REFERENCES species(id),
  trait_id    TEXT NOT NULL REFERENCES trait(id),
  PRIMARY KEY (species_id, trait_id)
);

CREATE TABLE region (
  id         TEXT PRIMARY KEY,
  name_de    TEXT NOT NULL,
  name_en    TEXT NOT NULL,
  parent_id  TEXT REFERENCES region(id),
  geometry   TEXT,                    -- GeoJSON Polygon, longitudes may exceed 180 east of the date line
  sort       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE species_region (
  species_id  TEXT NOT NULL REFERENCES species(id),
  region_id   TEXT NOT NULL REFERENCES region(id),
  PRIMARY KEY (species_id, region_id)
);
