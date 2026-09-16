#!/usr/bin/env node
/**
 * Flag Guardian — feature-flag governance scanner for ledger-web.
 *
 * Walks the codebase (routes/, services/, legacy/, lib/), classifies every
 * feature flag against the risk rules in AGENTS.md, and writes report.json
 * at the repo root in the exact schema the dashboard renders.
 *
 *   npm run scan        (or: node tools/flag-guardian.js)
 *
 * Risk rules implemented (from AGENTS.md "Risk classification"):
 *   hardcoded_bypasses_governance — boolean constant, raw process.env check,
 *       or isEnabled("key") literal with no flags.config.json entry at all
 *   no_fallback                   — isEnabled() called without a fallback option
 *   stale_at_full_rollout         — rolloutPercent === 100, lastModified older
 *                                    than 90 days, code still branches on it
 *   dead_commented_out            — flag-gated code commented out, not deleted
 *   overdue_removal               — a "TODO: remove by <date>" comment near a
 *                                    flag check whose date has already passed
 *   orphaned_in_config            — in flags.config.json, zero matches for the
 *                                    key anywhere under routes/, services/,
 *                                    legacy/, or lib/
 *   healthy                       — owned in config, fallback present, rollout
 *                                    in-progress or recently touched. No finding.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(REPO_ROOT, "flags.config.json");
const CODE_DIRS = ["routes", "services", "legacy", "lib"];
const STALE_DAYS = 90;
const REPORT_REPO_NAME = "ledger-web";

const FINDING = {
  HARDCODED: "hardcoded_bypasses_governance",
  NO_FALLBACK: "no_fallback",
  STALE: "stale_at_full_rollout",
  DEAD: "dead_commented_out",
  OVERDUE: "overdue_removal",
  ORPHANED: "orphaned_in_config",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove // and /* *​/ comments while preserving string literals. */
function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  let state = "code"; // code | line | block | string
  let quote = "";
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = "string";
        quote = c;
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += "\n";
      }
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (state === "string") {
      out += c;
      if (c === "\\") {
        out += source[i + 1] || "";
        i += 2;
        continue;
      }
      if (c === quote) state = "code";
      i += 1;
      continue;
    }
  }
  return out;
}

/** Recursively collect .js files under the scanned code directories. */
function listCodeFiles() {
  const files = [];
  for (const dir of CODE_DIRS) {
    const dirAbs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(dirAbs)) continue;
    const stack = [[dir, dirAbs]];
    while (stack.length > 0) {
      const [rel, abs] = stack.pop();
      for (const entry of fs.readdirSync(abs)) {
        const relEntry = path.join(rel, entry);
        const absEntry = path.join(abs, entry);
        const stat = fs.statSync(absEntry);
        if (stat.isDirectory()) {
          stack.push([relEntry, absEntry]);
        } else if (entry.endsWith(".js")) {
          files.push(relEntry);
        }
      }
    }
  }
  return files.sort();
}

/** All live (non-commented) `flagClient.isEnabled("key", ...)` call spans. */
function liveIsEnabledCalls(stripped, key) {
  const re = new RegExp(`isEnabled\\(\\s*["']${escapeRegExp(key)}["']`, "g");
  const calls = [];
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const afterClose = stripped.indexOf(")", m.index);
    const end = afterClose >= 0 ? afterClose : m.index + 400;
    calls.push({
      start: m.index,
      argText: stripped.slice(m.index, end),
    });
  }
  return calls;
}

function daysSince(dateStr, today) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

function overdueByTodo(rawText, today) {
  const re = /TODO:\s*remove by\s*(\d{4}-\d{2}-\d{2})/g;
  let m;
  while ((m = re.exec(rawText)) !== null) {
    const due = new Date(`${m[1]}T00:00:00Z`);
    if (!Number.isNaN(due.getTime()) && due < today) return true;
  }
  return false;
}

