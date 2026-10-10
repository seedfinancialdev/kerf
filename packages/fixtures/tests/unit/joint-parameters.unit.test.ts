// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { type Project, type ShopProfile, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type PartSpec } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

{
  const shop = loadShopProfile();
  const issues = (p: Project) => solve(p, shop).diagnostics;
  const rules = (p: Project) => issues(p).map((d) => `${d.severity}:${d.rule}`);

  describe("joint parameters must make physical sense", () => {
    const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
    const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
    const dado = (params: Record<string, string>): Project =>
      boards(
        [host, guest],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "Guest", part: "Guest", at: ["2in", "2in", "3/4in"], orientation: 16 },
        ],
        [{ type: "dado", host: "Host", guest: "Guest", params }],
      );

    it.each([
      ["a dado fit below zero", dado({ fit: "-1in" })],
      ["a dado depth of zero", dado({ depth: "0in" })],
      [
        "a rabbet width of zero",
        boards(
          [host, guest],
          [
            { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
            { name: "Guest", part: "Guest", at: ["2in", "0in", "3/4in"], orientation: 16 },
          ],
          [{ type: "rabbet", host: "Host", guest: "Guest", params: { width: "0in" } }],
        ),
      ],
    ])("%s is an error on its field", (_label, project) => {
      const found = issues(project).find((d) => d.severity === "error" && d.joint !== undefined);
      expect(found).toBeDefined();
      expect(found?.field).toBeDefined();
    });

    it("a negative `proud` on a dovetail is an error and never shortens a board", () => {
      const pins: PartSpec = {
        name: "Pins",
        length: "10in",
        width: "4in",
        thickness: "1/2in",
        stock: "wood",
      };
      const tails: PartSpec = {
        name: "Tails",
        length: "6in",
        width: "4in",
        thickness: "1/2in",
        stock: "wood",
      };
      const p = boards(
        [pins, tails],
        [
          { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
          { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
        ],
        [{ type: "throughDovetail", host: "Pins", guest: "Tails", params: { proud: "-1in" } }],
      );
      expect(rules(p)).toContain("error:invalid-parameter");
    });
  });
}

{
  const shop = loadShopProfile();
  const rules = (p: Project, s: ShopProfile = shop) =>
    solve(p, s).diagnostics.map((d) => `${d.severity}:${d.rule}`);

  describe("joint parameters out of range, and other errors still reported", () => {
    const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
    const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
    const dado = (params: Record<string, string>): Project =>
      boards(
        [host, guest],
        [
          { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
          { name: "Guest", part: "Guest", at: ["2in", "2in", "3/4in"], orientation: 16 },
        ],
        [{ type: "dado", host: "Host", guest: "Guest", params }],
      );

    it.each(["depth", "fit", "stop"])(
      "a %s above 100,000in is out-of-range, not an internal error",
      (key) => {
        const found = rules(dado({ [key]: "100001in" }));
        expect(found).toContain("error:out-of-range");
        expect(found).not.toContain("error:internal-error");
      },
    );
  });
}
