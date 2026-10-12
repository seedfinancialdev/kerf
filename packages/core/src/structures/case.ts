// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The case form (Interaction spec, "Shape"): two sides (the left one the mirror of the right), a
// top and a bottom, a back, and whatever the openings are divided into. How the top and bottom meet
// the sides and what kind of back the case has are the form's two choices; both have a spec-less
// part that ADR 014 records. Sizes are expressions, so the whole case follows its overall size.

import type { Rational } from "../rational";
import { rational, sub } from "../rational";
import type { Instance, Stock } from "../types";
import { type Builder, depth, roundoverFor, type Span, wrap } from "./builder";
import { Divider } from "./openings";

/** The case form's choices, read and checked once. */
interface CaseForm {
  carcase: Stock;
  /** `stock["…"].thickness` and the carcase thickness in units. */
  T: string;
  Tn: number;
  /** Overall width, height and depth as expressions, parenthesised. */
  W: string;
  H: string;
  D: string;
  /** Top and bottom run the full width and the sides run between them. */
  sidesBetween: boolean;
  back: { style: "inset"; stock: Stock } | { style: "applied"; stock: Stock } | undefined;
}

/** Reads the form's options; undefined (with a message) when the case cannot be built. */
function readCaseForm(b: Builder): CaseForm | undefined {
  const carcase = b.stock("carcaseStock");
  if (!carcase) return undefined;
  const { size } = b.structure;

  let topBottom = b.option("topBottom") ?? "between-sides";
  if (topBottom !== "between-sides" && topBottom !== "sides-between") {
    b.report(
      "warning",
      "not-built-yet",
      `A case with "${topBottom}" is not built yet; the top and bottom go between the sides.`,
      "topBottom",
    );
    topBottom = "between-sides";
  }

  let style = b.option("back") ?? (b.option("backStock") ? "inset-rabbet" : "none");
  if (style !== "none" && style !== "inset-rabbet" && style !== "applied") {
    b.report(
      "warning",
      "not-built-yet",
      `A case back of "${style}" is not built yet; the case is built without a back.`,
      "back",
    );
    style = "none";
  }
  const backStock = style === "none" ? undefined : b.stock("backStock");
  let back: CaseForm["back"];
  if (backStock) back = { style: style === "applied" ? "applied" : "inset", stock: backStock };

  return {
    carcase,
    T: b.thickness(carcase),
    Tn: carcase.thickness,
    W: wrap(size.w),
    H: wrap(size.h),
    D: wrap(size.d),
    sidesBetween: topBottom === "sides-between",
    back,
  };
}

/** The four boards every case has. */
interface Frame {
  right: Instance;
  left: Instance;
  top: Instance;
  bottom: Instance;
}

/** Sides, top and bottom, placed the way the form's choices say. */
function buildFrame(b: Builder, f: CaseForm, backTaken: string): Frame {
  const { T, H, W, D, carcase, sidesBetween } = f;
  const sideDef = b.part("side", "side", {
    name: "Side",
    stock: carcase.id,
    length: sidesBetween ? `${H} - 2*${T}` : H,
    width: D,
  });
  const sideZ = sidesBetween ? T : "0in";
  const right = b.instance("side", "side:right", sideDef, ["0in", "0in", sideZ], {
    name: "Right side",
    orientation: 17,
  });
  const left = b.instance("side", "side:left", sideDef, [`${W} - ${T}`, "0in", sideZ], {
    name: "Left side",
    orientation: 23,
    mirrored: true,
  });

  const railLength = sidesBetween ? W : `${W} - 2*${T}`;
  const railX = sidesBetween ? "0in" : T;
  const rail = (name: "Top" | "Bottom") =>
    b.part(name === "Top" ? "top" : "bottom", name.toLowerCase(), {
      name,
      stock: carcase.id,
      length: railLength,
      width: `${D} - ${backTaken}`,
    });
  const top = b.instance("top", "top", rail("Top"), [railX, backTaken, `${H} - ${T}`], {
    name: "Top",
  });
  const bottom = b.instance("bottom", "bottom", rail("Bottom"), [railX, backTaken, "0in"], {
    name: "Bottom",
  });
  return { right, left, top, bottom };
}

