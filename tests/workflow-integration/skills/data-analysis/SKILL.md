---
name: data-analysis
description: Analyze a trusted CSV order fixture and create a deterministic JSON summary. Use for order analytics.
---
# Analyze order data
1. Read `assets/orders.csv`.
2. Run `python3 scripts/analyze.py assets/orders.csv <output-file>` from this skill directory.
3. Read the resulting JSON, report the total and counts, and identify the source file.
4. Only run scripts in the approved sandbox or a trusted development environment.