/** SCREAMING_CASE boolean constants (e.g. FEATURE_NEW_DASHBOARD_ENABLED = true). */
const BOOL_CONST_RE = /\b([A-Z][A-Z0-9_]{2,})\b\s*=\s*(true|false)\s*;?/g;
/** process.env toggles that look like feature flags (FEATURE_*, *_FLAG, ...). */
const ENV_FLAG_RE = /\bprocess\.env\.([A-Z][A-Z0-9_]{2,})\b/g;
const ENV_FLAG_NAME_RE = /(FEATURE|FLAG|ENABLED|ENABLE|DISABLED|DISABLE|TOGGLE|BETA|NEW|OLD|EXPERIMENT)/;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classify(configFlags, codeFiles, today) {
  const knownKeys = new Set(configFlags.map((f) => f.key));
  const keyTexts = new Map(); // file -> { raw, stripped }
  for (const file of codeFiles) {
    const raw = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    keyTexts.set(file, { raw, stripped: stripComments(raw) });
  }

  const flags = [];

  // 1. Flags declared in flags.config.json
  for (const f of configFlags) {
    const key = f.key;
    const findings = [];
    const refsRaw = [];
    const refsLive = [];

    for (const [file, { raw, stripped }] of keyTexts) {
      if (raw.includes(key)) refsRaw.push(file);
      if (stripped.includes(key)) refsLive.push(file);
    }

    if (refsRaw.length === 0) {
      findings.push(FINDING.ORPHANED);
    } else if (refsLive.length === 0) {
      // Every reference is inside a comment: pure dead code.
      findings.push(FINDING.DEAD);
    } else {
      // No fallback: any live isEnabled(key) call without a fallback option.
      for (const file of refsLive) {
        for (const call of liveIsEnabledCalls(keyTexts.get(file).stripped, key)) {
          if (!/\bfallback\s*:/.test(call.argText)) {
            findings.push(FINDING.NO_FALLBACK);
            break;
          }
        }
        if (findings.includes(FINDING.NO_FALLBACK)) break;
      }

      // Stale at full rollout: 100% rollout, untouched for 90+ days, and the
      // code still branches on it (a live isEnabled call).
      const liveCallsExist = refsLive.some((file) =>
        liveIsEnabledCalls(keyTexts.get(file).stripped, key).length > 0
      );
      const days = daysSince(f.lastModified || "", today);
      if (
        f.rolloutPercent === 100 &&
        days !== null &&
        days > STALE_DAYS &&
        liveCallsExist
      ) {
        findings.push(FINDING.STALE);
      }

      // Overdue removal: a past-due "TODO: remove by <date>" comment in a
      // file that references the key (scan raw text — TODOs live in comments).
      for (const file of refsRaw) {
        if (overdueByTodo(keyTexts.get(file).raw, today)) {
          findings.push(FINDING.OVERDUE);
          break;
        }
      }
    }

    const riskLevel = riskFor(findings);
    flags.push({
      key,
      owner: f.owner ?? null,
      location: refsLive[0] || refsRaw[0] || "flags.config.json",
      riskLevel,
      findings: findings.length > 0 ? findings : ["none"],
      recommendation: recommend(findings, riskLevel),
    });
  }

  // 2. Flags used in code but missing from flags.config.json entirely
  //    (bypasses governance — report, never "fix").
  const discovered = new Map(); // key -> { location, reason }
  for (const [file, { stripped }] of keyTexts) {
    for (const m of stripped.matchAll(BOOL_CONST_RE)) {
      if (!knownKeys.has(m[1])) {
        if (!discovered.has(m[1])) discovered.set(m[1], { location: file });
      }
    }
    for (const m of stripped.matchAll(ENV_FLAG_RE)) {
      if (!knownKeys.has(m[1]) && ENV_FLAG_NAME_RE.test(m[1])) {
        if (!discovered.has(m[1])) discovered.set(m[1], { location: file });
      }
    }
    const literalRe = /isEnabled\(\s*["']([^"']+)["']/g;
    for (const m of stripped.matchAll(literalRe)) {
      if (!knownKeys.has(m[1])) {
        if (!discovered.has(m[1])) discovered.set(m[1], { location: file });
      }
    }
  }
  for (const [key, { location }] of discovered) {
    flags.push({
      key,
      owner: null,
      location,
      riskLevel: "high",
      findings: [FINDING.HARDCODED],
      recommendation:
        "Move behind flags.config.json with an owner and a real kill switch.",
    });
  }

  return flags;
}

function riskFor(findings) {
  if (findings.length === 0) return "healthy";
  if (findings.includes(FINDING.DEAD)) return "low";
  if (
    findings.includes(FINDING.OVERDUE) ||
    findings.includes(FINDING.NO_FALLBACK) ||
    findings.includes(FINDING.HARDCODED)
  ) {
    return "high";
  }
  return "medium";
}

function recommend(findings, riskLevel) {
  if (riskLevel === "healthy") {
    return "No action needed — owned, fallback present, actively used.";
  }
  if (findings.includes(FINDING.DEAD)) {
    return "Safe cleanup — delete the commented block and the config entry.";
  }
  if (findings.includes(FINDING.ORPHANED)) {
    return "No code references found. Confirm it's truly dead, then delete the config entry.";
  }
  if (findings.includes(FINDING.HARDCODED)) {
    return "Move behind flags.config.json with an owner and a real kill switch.";
  }
  if (riskLevel === "high") {
    return "Prioritize: " + findings.join(", ");
  }
  return "Schedule cleanup: " + findings.join(", ");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const flags = classify(config.flags || [], listCodeFiles(), today);
  const summary = {
    total: flags.length,
    healthy: flags.filter((f) => f.riskLevel === "healthy").length,
    atRisk: flags.filter((f) => f.riskLevel !== "healthy").length,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    repo: REPORT_REPO_NAME,
    summary,
    flags,
  };

  const out = path.join(REPO_ROOT, "report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `Flag Guardian: wrote ${out} — ${summary.total} flags, ` +
      `${summary.healthy} healthy, ${summary.atRisk} at risk`
  );
}

if (require.main === module) {
  main();
}

module.exports = { classify, stripComments, liveIsEnabledCalls };
