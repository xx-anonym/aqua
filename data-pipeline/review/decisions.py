"""Review decisions for the trait check: turns review/traitcheck.jsonl into input/trait_fixes.csv.
Additions are accepted unless listed in REJECT_ADD; removals only when listed in ACCEPT_REMOVE
(or replacing "plain" by a pattern, or behaviour); colours of juveniles and variants stay."""
import csv, json, os, sqlite3, sys
from collections import defaultdict
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
# Compare against the catalog the check ran on (before `traitcheck.py apply`), e.g. from git:
#   git show <commit>:public/catalog/catalog.sqlite > /tmp/before.sqlite
#   python data-pipeline/review/decisions.py /tmp/before.sqlite
if len(sys.argv) != 2:
    sys.exit('usage: decisions.py CATALOG_BEFORE_APPLY.sqlite')
con = sqlite3.connect(sys.argv[1])
traits = defaultdict(set)
for sid, tid in con.execute('select species_id, trait_id from species_trait'):
    traits[sid].add(tid)
prefix = {'color': 'color-', 'pattern': 'pattern-', 'body_shape': 'shape-', 'behavior': 'behav-', 'social': 'social-'}

# Additions that do not hold up (uncertain, or not what a diver sees).
REJECT_ADD = {
    ('Bonellia viridis', 'behav-nocturnal'),            # proboscis is seen by day as well
    ('Pteraeolidia semperi', 'behav-symbiosis'),        # algae in its tissue, invisible to divers
    ('Monetaria annulus', 'pattern-stripes'),           # a ring around the shell, not stripes
    ('Cotylorhiza tuberculata', 'pattern-spots'),       # appendage tips, the jellyfish is not spotted
    ('Entacmaea quadricolor', 'social-colony'),         # anemones are single animals
    ('Sycon capricorn', 'social-colony'),               # solitary sponge
}
# Removals are accepted only when the finding is clearly right; colours of juveniles or variants stay.
ACCEPT_REMOVE = {
    ('Abudefduf sexfasciatus', 'color-yellow'), ('Amplexidiscus fenestrafer', 'color-blue'),
    ('Hemimycale arabica', 'color-orange'), ('Hemimycale arabica', 'color-red'),
    ('Sousa plumbea', 'color-pink'),                    # pink adults are the related Sousa chinensis
    ('Torpedo panthera', 'color-blue'),
    ('Caryophyllia (Caryophyllia) inornata', 'shape-massive'), ('Ctenactis crassa', 'shape-massive'),
    ('Herpolitha limax', 'shape-massive'), ('Lobactis scutaria', 'shape-massive'),
    ('Diplodus cervinus', 'shape-fusiform'), ('Monotaxis heterodon', 'shape-fusiform'),
    ('Pseudogoniistius nigripes', 'shape-fusiform'), ('Xyrichtys novacula', 'shape-fusiform'),
    ('Leptopsammia pruvoti', 'social-colony'), ('Spirobranchus corniculatus', 'social-colony'),
}
# Body shapes made consistent within families (wrasses and parrotfish are spindle-shaped; the
# deeper-bodied ones also get "compressed" so either choice in the filter finds them).
SHAPE_OVERRIDE = {
    **{n: ['shape-fusiform', 'shape-compressed'] for n in [
        'Scarus rubroviolaceus', 'Scarus niger', 'Scarus ferrugineus', 'Chlorurus spilurus', 'Chlorurus sordidus',
        'Chlorurus strongylocephalus', 'Sparisoma cretense', 'Symphodus tinca', 'Symphodus roissali',
        'Symphodus mediterraneus', 'Hemigymnus melapterus', 'Achoerodus viridis', 'Notolabrus gymnogenis',
        'Labrus merula', 'Cheilinus lunulatus']},
    'Thalassoma lunare': ['shape-fusiform'], 'Thalassoma rueppellii': ['shape-fusiform'],
    'Pseudanthias squamipinnis': ['shape-fusiform'], 'Ostorhinchus limenus': ['shape-compressed'],
    'Scolopsis bilineata': ['shape-fusiform'],
}

rows = [json.loads(l) for l in open(f'{ROOT}/data-pipeline/review/traitcheck.jsonl')]
fixes = {}
rejected = []
for r in rows:
    name, sid = r['scientific_name'], r['id']
    add, remove, notes = set(), set(), []
    for f in r['result'].get('findings', []):
        p = prefix[f['trait_type']]
        if f['trait_type'] == 'body_shape' and name in SHAPE_OVERRIDE:
            continue
        adds = [a for a in f['add'] if (name, a) not in REJECT_ADD]
        rejected += [(name, '+' + a) for a in f['add'] if (name, a) in REJECT_ADD]
        for x in f['remove']:
            plain_replaced = x == 'pattern-plain' and any(a.startswith('pattern-') for a in adds)
            if f['trait_type'] == 'behavior' or plain_replaced or (name, x) in ACCEPT_REMOVE:
                remove.add(x)
            else:
                rejected.append((name, '-' + x))
        add.update(adds)
        if adds or set(f['remove']) & remove:
            notes.append(f['reason'].split('. ')[0][:90])
    if name in SHAPE_OVERRIDE:
        add.update(SHAPE_OVERRIDE[name])
        notes.append('body shape consistent with the family')
    add -= traits[sid]
    remove &= traits[sid]
    if add or remove:
        fixes[name] = (sorted(remove), sorted(add), ' | '.join(notes).replace(';', ','))
print(len(fixes), 'species with fixes;', len(rejected), 'rejected parts')
if not fixes:
    sys.exit('no fixes: is this the catalog from before applying them? trait_fixes.csv left unchanged')
with open(f'{ROOT}/data-pipeline/input/trait_fixes.csv', 'w', newline='', encoding='utf-8') as fh:
    fh.write('# Geprüfte Korrekturen aus der Merkmalsprüfung (review/traitcheck.jsonl), siehe TRAITCHECK.md\n')
    w = csv.writer(fh, delimiter=';', lineterminator='\n')
    w.writerow(['scientific_name', 'remove', 'add', 'note'])
    for name in sorted(fixes):
        rm, ad, note = fixes[name]
        w.writerow([name, ','.join(rm), ','.join(ad), note])
from collections import Counter
print(Counter(t.split('-')[0] for _, (rm, ad, _) in fixes.items() for t in ad), 'added by type')
print(Counter(t.split('-')[0] for _, (rm, ad, _) in fixes.items() for t in rm), 'removed by type')
