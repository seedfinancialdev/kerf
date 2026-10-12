// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The box form (Interaction spec, "Shape"): four walls with the corner joint chosen, a bottom in a
// groove, and the grain wrapping the corners as a continuous-grain match set. Boards are named
// Front, Back, Side A, Side B and Bottom; the two sides share one definition.

import type { Instance } from "../types";
import { type Builder, depth, wrap } from "./builder";

export function generateBox(b: Builder): void {
  const { size } = b.structure;
  const wall = b.stock("wallStock");
  const bottomStock = b.option("bottom") === "none" ? undefined : b.stock("bottomStock");
  if (!wall) return;
  const Tw = b.thickness(wall);
  const L = wrap(size.w);
  const Wd = wrap(size.d);
  const H = wrap(size.h);
  let corner = b.option("cornerJoint") ?? "through-dovetail";
  if (corner !== "through-dovetail" && corner !== "rabbet") {
    b.report(
      "warning",
      "not-built-yet",
      `A box corner of "${corner}" is not built yet; the corners are through dovetails.`,
      "cornerJoint",
    );
    corner = "through-dovetail";
  }
  const rabbeted = corner === "rabbet";
  // A rabbeted corner has the front and back between the sides, their ends in rabbets cut in the
  // sides; dovetails interlock, so the front and back run the full length.
  const frontLength = rabbeted ? `${L} - 2*${Tw}` : L;
  const frontX = rabbeted ? Tw : "0in";
  // Left to itself the bottom sits one board's thickness above the wall's edge, so the groove
  // never breaks out through the bottom of the wall.
  const offset = b.option("grooveOffset") ?? (bottomStock ? b.thickness(bottomStock) : "0in");

  const frontDef = b.part("front", "front", {
    name: "Front",
    stock: wall.id,
    length: frontLength,
    width: H,
  });
  const backDef = b.part("back", "back", {
    name: "Back",
    stock: wall.id,
    length: frontLength,
    width: H,
  });
  const sideDef = b.part("side", "side", { name: "Side", stock: wall.id, length: Wd, width: H });
  const bottomDef = bottomStock
    ? b.part("bottom", "bottom", {
        name: "Bottom",
        stock: bottomStock.id,
        length: `${L} - 2*${Tw}`,
        width: `${Wd} - 2*${Tw}`,
      })
    : undefined;

  const front = b.instance("front", "front", frontDef, [frontX, "0in", "0in"], {
    name: "Front",
    orientation: 1,
  });
  const sideA = b.instance("side", "side:a", sideDef, ["0in", "0in", "0in"], {
    name: "Side A",
    orientation: 12,
  });
  const back = b.instance("back", "back", backDef, [frontX, `${Wd} - ${Tw}`, "0in"], {
    name: "Back",
    orientation: 3,
  });
  const sideB = b.instance("side", "side:b", sideDef, [`${L} - ${Tw}`, "0in", "0in"], {
    name: "Side B",
    orientation: 8,
  });
  const bottom = bottomDef
    ? b.instance("bottom", "bottom", bottomDef, [Tw, Tw, offset], { name: "Bottom" })
    : undefined;

  if (rabbeted) {
    const corners: Array<[Instance, Instance, string]> = [
      [sideA, front, "a-front"],
      [sideA, back, "a-back"],
      [sideB, front, "b-front"],
      [sideB, back, "b-back"],
    ];
    for (const [host, guest, key] of corners) {
      b.joint(
        "corner",
        `corner:${key}`,
        "rabbet",
        host.id,
        guest.id,
        depth(b.option("rabbetDepth")),
      );
    }
  } else {
    const corners: Array<[Instance, Instance, string]> = [
      [front, sideA, "front-a"],
      [front, sideB, "front-b"],
      [back, sideA, "back-a"],
      [back, sideB, "back-b"],
    ];
    for (const [host, guest, key] of corners) {
      b.joint("corner", `corner:${key}`, "throughDovetail", host.id, guest.id, {});
    }
  }
  if (bottom) {
    const groove = depth(b.option("grooveDepth"));
    const walls: Array<[Instance, string]> = [
      [front, "front"],
      [back, "back"],
      [sideA, "a"],
      [sideB, "b"],
    ];
    for (const [wallInstance, key] of walls) {
      b.joint("bottom", `groove:${key}`, "dado", wallInstance.id, bottom.id, groove);
    }
  }
  if (b.flag("grainWraps")) {
    b.out.matchSets.push({
      id: b.id("matchset:wrap"),
      name: b.named("Grain wraps the corners"),
      type: "continuousGrain",
      members: [front.id, sideA.id, back.id, sideB.id],
      axis: "length",
      generatedBy: b.from("grain"),
    });
  }
}
