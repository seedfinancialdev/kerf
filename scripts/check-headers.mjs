// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Fails if any source file is missing the GPL-3.0 header. Run by `pnpm lint`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SOURCE = /\.(ts|tsx|mjs|cjs|js|css)$/;
const MARKER = "SPDX-License-Identifier: GPL-3.0-only";

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f && SOURCE.test(f));

const missing = tracked.filter((f) => !readFileSync(f, "utf8").slice(0, 400).includes(MARKER));

if (missing.length > 0) {
  console.error(`Missing GPL-3.0 header:\n${missing.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`GPL-3.0 header present in ${tracked.length} source files.`);
