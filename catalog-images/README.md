# Katalogfotos

Fotos und Vorschaubilder des Artenkatalogs, als eigenes Vercel-Projekt **aqua-katalog**
(Root Directory `catalog-images`) veröffentlicht. Die App leitet `/catalog/img/…` und
`/catalog/thumb/…` dorthin weiter (`vercel.json` im Wurzelverzeichnis), für Nutzer und das
Offline-Paket bleiben die Adressen gleich.

Warum getrennt: Die Fotos (über 90 MB) ändern sich selten, die App oft. Lagen sie in der App,
speicherte jede Veröffentlichung sie neu, und der Speicher bei Vercel lief voll. Dieses Projekt
veröffentlicht nur, wenn sich hier etwas ändert (`ignoreCommand` in `vercel.json`).

Geschrieben wird der Ordner von `data-pipeline/pipeline.py build`; jede Bildadresse im Katalog
trägt einen Fingerabdruck der Datei (`?v=…`).
