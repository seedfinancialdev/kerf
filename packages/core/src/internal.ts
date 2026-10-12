// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Working parts of the engine, for tests and for tools that inspect how a project is solved
// (`@kerf/core/internal`). They are not part of the supported API: their shapes can change with the
// engine, which is why they live apart from `@kerf/core`.

export type { Derived, InstanceCuts } from "./joints/derive";
export { deriveJoints } from "./joints/derive";
export type { DovetailLayout, DovetailLayoutInput } from "./joints/dovetail";
export { dovetailLayout, layoutDovetail } from "./joints/dovetail";
export type { MachinedCut, PairCut } from "./joints/types";
export { DEFAULT_MIN_OFFCUT, nestSheets } from "./nest/sheets";
export type { Box, Frame } from "./solve/assembly";
export { boxOf, toLocal, toParent } from "./solve/assembly";
export type { Orientation } from "./solve/orientation";
export { extentOf, ORIENTATION_COUNT, orientationOf } from "./solve/orientation";
export { generatedId } from "./structures";
