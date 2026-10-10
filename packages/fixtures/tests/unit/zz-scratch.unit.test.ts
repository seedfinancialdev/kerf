import { appendFileSync } from "node:fs";

const log = (...a: unknown[]) => appendFileSync("/tmp/scratch.out", a.join(" ") + "\n");

import { INCH, parseProject, serializeProject, solve, validateProject } from "@kerf/core";
import { buildDisplayMesh, initGeometry, isManifold } from "@kerf/geometry";
import { readKerf } from "@kerf/io";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "../../../io/node_modules/fflate/esm/index.mjs";
import { boards } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const panel = (name: string, stock: "ply" | "wood") => ({
  name,
  length: "10in",
  width: "4in",
  thickness: "1/4in",
  stock,
});
const at = (name: string, y: string) => ({
  name,
  part: name,
  at: ["0in", y, "0in"] as [string, string, string],
});

describe("scratch", () => {
  it("bookmatch mixed stock ply-first vs wood-first", () => {
    for (const order of [
      ["ply", "wood"],
      ["wood", "ply"],
      ["ply", "ply"],
    ] as const) {
      const p = boards(
        [panel("A", order[0]), panel("B", order[1])],
        [at("A", "0in"), at("B", "5in")],
        [],
        { matchSets: [{ name: "Doors", type: "bookmatch", members: ["A", "B"] }] },
      );
      const r = solve(p, shop);
      log(
        order.join("+"),
        r.blocked,
        JSON.stringify(r.diagnostics.map((d) => [d.severity, d.rule, d.message])),
      );
    }
  });
  it("sameBoard / continuousGrain mixed for comparison", () => {
    for (const type of ["continuousGrain", "sameBoard"] as const) {
      const p = boards(
        [panel("A", "ply"), panel("B", "wood")],
        [at("A", "0in"), at("B", "5in")],
        [],
        { matchSets: [{ name: "S", type, members: ["A", "B"], axis: "length" }] },
      );
      const r = solve(p, shop);
      log(type, r.blocked, JSON.stringify(r.diagnostics.map((d) => [d.severity, d.rule])));
    }
  });
  it("planing huge", () => {
    const p = boards(
      [panel("A", "wood"), panel("B", "wood")],
      [at("A", "0in"), at("B", "5in")],
      [],
      { matchSets: [{ name: "Doors", type: "bookmatch", members: ["A", "B"] }] },
    );
    (p as any).planingAllowance = 100000 * INCH;
    const r = solve(p, shop);
    log(
      "huge",
      r.blocked,
      JSON.stringify(r.diagnostics.map((d) => [d.severity, d.rule, d.message])),
      r.nesting.boards[0]?.compositeThickness,
    );
    const text = serializeProject(p);
    expect(parseProject(text).planingAllowance).toBe(100000 * INCH);
  });
  it("validateProject getter throws", () => {
    const p: any = loadProject("box");
    Object.defineProperty(p, "name", {
      get() {
        throw new Error("boom");
      },
      enumerable: true,
    });
    try {
      const out: any = validateProject(p);
      log("validate returned", out.problem?.message);
    } catch (e: any) {
      log("validate THREW", e.message);
    }
    const r = solve(p, shop);
    log(JSON.stringify(r.diagnostics));
    try {
      serializeProject(p);
    } catch (e: any) {
      log("serialize threw", e.name, e.message);
    }
  });
  it("zip bomb lying size", () => {
    const big = new Uint8Array(200 * 1024 * 1024);
    const z = zipSync({ "project.json": big, "meta.json": strToU8("{}") }, { level: 6 });
    log("zip size", z.length);
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    let patched = 0;
    for (let i = 0; i < z.length - 30; i++) {
      if (dv.getUint32(i, true) === 0x04034b50) {
        const nameLen = dv.getUint16(i + 26, true);
        const name = new TextDecoder().decode(z.subarray(i + 30, i + 30 + nameLen));
        if (name === "project.json") {
          dv.setUint32(i + 22, 100, true);
          patched++;
        }
      } else if (dv.getUint32(i, true) === 0x02014b50) {
        const nameLen = dv.getUint16(i + 28, true);
        const name = new TextDecoder().decode(z.subarray(i + 46, i + 46 + nameLen));
        if (name === "project.json") {
          dv.setUint32(i + 24, 100, true);
          patched++;
        }
      }
    }
    log("patched", patched);
    const before = process.memoryUsage().arrayBuffers;
    try {
      readKerf(z);
    } catch (e: any) {
      log("readKerf threw", e.name, e.message);
    }
    log("ab delta MB", (process.memoryUsage().arrayBuffers - before) / 1e6);
  });
  it("geometry odd cuts", async () => {
    await initGeometry();
    const blank = { length: 10 * INCH, width: 4 * INCH, thickness: INCH };
    const run = (cuts: any[]) => {
      try {
        const m = buildDisplayMesh(blank, cuts);
        return `${m.indices.length / 3} tris manifold=${isManifold(m)}`;
      } catch (e: any) {
        return `${e.name}: ${e.message}`;
      }
    };
    log("outside", run([{ kind: "box", min: [20 * INCH, 0, 0], max: [21 * INCH, INCH, INCH] }]));
    log(
      "everything",
      run([{ kind: "box", min: [-INCH, -INCH, -INCH], max: [20 * INCH, 20 * INCH, 20 * INCH] }]),
    );
    log(
      "bowtie",
      run([
        {
          kind: "trapezoidPrism",
          plane: "xy",
          points: [
            [0, 0],
            [4 * INCH, 4 * INCH],
            [4 * INCH, 0],
            [0, 3 * INCH],
          ],
          range: [0, INCH],
        },
      ]),
    );
    log("huge box", run([{ kind: "box", min: [0, 0, 0], max: [1e15, 1e15, 1e15] }]));
  });
});
