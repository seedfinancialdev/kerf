// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Dado and groove (Operation specs, "Dado / groove"): a rectangular channel in the host's face that
// a guest's end (dado) or edge (groove) seats into. A dado runs across the grain, a groove along
// it; the code is the same.

import type { RemovalPrimitive } from "../outputs";
import { rational } from "../rational";
import type { Joint } from "../types";
import { dimsOf, faceName, type Seat } from "./seat";
import { type DeriveContext, NO_ADD, type PairCut } from "./types";

export function deriveDado(ctx: DeriveContext, joint: Joint, seat: Seat): PairCut | undefined {
  const { host, guest, hostPatch, hostFace, guestFace } = seat;
  const [L, W, T] = dimsOf(host);
  const hostName = host.instance.name;
  const guestName = guest.instance.name;
  const where = { joint: joint.id, part: host.part.id };

  if (hostFace.axis !== 2) {
    ctx.error(
      "dado-needs-face",
      `${guestName} meets the ${faceName(hostFace)} of ${hostName}; a dado is cut in a face.`,
      where,
    );
    return undefined;
  }
  if (guestFace.axis === 2) {
    ctx.error(
      "dado-not-perpendicular",
      `${guestName} lies flat on ${hostName}; a dado needs it to stand square to the face.`,
      where,
    );
    return undefined;
  }

  const guestThickness = guest.part.thickness;
  // The guest's end (or edge) cross-section: its thickness and its other seated dimension.
  const other = guestFace.axis === 0 ? guest.part.width : guest.part.length;
  const a = hostPatch.max[0] - hostPatch.min[0];
  const b = hostPatch.max[1] - hostPatch.min[1];

  let widthAxis: 0 | 1;
  if (a === guestThickness && b === other) widthAxis = 0;
  else if (b === guestThickness && a === other) widthAxis = 1;
  else {
    ctx.error(
      "dado-outside-face",
      `The end of ${guestName} reaches past the face of ${hostName}.`,
      where,
    );
    return undefined;
  }
  const runAxis = widthAxis === 0 ? 1 : 0;

  const defaultDepth = ctx.floorToGrid(rational(BigInt(T), 3n));
  const depth = ctx.length(joint, "depth", defaultDepth);
  const fit = ctx.length(joint, "fit", 0);
  const stop = joint.params.stop === undefined ? undefined : ctx.length(joint, "stop");
  if (depth === undefined || fit === undefined) return undefined;
  if (joint.params.stop !== undefined && stop === undefined) return undefined;

  if (depth <= 0 || depth >= T) {
    ctx.error(
      "dado-too-deep",
      `This part can't be built: the dado in ${hostName} is as deep as the board is thick.`,
      where,
    );
    return undefined;
  }
  if (2 * depth > T) {
    ctx.warn(
      "dado-deep",
      `The dado in ${hostName} is deeper than half the board; the part will be weak there.`,
      where,
    );
  }

  const width = guestThickness + fit;
  const start = hostPatch.min[widthAxis];
  const dims = [L, W, T] as const;
  if (start + width > dims[widthAxis]) {
    ctx.error(
      "dado-outside-face",
      `The dado for ${guestName} would run off the edge of ${hostName}.`,
      where,
    );
    return undefined;
  }

  let runEnd = dims[runAxis];
  if (stop !== undefined) {
    if (stop <= 0 || stop >= runEnd) {
      ctx.error(
        "dado-stop",
        `The stop distance for the dado in ${hostName} is outside the board.`,
        where,
      );
      return undefined;
    }
    runEnd -= stop;
  }

  const lo: [number, number, number] = [0, 0, 0];
  const hi: [number, number, number] = [0, 0, 0];
  lo[widthAxis] = start;
  hi[widthAxis] = start + width;
  lo[runAxis] = 0;
  hi[runAxis] = runEnd;
  lo[2] = hostFace.side === 0 ? 0 : T - depth;
  hi[2] = hostFace.side === 0 ? depth : T;
  const box: RemovalPrimitive = { kind: "box", min: lo, max: hi };

  const kind = runAxis === 0 ? "groove" : "dado";
  return {
    joint: joint.id,
    kind: "dado",
    host: host.instance.id,
    guest: guest.instance.id,
    hostCuts: [box],
    guestCuts: [],
    hostAdd: NO_ADD,
    guestAdd: guestFace.axis === 0 ? { length: depth, width: 0 } : { length: 0, width: depth },
    machined: [{ host: host.instance.id, kind, width, depth }],
  };
}
