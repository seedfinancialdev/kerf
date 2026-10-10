// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Rabbet (Operation specs, "Rabbet"): an L-shaped step along a named end or edge of the host, on a
// named face.

import type { RemovalPrimitive } from "../outputs";
import { rational } from "../rational";
import type { Joint } from "../types";
import { dimsOf, faceName, type Seat } from "./seat";
import { type DeriveContext, NO_ADD, type PairCut } from "./types";

type Boundary = "end0" | "end1" | "edge0" | "edge1";

export function deriveRabbet(ctx: DeriveContext, joint: Joint, seat: Seat): PairCut | undefined {
  const { host, guest, hostPatch, hostFace, guestFace } = seat;
  const [L, W, T] = dimsOf(host);
  const hostName = host.instance.name;
  const guestName = guest.instance.name;
  const where = { joint: joint.id, part: host.part.id };

  if (hostFace.axis !== 2) {
    ctx.error(
      "rabbet-needs-face",
      `${guestName} meets the ${faceName(hostFace)} of ${hostName}; a rabbet is cut along an end or edge of a face.`,
      where,
    );
    return undefined;
  }
  if (guestFace.axis === 2) {
    ctx.error(
      "rabbet-not-seated",
      `${guestName} lies flat on ${hostName}; it must seat into the rabbet with an end or edge.`,
      where,
    );
    return undefined;
  }

  // Which boundary of the host face the patch runs up to, measured by the guest's thickness.
  const guestThickness = guest.part.thickness;
  const a = hostPatch.max[0] - hostPatch.min[0];
  const b = hostPatch.max[1] - hostPatch.min[1];
  const candidates: Array<[Boundary, boolean]> = [
    ["end0", hostPatch.min[0] === 0 && a === guestThickness],
    ["end1", hostPatch.max[0] === L && a === guestThickness],
    ["edge0", hostPatch.min[1] === 0 && b === guestThickness],
    ["edge1", hostPatch.max[1] === W && b === guestThickness],
  ];
  const at = candidates.find(([, fits]) => fits)?.[0];
  if (!at) {
    ctx.error(
      "rabbet-not-seated",
      `${guestName} does not sit against an end or edge of ${hostName}.`,
      where,
    );
    return undefined;
  }

  const width = ctx.length(joint, "width", guestThickness);
  const depth = ctx.length(joint, "depth", ctx.floorToGrid(rational(BigInt(T), 2n)));
  if (width === undefined || depth === undefined) return undefined;

  if (depth <= 0 || depth >= T) {
    ctx.error(
      "rabbet-too-deep",
      `This part can't be built: the rabbet in ${hostName} is as deep as the board is thick.`,
      where,
    );
    return undefined;
  }
  const alongLength = at === "end0" || at === "end1";
  if (2 * width > (alongLength ? L : W)) {
    ctx.error(
      "rabbet-too-wide",
      `The rabbet in ${hostName} is wider than half the board's ${alongLength ? "length" : "width"}.`,
      where,
    );
    return undefined;
  }

  const lo: [number, number, number] = [0, 0, hostFace.side === 0 ? 0 : T - depth];
  const hi: [number, number, number] = [L, W, hostFace.side === 0 ? depth : T];
  if (at === "end0") hi[0] = width;
  if (at === "end1") lo[0] = L - width;
  if (at === "edge0") hi[1] = width;
  if (at === "edge1") lo[1] = W - width;
  const box: RemovalPrimitive = { kind: "box", min: lo, max: hi };

  return {
    joint: joint.id,
    kind: "rabbet",
    host: host.instance.id,
    guest: guest.instance.id,
    hostCuts: [box],
    guestCuts: [],
    hostAdd: NO_ADD,
    guestAdd: guestFace.axis === 0 ? { length: depth, width: 0 } : { length: 0, width: depth },
    machined: [{ host: host.instance.id, kind: "rabbet", width, depth }],
  };
}
