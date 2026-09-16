#!/usr/bin/env python3
"""
reference_scan.py — ANSWER KEY, NOT THE PRODUCT.

This is a quick hand-written pass over ledger-web to confirm the seeded
fixture actually triggers every intended risk pattern, and to give Iram
a working report.json to preview the dashboard against before running
the real build in Factory.

Flag Guardian itself — the thing the interview is evaluating — should be
built by Droid from the spec in AGENTS.md, not from this script. Compare
Droid's report.json against this one; they should roughly agree. Where
they don't, that's a good "what I had to correct" story for the
discussion half of the interview.
"""
import json
import re
from datetime import date, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CONFIG = json.loads((REPO / "flags.config.json").read_text())
CODE_FILES = list(REPO.glob("routes/*.js")) + list(REPO.glob("services/*.js")) + list(REPO.glob("legacy/*.js"))

TODAY = date(2026, 9, 16)


def code_text():
    return {f: f.read_text() for f in CODE_FILES}


def find_key_references(key, texts):
    hits = []
    for f, text in texts.items():
        if key in text:
            hits.append(f.relative_to(REPO).as_posix())
    return hits


def is_commented_out(key, texts):
    for f, text in texts.items():
        for line in text.splitlines():
            stripped = line.strip()
            if key in stripped and stripped.startswith("//"):
                return True
    return False


def has_fallback_at_reference(key, texts):
    for f, text in texts.items():
        if key not in text:
            continue
        # crude but good enough for this fixture: fallback present
        # within a couple of lines of the isEnabled(key ...) call
        idx = text.find(key)
        window = text[idx: idx + 120]
        return "fallback" in window
    return None  # key not found in code at all


def overdue_todo(text):
    m = re.search(r"TODO:\s*remove by (\d{4}-\d{2}-\d{2})", text)
    if not m:
        return False
    due = datetime.strptime(m.group(1), "%Y-%m-%d").date()
    return due < TODAY


def days_since(date_str):
    return (TODAY - datetime.strptime(date_str, "%Y-%m-%d").date()).days


def classify():
    texts = code_text()
    all_code = "\n".join(texts.values())
    known_keys = {f["key"] for f in CONFIG["flags"]}
    results = []

    # 1. Flags declared in config
    for f in CONFIG["flags"]:
        key = f["key"]
        refs = find_key_references(key, texts)
        findings = []

        if not refs:
            findings.append("orphaned_in_config")
            risk = "medium"
            rec = "No code references found. Confirm it's truly dead, then delete the config entry."
        else:
            commented = is_commented_out(key, texts)
            fallback = has_fallback_at_reference(key, texts)

            if commented:
                # Fully dead code — fallback/staleness checks don't apply
                # to a branch that can never execute.
                findings.append("dead_commented_out")
            else:
                if fallback is False:
                    findings.append("no_fallback")
                if f["rolloutPercent"] == 100 and days_since(f["lastModified"]) > 90:
                    findings.append("stale_at_full_rollout")

                # overdue TODO check — scan the file(s) that reference this key
                for file in refs:
                    text = (REPO / file).read_text()
                    if overdue_todo(text):
                        findings.append("overdue_removal")

            if not findings:
                risk = "healthy"
                rec = "No action needed — owned, fallback present, actively used."
            elif "dead_commented_out" in findings:
                risk = "low"
                rec = "Safe cleanup — delete the commented block and the config entry."
            elif "overdue_removal" in findings or "no_fallback" in findings:
                risk = "high"
                rec = "Prioritize: " + ", ".join(findings).replace("_", " ")
            else:
                risk = "medium"
                rec = "Schedule cleanup: " + ", ".join(findings).replace("_", " ")

        results.append({
            "key": key,
            "owner": f.get("owner"),
            "location": refs[0] if refs else "flags.config.json",
            "riskLevel": risk,
            "findings": findings if findings else ["none"],
            "recommendation": rec,
        })

    # 2. Flags referenced in code but missing from config entirely
    hardcoded_pattern = re.compile(r"\b([A-Z][A-Z0-9_]{4,})\b\s*=\s*(true|false)")
    for f, text in texts.items():
        for m in hardcoded_pattern.finditer(text):
            const_name = m.group(1)
            if const_name in known_keys:
                continue
            results.append({
                "key": const_name,
                "owner": None,
                "location": f.relative_to(REPO).as_posix(),
                "riskLevel": "high",
                "findings": ["hardcoded_bypasses_governance"],
                "recommendation": "Move behind flags.config.json with an owner and a real kill switch.",
            })

    return results


def main():
    flags = classify()
    summary = {
        "total": len(flags),
        "healthy": sum(1 for f in flags if f["riskLevel"] == "healthy"),
        "atRisk": sum(1 for f in flags if f["riskLevel"] != "healthy"),
    }
    report = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "repo": "ledger-web",
        "summary": summary,
        "flags": flags,
    }
    out = REPO / "report.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"Wrote {out} — {summary['total']} flags, {summary['atRisk']} at risk")


if __name__ == "__main__":
    main()
