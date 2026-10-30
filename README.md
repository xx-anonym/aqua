# Aqua – Tauch-Logbuch & Artensammlung

Installierbare Web-App (PWA) für Taucher, Freitaucher und Schnorchler: Meerestiere bestimmen,
Tauchgänge loggen und jede gesichtete Art in einer persönlichen Lebensliste sammeln. Alles läuft
**offline-first**: Katalog, Suche, Merkmalsfilter, Logbuch und Sammlung funktionieren ohne Netz;
mit Konto werden die Daten zwischen Geräten synchronisiert.

Startregionen des Katalogs: **Indopazifik** (Rotes Meer, Westlicher Indischer Ozean, Malediven &
Sri Lanka, Südostasien & Korallendreieck, Australien & Korallenmeer, Pazifische Inseln) und
**Mittelmeer**. Privates, nicht-kommerzielles Projekt.

## Funktionen

| Bereich | Umfang |
| --- | --- |
| Entdecken | Kategorien (Fische, Meerestiere, Korallen & Pflanzen), tippfehlertolerante Suche über deutsche, englische und wissenschaftliche Namen sowie Familie, Merkmalsfilter mit Icon-Chips und Live-Trefferzahl (innerhalb eines Typs ODER, zwischen Typen UND) |
| Artenseite | Fotogalerie mit Bildnachweis pro Foto, Steckbrief, IUCN-Status, Verbreitungskarte, eigene Sichtungen, Gesehen / Gefällt mir / Zu Sammlung, ähnliche Arten und Vergleichsansicht |
| Bestimmen | Foto-ID per Claude (Top 5 mit Konfidenz, nur Arten aus dem Regionskatalog, Warteschlange ohne Netz) und geführte Bestimmung über Merkmale |
| Logbuch | Tauchgänge mit Basisdaten, Bedingungen, Typ, Ausrüstung (letzte übernehmen), Sichtungen, Notizen, Bewertung; Statistik; Tauchplätze mit Karte; Import (UDDF, Subsurface-XML, CSV inkl. Profil, Duplikaterkennung); Export (CSV, UDDF) |
| Sammlung | Lebensliste mit Fortschritt gesamt, pro Kategorie und Region, Animation bei Erstsichtung, Alben (teilbar per Link), Favoriten |
| Profil | Konto & Sync, Offline-Bildpaket, Einheiten (m/ft, °C/°F, bar/psi), Hell/Dunkel, Deutsch/Englisch, Sicherung, Bildnachweise |

## Architektur

- **App**: React + TypeScript + Vite, React Router, Zustand, i18next, Leaflet/OpenStreetMap, `vite-plugin-pwa`.
- **Lokale Daten**: SQLite im Browser (sql.js). Die Nutzerdatenbank wird nach jeder Änderung in
  IndexedDB gesichert; der Katalog (`public/catalog/catalog.sqlite`) wird per `ATTACH` eingebunden.
  Migrationen: `src/db/migrations.ts`.
- **Katalog als Paket**: versionierte SQLite-Datei plus WebP-Fotos; App-Shell, Katalog und
  Vorschaubilder werden vom Service Worker vorgehalten, große Fotos per „Offline-Paket“.
- **Sync** (`src/sync`): Zwei-Wege-Sync mit Supabase. Jede Nutzertabelle hat `updated_at`,
  `deleted_at` (Soft Delete) und serverseitig `synced_at`; die neueste Änderung gewinnt
  (zusätzlich per Trigger auf dem Server abgesichert). Row Level Security: nur eigene Zeilen.
- **Foto-ID** (`supabase/functions/identify`): Edge Function ruft Claude mit dem Foto und der
  Kandidatenliste der Region auf und liefert bis zu 5 Vorschläge mit Konfidenz; Monatskontingent pro Nutzer.
- **Sammelfortschritt** wird immer aus den Sichtungen berechnet, nicht gespeichert (`src/user/lifelist.ts`).

## Entwicklung

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run lint && npm run typecheck
```

```bash
npm run build && npm run preview
```

Die Supabase-Verbindung kommt aus `.env.production` / `.env.development` (öffentliche URL und
Anon-Key – geschützt wird über Row Level Security). Ohne diese Werte läuft die App rein lokal.

## Datenpipeline (`data-pipeline/`)

Erzeugt `public/catalog/catalog.sqlite`, `catalog-manifest.json` und die Fotos aus offenen Quellen.
Benötigt Python 3.11+ mit `pyarrow` und `Pillow` (`pip install -r data-pipeline/requirements.txt`).

```bash
python data-pipeline/pipeline.py all
```

Schritte einzeln: `candidates` → `enrich` → `traits` → `photos` → `build` (`seed` baut den kleinen
Entwicklungskatalog ohne Netz). Antworten der Quellen werden in `data-pipeline/cache` gespeichert.

| Quelle | Verwendung | Lizenz / Hinweis |
| --- | --- | --- |
| iNaturalist | Artenauswahl nach Beobachtungshäufigkeit, Trivialnamen, Fotos | nur Fotos mit CC0 oder CC BY; Autor, Lizenz und Quelle werden je Foto gespeichert und angezeigt |
| WoRMS | gültiger wissenschaftlicher Name, Familie, Filter auf Meeresarten | CC BY 4.0 |
| GBIF | Fundorte für die Regionszuordnung, IUCN-Status-Kürzel | je Datensatz |
| FishBase / SeaLifeBase | Größe, Tiefe, Lebensraum, Körperform, deutsche Namen | CC BY-NC – nur nicht-kommerziell |

**Merkmale** (Farbe, Muster, Körperform, Verhalten, Auftreten) stehen in
`data-pipeline/input/traits.csv`: ein KI-Vorschlag pro Art, Spalte `reviewed` für die manuelle
Prüfung. Arten ohne Eintrag bekommen automatische Vorschläge (Körperform aus FishBase/Familie,
Lebensraum) und landen zur Prüfung in `input/traits_review.csv`. Beschreibungstexte werden aus den
strukturierten Daten neu formuliert, keine Texte werden übernommen. Es werden keine Inhalte aus
Seabook oder anderen kommerziellen Apps verwendet.

## Supabase

- Migrationen: `supabase/migrations/` (bereits auf das Projekt `tauchlog` angewendet).
- **Login per E-Mail-Link**: In Supabase unter *Authentication → URL Configuration* die
  Vercel-URL als *Site URL* und `https://<deine-domain>/**` als *Redirect URL* eintragen.
  Der Standard-Mailversand von Supabase ist stark begrenzt; für mehr Nutzer einen eigenen SMTP-Server hinterlegen.
- **Apple/Google**: Provider in Supabase aktivieren und `VITE_AUTH_PROVIDERS=google,apple` setzen.
- **Foto-ID**: unter *Edge Functions → Secrets* `ANTHROPIC_API_KEY` eintragen. Optional
  `PHOTO_ID_MODEL` (Standard `claude-sonnet-5-5`, günstiger: `claude-haiku-5-5`) und
  `PHOTO_ID_MONTHLY_LIMIT` (Standard 50 Fotos pro Nutzer und Monat).

## Deployment

Vercel baut aus diesem Repository (`vercel.json`: Vite-Build, SPA-Rewrites, Cache-Header).
