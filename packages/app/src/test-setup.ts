// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Unmounts what each screen test rendered, so tests never see each other's screens; and gives jsdom
// the ResizeObserver every browser Kerf runs in has. The 3D canvas measures itself with one; this
// one never reports a size, so a canvas in a screen test stays blank instead of asking jsdom for
// WebGL.

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

class UnmeasuredResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= UnmeasuredResizeObserver;
