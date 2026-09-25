"""Prepare private CSV classifications; output hashes only, never personal labels.
Usage: python3 scripts/prepare-fleet-groups.py input.csv /private/tmp/groups.json
People denotes named staff assets, not individual tracking.
"""
import csv, hashlib, json, re, sys, os
from collections import Counter, defaultdict

def keys(label):
    name = ' '.join(label.strip().upper().split())
    result = ['label:' + name]
    fleet = re.match(r'^(\d{4,6})(?:$|\s+[-–—]\s+|\s+\(HIDDEN\)$)', name)
    registration = re.match(r'^([A-Z]{2}\d{2}\s?[A-Z]{3})(?:$|\s+[-–—]\s+)', name)
    if fleet: result.append('fleet:' + fleet[1])
    if registration: result.append('registration:' + registration[1].replace(' ', ''))
    return [hashlib.sha256(k.encode()).hexdigest() for k in result]

def category(name, group):
    if group == 'Stock': return 'Stock'
    if group == 'Plant': return 'Plant'
    if re.search(r'\b(?:7\.5T|HGV|RIGID|ARTIC)\b', name.upper()): return 'HGV'
    description = re.split(r'\s+[-–—]\s*', name)[-1]
    if group in ('Operators','Plant Office','Non Shared','Transport','Workshop','Yard','Hydraulic Services') and description != name:
        if re.search(r'\b(?:SPARE|VAN|VEHICLE|TRAILER)\b', description.upper()): return 'Vehicles'
        return 'People'
    if re.match(r'^[A-Z]{2}\d{2}\s?[A-Z]{3}(?:$|\s)', name.upper()): return 'Vehicles'
    return 'Unclassified'

def prepare(rows):
    candidates = defaultdict(set)
    skipped = 0
    labels = set()
    for row in rows:
        name, group = row['Name'].strip(), row['Cost Centre'].strip()
        if not name or not group or re.fullmatch(r'\d+(?:\.\d+)?E[+-]?\d+', name, re.I):
            skipped += 1
            continue
        labels.add(' '.join(name.upper().split()))
        for key in keys(name): candidates[key].add((group, category(name, group)))
    records = [dict(lookup_hash=k, cost_centre=next(iter(v))[0], category=next(iter(v))[1]) for k,v in candidates.items() if len(v)==1]
    return records, dict(rows=len(rows), unique_labels=len(labels), skipped_rows=skipped, conflicting_keys=sum(len(v)>1 for v in candidates.values()), lookup_keys=len(records))

if __name__ == '__main__':
    with open(sys.argv[1], newline='', encoding='utf-8-sig') as source: rows=list(csv.DictReader(source))
    records, summary=prepare(rows)
    fd=os.open(sys.argv[2], os.O_CREAT|os.O_TRUNC|os.O_WRONLY, 0o600)
    with os.fdopen(fd,'w') as target: json.dump(records,target)
    print(json.dumps(summary))
