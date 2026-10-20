// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, §1 "Your shop": the router's bits, "by the shape they cut: roundover, chamfer, cove,
// ogee, straight, rabbeting; sizes tapped on". A size not offered is typed, read like every other
// size field (model/size.ts).

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { RouterBit } from "../../model/shop-record";
import { RouterBits } from "./RouterBits";

/**
 * The bit list as the router card holds it, starting from `start`; `seen` is every list it was
 * given.
 */
function bitsFrom(start: RouterBit[]) {
  const seen: RouterBit[][] = [];
  function Holder() {
    const [bits, setBits] = useState(start);
    return (
      <RouterBits
        bits={bits}
        units="imperial"
        onChange={(next) => {
          seen.push(next);
          setBits(next);
        }}
      />
    );
  }
  render(<Holder />);
  return seen;
}

/** The size toggles a shape offers, as their labels. */
const sizesOf = (shape: string): string[] =>
  within(screen.getByRole("group", { name: shape }))
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-pressed"))
    .map((b) => b.textContent ?? "");

const size = (shape: string, label: string): HTMLElement =>
  within(screen.getByRole("group", { name: shape })).getByRole("button", { name: label });

describe("<RouterBits>", () => {
  it("lists the shapes a bit can cut", () => {
    bitsFrom([]);
    expect(screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent)).toEqual(
      ["Roundover", "Chamfer 45°", "Cove", "Ogee", "Straight", "Rabbeting"],
    );
  });

  it.each([
    ["Roundover", ['1/8"', '1/4"', '3/8"', '1/2"']],
    ["Chamfer 45°", ['1/4"', '1/2"']],
    ["Straight", ['1/4"', '3/8"', '1/2"', '3/4"']],
  ])("offers the usual %s sizes as toggles", (shape, sizes) => {
    bitsFrom([]);
    expect(sizesOf(shape)).toEqual(sizes);
  });

  it("adds a 3/8 roundover bit when its size is tapped", () => {
    const seen = bitsFrom([{ shape: "roundover", size: 25_400 }]);
    fireEvent.click(size("Roundover", '3/8"'));
    // 3/8" = 3 × 203200 / 8 = 76,200.
    expect(seen.at(-1)).toEqual([
      { shape: "roundover", size: 25_400 },
      { shape: "roundover", size: 76_200 },
    ]);
    expect(size("Roundover", '3/8"').getAttribute("aria-pressed")).toBe("true");
  });

  it("takes a bit off when its size is tapped again", () => {
    const seen = bitsFrom([{ shape: "straight", size: 101_600 }]);
    fireEvent.click(size("Straight", '1/2"'));
    expect(seen.at(-1)).toEqual([]);
  });

  it("shows a bit of a size it does not offer among the usual ones", () => {
    // 5/16" = 5 × 203200 / 16 = 63,500.
    bitsFrom([{ shape: "roundover", size: 63_500 }]);
    expect(sizesOf("Roundover")).toContain('5/16"');
    expect(size("Roundover", '5/16"').getAttribute("aria-pressed")).toBe("true");
  });

  it("adds a typed size", async () => {
    const seen = bitsFrom([]);
    const group = within(screen.getByRole("group", { name: "Cove" }));
    fireEvent.click(group.getByRole("button", { name: "+ Add a size" }));
    await userEvent.type(group.getByLabelText("Cove size"), '5/16"{Enter}');
    // 5/16" = 63,500.
    expect(seen.at(-1)).toEqual([{ shape: "cove", size: 63_500 }]);
  });

  it("refuses a bit of no size and says why", async () => {
    const seen = bitsFrom([]);
    const group = within(screen.getByRole("group", { name: "Roundover" }));
    fireEvent.click(group.getByRole("button", { name: "+ Add a size" }));
    await userEvent.type(group.getByLabelText("Roundover size"), '0"{Enter}');
    expect(group.getByText("A bit must be bigger than zero.")).toBeTruthy();
    expect(seen).toEqual([]);
  });

  it("reads a bare 0 the way every size field does: it asks for a unit (ruling R13)", async () => {
    bitsFrom([]);
    const group = within(screen.getByRole("group", { name: "Roundover" }));
    fireEvent.click(group.getByRole("button", { name: "+ Add a size" }));
    await userEvent.type(group.getByLabelText("Roundover size"), "0{Enter}");
    expect(group.getByText('"0" is not a length; add a unit (in, " or mm).')).toBeTruthy();
  });
});
