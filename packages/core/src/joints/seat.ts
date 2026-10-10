// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Where one part seats against another: which face of the host, which face of the guest, and
// the patch of contact (ADR 013, decision D4).

import {
  type Box,
  boxOf,
  boxToLocal,
  contactOf,
  type Frame,
  faceAt,
  type LocalAxis,
  type LocalFace,
} from "../solve/assembly";
import type { Id } from "../types";
import type { DeriveContext } from "./types";

export interface Seat {
  host: Frame;
  guest: Frame;
  /** The contact patch in the host's definition space (zero thickness on `hostFace.axis`). */
  hostPatch: Box;
  hostFace: LocalFace;
  guestFace: LocalFace;
}

/** Host and guest dimensions along their local axes: length, width, thickness. */
export function dimsOf(frame: Frame): [number, number, number] {
  return [frame.part.length, frame.part.width, frame.part.thickness];
}

export const FACE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["end0", "end1"],
  ["edge0", "edge1"],
  ["face0", "face1"],
];

export function faceName(face: LocalFace): string {
  const names = FACE_NAMES[face.axis];
  return (face.side === 0 ? names?.[0] : names?.[1]) ?? "face";
}

/**
 * Finds how the guest touches the host. Reports `joint-no-contact` or `joint-overlap` and returns
 * undefined when they do not meet as a seat; the caller decides whether that matters.
 */
export function seatOf(
  ctx: DeriveContext,
  jointId: Id,
  host: Frame,
  guest: Frame,
  quiet = false,
): Seat | undefined {
  const contact = contactOf(boxOf(host.instance), boxOf(guest.instance));
  if (contact.kind !== "touch") {
    if (!quiet) {
      ctx.error(
        contact.kind === "overlap" ? "joint-overlap" : "joint-no-contact",
        contact.kind === "overlap"
          ? `${guest.instance.name} overlaps ${host.instance.name}; it should sit against its face.`
          : `${guest.instance.name} does not touch ${host.instance.name}, so there is nothing to join.`,
        { joint: jointId, part: guest.part.id },
      );
    }
    return undefined;
  }
  const coordinate = contact.patch.min[contact.axis];
  const hostFace = faceAt(host, contact.axis, coordinate);
  const guestFace = faceAt(guest, contact.axis, coordinate);
  if (!hostFace || !guestFace) {
    if (!quiet) {
      ctx.error(
        "joint-no-contact",
        `${guest.instance.name} does not sit flat against ${host.instance.name}.`,
        { joint: jointId, part: guest.part.id },
      );
    }
    return undefined;
  }
  return { host, guest, hostPatch: boxToLocal(host, contact.patch), hostFace, guestFace };
}

export function axisLabel(axis: LocalAxis): "length" | "width" | "thickness" {
  return axis === 0 ? "length" : axis === 1 ? "width" : "thickness";
}
