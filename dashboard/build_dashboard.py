#!/usr/bin/env python3
"""
Injects ../report.json into template.html to produce a self-contained
index.html — no fetch, no CORS issues, works by double-clicking the file.

Run this again any time report.json changes (e.g. after a real Factory
Droid scan replaces the reference one).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPORT = HERE.parent / "report.json"
TEMPLATE = HERE / "template.html"
OUT = HERE / "index.html"


def main():
    report = json.loads(REPORT.read_text())
    template = TEMPLATE.read_text()
    html = template.replace("__REPORT_JSON__", json.dumps(report))
    OUT.write_text(html)
    print(f"Wrote {OUT} from {REPORT}")


if __name__ == "__main__":
    main()
