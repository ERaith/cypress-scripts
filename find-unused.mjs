#!/usr/bin/env node
// Usage: node scripts/find-unused-steps.mjs
// Options (env): STEP_GLOB="cypress/e2e/**/*.steps.{js,ts}" FEATURE_GLOB="cypress/e2e/**/*.feature"

import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";

const STEP_GLOB   = process.env.STEP_GLOB   || "cypress/e2e/**/*.steps.{js,ts}";
const FEATURE_GLOB= process.env.FEATURE_GLOB|| "cypress/e2e/**/*.feature";

// --- utilities ---------------------------------------------------------------

/** Convert a Cucumber Expression into a regex string */
function cucumberExprToRegex(expr) {
  // Handle parameter types (common built-ins)
  // You can extend this map if you use custom parameter types.
  const map = {
    "{int}": "(-?\\d+)",
    "{float}": "(-?\\d+(?:[.,]\\d+)?)",
    "{word}": "(\\S+)",
    "{string}": '"([^"]*)"|\'([^\']*)\'|`([^`]*)`', // quoted strings
    "{bigint}": "(-?\\d+)",
    "{byte}": "(-?\\d+)",
    "{short}": "(-?\\d+)",
    "{double}": "(-?\\d+(?:[.,]\\d+)?)",
    "{biginteger}": "(-?\\d+)",
    "{uuid}": "([0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})",
    // Match anything until EOL if you use {string} without quotes:
    "{any}": "(.+)"
  };
  let s = expr.trim();
  for (const [k, v] of Object.entries(map)) {
    s = s.split(k).join(v);
  }
  // Escape regex specials outside of the replaced tokens
  // (Quick-and-safe: escape all, then unescape groups we inserted)
  const special = /[.*+?^${}()|[\]\\]/g;
  s = s.replace(special, "\\$&");
  // Re-insert our groups (we escaped parentheses above)
  for (const v of Object.values(map)) {
    const escaped = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    s = s.split(escaped).join(v);
  }
  // Allow flexible whitespace
  s = s.replace(/\s+/g, "\\s+");
  return `^${s}$`;
}

/** Extract regex literal from something like Given(/foo/i, ...) */
function extractRegexLiteral(lit) {
  // /pattern/flags
  const m = lit.match(/^\/(.+)\/([a-z]*)$/i);
  if (!m) return null;
  return { source: m[1], flags: m[2] || "" };
}

function tryBuildRegExp(pattern, flags = "") {
  try {
    return new RegExp(pattern, flags);
  } catch (e) {
    return null;
  }
}

/** Read file safely */
async function read(file) {
  try { return await fs.readFile(file, "utf8"); } catch { return ""; }
}

// --- step extraction ---------------------------------------------------------

// Match StepDefinition registrations: Given|When|Then|And|But|defineStep( pattern, fn )
const STEP_CALL_RE =
  /(?:\b(?:Given|When|Then|And|But|defineStep)\s*\(\s*)([^,]+)\s*,/g;

/** Pull step patterns out of a step-def file. */
function extractStepPatternsFromSource(src, file) {
  const patterns = [];
  let m;
  while ((m = STEP_CALL_RE.exec(src)) !== null) {
    const raw = m[1].trim();

    // Cases:
    // 1) regex literal: /foo/i
    // 2) string literal: "I do {int} things"
    // 3) template string: `I click {word}`
    // We'll ignore variables/idents; static-only.
    if (raw.startsWith("/")) {
      const lit = raw.split(/\s/)[0]; // take the literal token
      const r = extractRegexLiteral(lit);
      if (r) {
        const re = tryBuildRegExp(r.source, r.flags);
        if (re) patterns.push({ file, type: "regex", raw: lit, regexp: re });
      }
    } else if ((raw.startsWith("'") && raw.endsWith("'")) ||
               (raw.startsWith('"') && raw.endsWith('"'))) {
      const inner = raw.slice(1, -1);
      const reSrc = cucumberExprToRegex(inner);
      const re = tryBuildRegExp(reSrc, "i");
      if (re) patterns.push({ file, type: "expr", raw: inner, regexp: re });
    } else if (raw.startsWith("`") && raw.endsWith("`")) {
      const inner = raw.slice(1, -1);
      const reSrc = cucumberExprToRegex(inner);
      const re = tryBuildRegExp(reSrc, "i");
      if (re) patterns.push({ file, type: "expr", raw: inner, regexp: re });
    } else {
      // Non-literal (variable), skip
      patterns.push({ file, type: "unparsed", raw, skipped: true });
    }
  }
  return patterns;
}

// --- feature scanning --------------------------------------------------------

const FEATURE_STEP_RE = /^\s*(?:Given|When|Then|And|But)\s+(.*\S)\s*$/i;

function extractFeatureSteps(featureText) {
  const steps = [];
  for (const line of featureText.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue; // comment
    const m = line.match(FEATURE_STEP_RE);
    if (m) steps.push(m[1].trim());
  }
  return steps;
}

// --- main -------------------------------------------------------------------

const main = async () => {
  const stepFiles = await fg(STEP_GLOB, { dot: false });
  const featureFiles = await fg(FEATURE_GLOB, { dot: false });

  const allPatterns = (
    await Promise.all(
      stepFiles.map(async (f) =>
        extractStepPatternsFromSource(await read(f), f)
      )
    )
  ).flat();

  const featureSteps = (
    await Promise.all(featureFiles.map(read))
  ).flatMap(extractFeatureSteps);

  // Pre-normalize feature steps for quick matching
  const featureCache = featureSteps.map((s) => s);

  // Match
  const usage = allPatterns.map((p) => {
    if (!p.regexp) return { ...p, used: null };
    const used = featureCache.some((step) => p.regexp.test(step));
    return { ...p, used };
  });

  // Report
  const unused = usage.filter((u) => u.used === false);
  const parsed = usage.filter((u) => u.used !== null);
  const skipped = usage.filter((u) => u.used === null);

  const rel = (f) => path.relative(process.cwd(), f);

  console.log("== Step Usage Summary ==");
  console.log(`Step files: ${stepFiles.length}`);
  console.log(`Feature files: ${featureFiles.length}`);
  console.log(`Total step defs (parsed): ${parsed.length}`);
  console.log(`Unused (parsed): ${unused.length}`);
  console.log(`Unparsed (skipped due to variables/indirection): ${skipped.length}`);
  console.log("");

  if (unused.length) {
    console.log("== UNUSED STEP DEFINITIONS ==");
    for (const u of unused) {
      console.log(`• ${rel(u.file)}  —  ${u.type === "regex" ? u.raw : `"${u.raw}"`}`);
    }
    console.log("");
  } else {
    console.log("No unused parsed steps found. 🎉\n");
  }

  if (skipped.length) {
    console.log("== SKIPPED (non-literal patterns) ==");
    for (const s of skipped.slice(0, 50)) {
      console.log(`• ${rel(s.file)}  —  ${s.raw}`);
    }
    if (skipped.length > 50) {
      console.log(`…and ${skipped.length - 50} more`);
    }
    console.log("\n(Hint: use literal regex or Cucumber Expressions to let the script parse them.)\n");
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
