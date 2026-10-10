// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

export * from "./api";
export { condense, RULE_LIMIT } from "./diagnostics";
export * from "./errors";
export type { Kind, Quantity, Scope } from "./expr";
export { ExpressionError, evaluateExpression, evaluateQuantity } from "./expr";
export type { Derived, InstanceCuts } from "./joints/derive";
export { dovetailLayout, layoutDovetail } from "./joints/dovetail";
export type { CutAdd, MachinedCut, PairCut } from "./joints/types";
export * from "./length";
export { DEFAULT_PLANING_ALLOWANCE } from "./nest";
export { DEFAULT_MIN_OFFCUT, nestSheets } from "./nest/sheets";
export * from "./outputs";
export {
  CURRENT_SCHEMA_VERSION,
  ProjectFormatError,
  parseProject,
  serializeProject,
  validateProject,
} from "./project-file";
export type { Rational } from "./rational";
export { rational } from "./rational";
export { shopProblem } from "./shop";
export type { Box, Frame } from "./solve/assembly";
export { boxOf, toLocal, toParent } from "./solve/assembly";
export type { SolvedInstance, SolvedModel, SolvedOp, SolvedPart } from "./solve/model";
export { MAX_PATTERN_COUNT, solveModel } from "./solve/model";
export type { Orientation } from "./solve/orientation";
export { extentOf, ORIENTATION_COUNT, orientationOf } from "./solve/orientation";
export * from "./types";
export * from "./units";
