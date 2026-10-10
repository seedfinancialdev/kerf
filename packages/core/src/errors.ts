// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

/** Thrown by every M0 stub. Later milestones replace stubs with implementations. */
export class NotImplemented extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(`Not implemented: ${feature}`);
    this.name = "NotImplemented";
    this.feature = feature;
  }
}

export function notImplemented(feature: string): never {
  throw new NotImplemented(feature);
}
