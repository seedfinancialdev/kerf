#!/usr/bin/env node
// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Mutation testing, by hand-picked mutants.
//
// A mutant is one small, plausible mistake in the source: `<` for `<=`, a dropped term, a swapped
// axis. For each one this script applies the change, runs the test suites, and reports whether any
// test noticed. A mutant that SURVIVES is a gap in the tests (or a change that does not matter,
// which must then be listed in `equivalent` with the reason).
//
// Mutants live in `scripts/mutation/mutants/*.json`, see `docs/testing/MUTATION_TESTING.md`.
//
//   pnpm mutate                     run every mutant
//   pnpm mutate -- --only rabbet    run mutants whose id or file contains "rabbet"
//   pnpm mutate -- --list           list the mutants without running them
//
// The working tree must be clean for the files being mutated: the script edits them in place and
// puts them back, even if interrupted.

import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MUTANTS = join(ROOT, "scripts/mutation/mutants");
const SUITES = ["unit", "golden", "prop", "stress"];

/**
 * @typedef {object} Mutant
 * @property {string} id         Short stable name, e.g. "rabbet-shoulder-loose".
 * @property {string} file       Path from the repository root.
 * @property {string} find       Exact text to replace; must occur exactly once.
 * @property {string} replace    What it becomes.
 * @property {string} why        The mistake this stands for, in a sentence.
 * @property {string} [equivalent]  Set when the change cannot be observed; says why.
 */

/** @returns {Mutant[]} */
function loadMutants() {
  return readdirSync(MUTANTS)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => JSON.parse(readFileSync(join(MUTANTS, name), "utf8")));
}

/** True when the file has uncommitted changes, which the script would then overwrite. */
function isDirty(file) {
  const out = execFileSync("git", ["status", "--porcelain", "--", file], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return out.trim() !== "";
}

/** Runs the suites; true when any test failed (the mutant was killed). */
function suitesFail() {
  const args = ["vitest", "run", "--bail=1", ...SUITES.flatMap((s) => ["--project", s])];
  const result = spawnSync("pnpm", ["exec", ...args], { cwd: ROOT, stdio: "ignore" });
  return result.status !== 0;
}

/** What to put back if the script is interrupted while a mutant is applied. */
let pending;

process.on("SIGINT", () => {
  if (pending) writeFileSync(pending.path, pending.original);
  process.exit(130);
});

/** @param {Mutant} mutant @returns {"killed" | "survived" | "not-applied" | "dirty"} */
function trial(mutant) {
  const path = join(ROOT, mutant.file);
  if (isDirty(mutant.file)) return "dirty";
  const original = readFileSync(path, "utf8");
  if (original.split(mutant.find).length - 1 !== 1) return "not-applied";
  pending = { path, original };
  try {
    writeFileSync(
      path,
      original.replace(mutant.find, () => mutant.replace),
    );
    return suitesFail() ? "killed" : "survived";
  } finally {
    writeFileSync(path, original);
    pending = undefined;
  }
}

function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const mutants = loadMutants().filter(
    (m) => only === undefined || m.id.includes(only) || m.file.includes(only),
  );
  if (args.includes("--list")) {
    for (const m of mutants) console.log(`${m.id}\t${m.file}\t${m.why}`);
    return 0;
  }

  const counts = { killed: 0, survived: 0, equivalent: 0, "not-applied": 0, dirty: 0 };
  const problems = [];
  for (const mutant of mutants) {
    const outcome = trial(mutant);
    const shown = outcome === "survived" && mutant.equivalent ? "equivalent" : outcome;
    counts[shown] += 1;
    console.log(`${shown.padEnd(12)} ${mutant.id}`);
    if (shown === "survived" || shown === "not-applied" || shown === "dirty") {
      problems.push(`${mutant.id}: ${shown} (${mutant.why})`);
    }
  }
  console.log(
    `\n${mutants.length} mutants: ${counts.killed} killed, ${counts.equivalent} equivalent, ` +
      `${counts.survived} survived, ${counts["not-applied"]} no longer apply, ${counts.dirty} skipped (dirty).`,
  );
  for (const line of problems) console.log(`  - ${line}`);
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = main();
