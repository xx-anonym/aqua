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
| Entdecken | Kategorien (Fische, Meerestiere, Korallen & Pflanzen), tippfehlertolerante Suche über deutsche, englische und wissenschaftliche Namen sowie Familie, Merkmalsfilter mit Icon-Chips und Live-Trefferzahl (innerhalb eines Typs ODER, zwischen Typen UND), Region oder Land (z. B. Ägypten am Roten Meer) |
| Artenseite | Fotogalerie mit Bildnachweis pro Foto, Steckbrief, IUCN-Status, Verbreitungskarte, eigene Sichtungen, Gesehen / Gefällt mir / Zu Sammlung, ähnliche Arten und Vergleichsansicht |
| Bestimmen | Foto-ID per Claude (Top 5 mit Konfidenz, nur Arten aus dem Regionskatalog, Warteschlange ohne Netz) und geführte Bestimmung über Merkmale |
| Logbuch | Tauchgänge mit Basisdaten, Bedingungen, Typ, Ausrüstung (letzte übernehmen), Sichtungen, Notizen, Bewertung; Statistik; Tauchplätze mit Karte und Suche im PADI-Verzeichnis; Import (UDDF, Subsurface-XML, CSV inkl. Profil, Duplikaterkennung); Export (CSV, UDDF) |
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
Benötigt Python 3.11+ mit `pyarrow`, `Pillow` und `babel` (`pip install -r data-pipeline/requirements.txt`).

```bash
python data-pipeline/pipeline.py all
```

Schritte einzeln: `candidates` → `enrich` → `traits` → `photos` → `destinations` → `names` → `build` (`seed` baut den kleinen
Entwicklungskatalog ohne Netz). Antworten der Quellen werden in `data-pipeline/cache` gespeichert.

| Quelle | Verwendung | Lizenz / Hinweis |
| --- | --- | --- |
| iNaturalist | Artenauswahl nach Beobachtungshäufigkeit, Trivialnamen, Fotos | nur Fotos mit CC0 oder CC BY; Autor, Lizenz und Quelle werden je Foto gespeichert und angezeigt |
| WoRMS | gültiger wissenschaftlicher Name, Familie, Filter auf Meeresarten | CC BY 4.0 |
| GBIF | Fundorte für die Zuordnung zu Regionen und Ländern, IUCN-Status-Kürzel | je Datensatz |
| FishBase / SeaLifeBase | Größe, Tiefe, Lebensraum, Körperform, deutsche Namen | CC BY-NC – nur nicht-kommerziell |

**Merkmale** (Farbe, Muster, Körperform, Verhalten, Auftreten) stehen in
`data-pipeline/input/traits.csv`: ein KI-Vorschlag pro Art, Spalte `reviewed` für die manuelle
Prüfung. Arten ohne Eintrag bekommen automatische Vorschläge (Körperform aus FishBase/Familie,
Lebensraum) und landen zur Prüfung in `input/traits_review.csv`. Beschreibungstexte werden aus den
strukturierten Daten neu formuliert, keine Texte werden übernommen.

**Deutsche Namen** (`names`): Fehlt ein deutscher Name aus iNaturalist/FishBase, sucht die Stufe
in Wikidata (Volksname, Titel des deutschen Wikipedia-Artikels; wird übersprungen, wenn Wikimedia
die Anfragen drosselt) und WoRMS. Was dann noch fehlt, steht
als Übersetzung des englischen Namens in `input/names_de.csv`. Ein Name, den mehrere Arten tragen
(z. B. „Nacktschnecke“), bleibt bei der meistbeobachteten Art; die anderen bekommen einen eigenen.
`common_name_de` in `traits.csv` überschreibt alles (`-` = keinen deutschen Namen zeigen).

**Länder** (`destinations`): Pro Region fragt die Pipeline bei GBIF ab, vor welchen Ländern welche
Katalogarten beobachtet wurden (Ländernamen aus CLDR über `babel`). Angeboten werden Länder mit
genug Funden und mindestens 25 Arten; Randeffekte der groben Regionsgrenzen stehen in
`DESTINATION_SKIP`. Arten, deren Funde fast nur auf einer Seite der Grenze Mittelmeer/Indopazifik
liegen, brauchen auf der anderen Seite mindestens 10 Funde (`realm_cleanup`), sonst würden
Fehlbestimmungen z. B. Mittelmeerbrassen ins Rote Meer bringen. Es werden keine Inhalte aus
Seabook oder anderen kommerziellen Apps verwendet.

## Supabase

- Migrationen: `supabase/migrations/` (bereits auf das Projekt `tauchlog` angewendet).
- **Login per E-Mail-Code**: Die App schickt einen Code statt eines Links (ein Link würde auf dem
  iPhone in Safari statt in der installierten App landen). In Supabase unter *Authentication → URL
  Configuration* die Vercel-URL als *Site URL* und `https://<deine-domain>/**` als *Redirect URL*
  eintragen. Eigene Mail-Vorlagen brauchen einen eigenen SMTP-Server (*Authentication → Emails → SMTP*).
- **Mail-Vorlage**: `supabase/templates/sign-in-code.html` unter *Authentication → Emails → Templates*
  in **Magic Link** und **Confirm signup** einfügen, Betreff jeweils
  `{{ .Token }} ist dein Anmeldecode für Aqua`.
- **Google/Apple**: Provider in Supabase unter *Authentication → Sign In / Providers* aktivieren.
  Die App fragt beim Öffnen des Profils ab, welche Anbieter aktiv sind, und zeigt die Knöpfe dann
  automatisch an (kein neuer Build nötig). Für Google: OAuth-Client vom Typ *Webanwendung* in der
  Google Cloud Console mit der Weiterleitungs-URI `https://kkppnegmlvplxpvcuhkn.supabase.co/auth/v1/callback`.
- **Foto-ID**: unter *Edge Functions → Secrets* `ANTHROPIC_API_KEY` eintragen. Optional
  `PHOTO_ID_MODEL` (Standard `claude-sonnet-5-5`, günstiger: `claude-haiku-5-5`) und
  `PHOTO_ID_MONTHLY_LIMIT` (Standard 50 Fotos pro Nutzer und Monat).

## Deployment

Vercel baut aus diesem Repository (`vercel.json`: Vite-Build, SPA-Rewrites, Cache-Header).

Serverless-Funktionen in `api/`:

- `api/keepalive.ts`: Vercel-Cronjob, hält das Supabase-Projekt im Free-Plan aktiv.
- `api/divesites.ts`: Tauchplätze in der Nähe aus dem PADI Dive Guide für „Tauchplatz anlegen“
  (`/api/divesites?lat=…&lng=…&km=30` um einen Punkt oder `?n=…&s=…&e=…&w=…` für einen
  Kartenausschnitt bis 4° Seitenlänge). Fragt PADI nur bei Bedarf ab, die Antwort
  wird einen Tag im CDN zwischengespeichert; gespeichert wird nur der Platz, den man auswählt.
  Genutzt mit Genehmigung für dieses private, nicht-kommerzielle Projekt. PADI bietet dafür keine
  offizielle Schnittstelle, die Abfragen können sich also ändern. SSI ist nicht angebunden, weil
  deren Karte einen Zugangsschlüssel ihrer eigenen Webseite voraussetzt.
