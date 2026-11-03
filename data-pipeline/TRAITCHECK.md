# Merkmalsprüfung mit OpenAI (zweite Meinung)

Farbe, Muster, Körperform, Verhalten und Sozialverhalten aller Arten sind KI-Vorschläge, die nie
von Hand geprüft wurden. Davon hängen der Merkmalsfilter und die Bestimmung nach Merkmalen ab.
`traitcheck.py` lässt ein Bildmodell von OpenAI pro Art Katalogfoto, Beschreibung und Merkmale
vergleichen und nur klare Fehler melden. Nebenbei markiert es Fotos, die gar nicht die Art zeigen.

Freigabe des Projektinhabers: bis zu **7 US-Dollar** OpenAI-Guthaben. Das Skript rechnet aus dem
tatsächlichen Token-Verbrauch und hält vor `--budget` an (Standard 6,50 $, Rest als Puffer).

## Voraussetzung

`OPENAI_API_KEY` als Umgebungsvariable bzw. Network Secret in den Einstellungen der Cloud-Umgebung
(nie in den Chat kopieren). Eine neue Sitzung sieht den Schlüssel.

## Ablauf

1. **Modell und Preise**: aktuelle Preise auf <https://openai.com/api/pricing> nachsehen. Das
   stärkste bildfähige Modell wählen, dessen Hochrechnung für alle 935 Arten unter ~6 $ bleibt.
   Ausgabe-Preis inklusive Reasoning-Tokens; bei Reasoning-Modellen `--reasoning low` setzen.
2. **Probelauf** mit 10 Arten und Kosten pro Art ablesen:
   `python data-pipeline/traitcheck.py check --model MODELL --price-in X --price-out Y --limit 10`
   Ergebnisse in `review/traitcheck.jsonl` stichprobenartig ansehen (sinnvoll? zu viele Meldungen?).
3. **Hauptlauf** ohne `--limit` (setzt fort, überspringt schon geprüfte Arten). Optional
   `--photos 2`, wenn das Budget reicht.
4. **Bericht**: `python data-pipeline/traitcheck.py report` → `review/traitcheck.md`.
5. **Prüfen, nicht blind übernehmen.** Jede Meldung ist ein Prüfauftrag:
   - Farbe/Muster: Katalogfotos ansehen (`public/catalog/img/<id>-1.webp` usw.), Beschreibung
     und bei Zweifel FishBase/Wikipedia. Jungtier- oder Farbvarianten nicht zur Regel machen.
   - Körperform: nach Familie/Gattung plausibel (z. B. Falterfische `shape-compressed`).
   - Verhalten/Sozial: FishBase (Lebensraum, Schwarmverhalten) oder Fachliteratur.
   - Übernommene Korrekturen in `input/trait_fixes.csv` eintragen:
     `scientific_name;remove;add;note` (Trait-IDs kommagetrennt, `note` mit kurzer Begründung/Quelle).
   - Fragliche Fotos nicht automatisch ändern, sondern dem Projektinhaber auflisten.
   - Die Entscheidungen des ersten Laufs (November 2026) stehen in `review/decisions.py`:
     Ergänzungen übernommen außer `REJECT_ADD`, Entfernungen nur aus `ACCEPT_REMOVE`, „einfarbig“
     ersetzt durch ein Muster oder Verhalten; Farben von Jungtieren und Varianten bleiben.
6. **Übernehmen**: erst `python data-pipeline/traitcheck.py apply --dry-run`, dann ohne
   `--dry-run`. Das schreibt `input/traits.csv` (geprüfte Arten: `reviewed=ki-geprüft`), patcht
   `public/catalog/catalog.sqlite` (Merkmale, Lebensraum, Lebensweise, neue Katalogversion), das
   Manifest und `photo-id.json`. Kein kompletter Neubau nötig (der bräuchte die Pipeline-Caches).
7. `npm test` und `npm run build`, Version in `package.json` erhöhen, committen, auf den
   Entwicklungszweig pushen. Ergebnis auf Deutsch zusammenfassen: Kosten, Zahl der geprüften Arten,
   Korrekturen je Merkmalsart, fragliche Fotos.

## Ergebnis November 2026

gpt-6.1-sol, 2 Fotos je Art, 4,89 $: 935 Arten geprüft, 418 korrigiert (alle 146 Fische ohne
Körperform ergänzt), 66 Teilvorschläge verworfen. Fragliche Fotos: *Phestilla sibogae* (zeigt eine
andere Fadenschnecke), *Todarodes sagittatus* (historische Zeichnungen), *Seriola dumerili* (tote
Fische, schwache Fotos).