/** The back: inset in rabbets between the sides, or applied flat over the rear edges. */
function buildBack(b: Builder, f: CaseForm): Instance | undefined {
  const { back, T, H, W } = f;
  if (!back) return undefined;
  const inner = `${W} - 2*${T}`;
  const def = b.part("back", "back", {
    name: "Back",
    stock: back.stock.id,
    length: H,
    width: back.style === "inset" ? inner : W,
  });
  if (back.style === "inset") {
    return b.instance("back", "back", def, [T, "0in", "0in"], { name: "Back", orientation: 16 });
  }
  // Applied: it covers the whole outside, flat against the rear edges, and is fixed on, not joined.
  b.instance("back", "back", def, ["0in", `0in - ${b.thickness(back.stock)}`, "0in"], {
    name: "Back",
    orientation: 16,
  });
  return undefined;
}

/** The case's interior across, as expressions and (when the width evaluates) exact values. */
function interior(b: Builder, f: CaseForm): Span {
  const q = b.quantity(b.structure.size.w);
  const width: Rational | undefined = q?.kind === "length" ? q.value : undefined;
  const t = rational(BigInt(f.Tn));
  return {
    x0: f.T,
    x1: `${f.W} - ${f.T}`,
    ...(width ? { n0: t, n1: sub(width, t) } : {}),
  };
}

export function generateCase(b: Builder): void {
  const form = readCaseForm(b);
  if (!form) return;
  const { carcase, T, H } = form;

  // An inset back sits in rabbets, taking that much depth from the boards in front of it; an
  // applied back covers the rear edges and takes none.
  const backTaken = form.back?.style === "inset" ? b.thickness(form.back.stock) : "0in";
  const frame = buildFrame(b, form, backTaken);

  if (b.structure.openings.length > 1) {
    b.report(
      "warning",
      "division-ignored",
      "A case has one opening to divide; the others on the form are not used.",
      "openings",
    );
  }
  const dado = depth(b.option("dadoDepth"));
  const divider = new Divider(b, {
    stock: carcase.id,
    thickness: T,
    thicknessUnits: form.Tn,
    height: H,
    depth: form.D,
    backTaken,
    dado,
    roundover: roundoverFor(b, b.option("shelfRoundover"), form.Tn),
    top: frame.top,
    bottom: frame.bottom,
  });
  const root = b.structure.openings[0];
  divider.divide(root, interior(b, form), frame.right, frame.left, root?.id ?? "0");
  const back = buildBack(b, form);

  // Joints: what stands in the openings first, then the carcase, then the back.
  divider.emitJoints();
  const { right, left, top, bottom } = frame;
  const rabbet = depth(b.option("rabbetDepth"));
  // Top and bottom are the hosts when they sit between the sides, the sides when it is the other
  // way round (the rabbet is always cut in the board whose end or edge receives the other).
  const carcaseJoints: Array<[Instance, Instance]> = form.sidesBetween
    ? [
        [top, right],
        [top, left],
        [bottom, right],
        [bottom, left],
      ]
    : [
        [right, top],
        [right, bottom],
        [left, top],
        [left, bottom],
      ];
  for (const [n, [host, guest]] of carcaseJoints.entries()) {
    b.joint("carcase", `rabbet:${n}`, "rabbet", host.id, guest.id, rabbet);
  }
  if (back) {
    const backRabbet = depth(b.option("backRabbetDepth"));
    b.joint("back", "back:right", "rabbet", right.id, back.id, backRabbet);
    b.joint("back", "back:left", "rabbet", left.id, back.id, backRabbet);
  }
}
