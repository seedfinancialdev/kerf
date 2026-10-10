import { appendFileSync } from "node:fs";
import { readKerf } from "@kerf/io";
import { it } from "vitest";
import { strToU8, zipSync } from "../../../io/node_modules/fflate/esm/index.mjs";

const log = (...a: unknown[]) => appendFileSync("/tmp/scratch2.out", a.join(" ") + "\n");
const meta = strToU8(
  JSON.stringify({ schemaVersion: 1, appVersion: "x", created: "a", modified: "b" }),
);
function make(lie: boolean) {
  const big = new Uint8Array(300 * 1024 * 1024);
  const z = zipSync({ "project.json": big, "meta.json": meta }, { level: 6 });
  if (lie) {
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    for (let i = 0; i < z.length - 30; i++) {
      if (dv.getUint32(i, true) === 0x04034b50) {
        const n = dv.getUint16(i + 26, true);
        if (new TextDecoder().decode(z.subarray(i + 30, i + 30 + n)) === "project.json")
          dv.setUint32(i + 22, 100, true);
      } else if (dv.getUint32(i, true) === 0x02014b50) {
        const n = dv.getUint16(i + 28, true);
        if (new TextDecoder().decode(z.subarray(i + 46, i + 46 + n)) === "project.json")
          dv.setUint32(i + 24, 100, true);
      }
    }
  }
  return z;
}
for (const lie of [false, true]) {
  it(`bomb lie=${lie}`, () => {
    const z = make(lie);
    let peak = 0;
    const t = Date.now();
    try {
      readKerf(z);
    } catch (e: any) {
      log(`lie=${lie}`, e.name, e.message, `ms=${Date.now() - t}`);
    }
    peak = process.memoryUsage().arrayBuffers;
    log(`lie=${lie} arrayBuffers after MB`, peak / 1e6);
  }, 60000);
}
