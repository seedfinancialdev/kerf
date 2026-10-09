// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Runs dependency-cruiser and fails on any violation, or if it cruised no modules at all
// (a parser that silently skips every file would otherwise report a false green).
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["exec", "depcruise", "packages", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(result.stdout);
  console.error(result.stderr);
  console.error("dependency-cruiser did not produce a JSON report.");
  process.exit(1);
}

const { totalCruised, error, violations } = report.summary;
if (totalCruised === 0) {
  console.error("dependency-cruiser cruised 0 modules: the parser is not reading the sources.");
  process.exit(1);
}
if (error > 0) {
  for (const v of violations.filter((x) => x.rule.severity === "error")) {
    console.error(`${v.rule.name}: ${v.from} -> ${v.to}`);
  }
  console.error(`${error} dependency rule violation(s).`);
  process.exit(1);
}
console.log(`dependency-cruiser: ${totalCruised} modules cruised, no violations.`);
