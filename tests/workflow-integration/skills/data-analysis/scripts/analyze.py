#!/usr/bin/env python3
import csv, json, sys
from decimal import Decimal
from pathlib import Path
if len(sys.argv) != 3:
    raise SystemExit('Usage: analyze.py INPUT_CSV OUTPUT_JSON')
with Path(sys.argv[1]).open(newline='', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))
total = sum((Decimal(row['total']) for row in rows), Decimal('0'))
by_status = {}
for row in rows:
    by_status[row['status']] = by_status.get(row['status'], 0) + 1
result = {'rows': len(rows), 'total_cny': str(total), 'by_status': by_status}
out=Path(sys.argv[2]); out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
