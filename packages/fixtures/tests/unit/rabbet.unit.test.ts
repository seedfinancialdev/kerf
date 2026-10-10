// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { deriveJoints, INCH, type Project, type ShopProfile, solve, solveModel } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type PartSpec } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

{
  const shop = loadShopProfile();
  const q = (n: number): number => (n * INCH) / 64;
  const issues = (p: Project) => solve(p, shop).diagnostics;
  const rules = (p: Project) => issues(p).map((d) => `${d.severity}:${d.rule}`);

  describe("rabbet placement and seating", () => {
    const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
    const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
    const seated: InstanceSpec = {
      name: "Guest",
      part: "Guest",
      at: ["2in", "0in", "3/4in"],
      orientation: 16,
    };
    const rabbet = (params: Record<string, string>): Project =>
      boards(
        [host, guest],
        [{ name: "Host", part: "Host", at: ["0in", "0in", "0in"] }, seated],
        [{ type: "rabbet", host: "Host", guest: "Guest", params }],
      );

    it("rabbet-not-seated: a width wider or narrower than the guest's thickness", () => {
      expect(rules(rabbet({ width: "1in" }))).toContain("error:rabbet-not-seated");
      expect(rules(rabbet({ width: "1/4in" }))).toContain("error:rabbet-not-seated");
      expect(rules(rabbet({ width: "1/2in" }))).toEqual([]);
    });

    it("cuts the step the whole length of the edge the guest stands against, on the face it stands on", () => {
      // 12" x 6" x 3/4" host, 1/2" guest at y = 0 on the top: width 1/2", depth 3/4 / 2 = 3/8".
      const model = solveModel(rabbet({}));
      const host = model.instances.find((i) => i.name === "Host")?.id ?? "";
      const cuts = deriveJoints(rabbet({}), model).instances.get(host)?.cuts;
      expect(cuts).toEqual([{ kind: "box", min: [0, 0, q(24)], max: [q(768), q(32), q(48)] }]);
    });

    it("honours `at`, and rejects one that disagrees with where the guest sits", () => {
      expect(rules(rabbet({ at: "edge0" }))).toEqual([]);
      expect(rules(rabbet({ at: "end1" }))).toContain("error:rabbet-not-seated");
      expect(rules(rabbet({ face: "face1" }))).toEqual([]); // the guest stands on the top face
      expect(rules(rabbet({ face: "face0" }))).toContain("error:rabbet-not-seated");
    });
  });
}

{
  const shop = loadShopProfile();
  const rules = (p: Project, s: ShopProfile = shop) =>
    solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);

  describe("a rabbet is seated against its shoulder", () => {
    const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
    const back: PartSpec = { name: "Back", length: "4in", width: "5in", thickness: "1/4in" };
    const rabbet = (y: string, params: Record<string, string>): Project =>
      boards(
        [host, back],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "Back", part: "Back", at: ["2in", y, "3/4in"], orientation: 16 },
        ],
        [{ type: "rabbet", host: "Host", guest: "Back", params }],
      );

    it("accepts a guest against the shoulder of a wider rabbet, and cuts the rabbet that wide", () => {
      // A 3/8" rabbet with a 1/4" board against the shoulder (y = 1/8" to 3/8").
      expect(rules(rabbet("1/8in", { width: "3/8in" }))).toEqual([]);
    });

    it("still rejects a guest with a gap at the shoulder, or one that hangs past it", () => {
      expect(rules(rabbet("0in", { width: "3/8in" }))).toContain("error:rabbet-not-seated");
      expect(rules(rabbet("0in", { width: "1/8in" }))).toContain("error:rabbet-not-seated");
    });

    it("accepts the default: the guest's own thickness, flush with the edge", () => {
      expect(rules(rabbet("0in", {}))).toEqual([]);
    });
  });
}

{
  const shop = loadShopProfile();
  const rules = (p: Project) => solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);
  const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
  const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
  const rabbetP = (
    params: Record<string, string>,
    at: [string, string, string],
    o: number,
  ): Project =>
    boards(
      [host, guest],
      [
        { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
        { name: "Guest", part: "Guest", at, orientation: o },
      ],
      [{ type: "rabbet", host: "Host", guest: "Guest", params }],
    );

  describe("rabbet footprint", () => {
    it("control: lengthwise guest seated in end0 step", () =>
      expect(rules(rabbetP({ width: "5in" }, ["0in", "2in", "3/4in"], 16))).toEqual([]));
    it("control: seated end0", () =>
      expect(rules(rabbetP({}, ["0in", "0in", "3/4in"], 17))).toEqual([]));
    it("end0 guest 4in long hanging past x=0", () =>
      expect(rules(rabbetP({ width: "2in" }, ["-3in", "2in", "3/4in"], 16))).toContain(
        "error:rabbet-not-seated",
      ));
    it("end1 guest 4in long hanging past x=L", () =>
      expect(rules(rabbetP({ width: "1in" }, ["11in", "0in", "3/4in"], 16))).toContain(
        "error:rabbet-not-seated",
      ));
    it("edge1 guest 5in wide hanging past y=W", () =>
      expect(rules(rabbetP({ width: "1in" }, ["2in", "5in", "3/4in"], 17))).toContain(
        "error:rabbet-not-seated",
      ));
  });
}
