import { appendFileSync } from "node:fs";
import { CURRENT_SCHEMA_VERSION, serializeProject } from "@kerf/core";
import { readKerf, writeKerf } from "@kerf/io";
import { it } from "vitest";
import { loadProject } from "../../src/index";

const log = (...a: unknown[]) => appendFileSync("/tmp/scratch3.out", a.join(" ") + "\n");
it("bit flips", () => {
  const p = loadProject("box");
  const meta = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: "x",
    created: "2026-01-01",
    modified: "2026-01-01",
  };
  const z = writeKerf(p, meta);
  const orig = serializeProject(p);
  let ok = 0,
    changed = 0,
    threw = 0;
  const kinds = new Map<string, number>();
  for (let i = 0; i < z.length; i++) {
    for (const bit of [0, 3]) {
      const c = z.slice();
      c[i]! ^= 1 << bit;
      try {
        const r = readKerf(c);
        ok++;
        if (serializeProject(r.project) !== orig) {
          changed++;
        }
      } catch (e: any) {
        threw++;
        kinds.set(e.name, (kinds.get(e.name) ?? 0) + 1);
      }
    }
  }
  log(
    "size",
    z.length,
    "loaded-ok",
    ok,
    "loaded-with-different-project",
    changed,
    "threw",
    threw,
    JSON.stringify([...kinds]),
  );
});
