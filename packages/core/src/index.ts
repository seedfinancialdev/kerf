// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

export * from "./api";
export * from "./errors";
export type { Kind, Quantity, Scope } from "./expr";
export { ExpressionError, evaluateExpression, evaluateQuantity } from "./expr";
export * from "./length";
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
export type { SolvedInstance, SolvedModel, SolvedOp, SolvedPart } from "./solve/model";
export { MAX_PATTERN_COUNT, solveModel } from "./solve/model";
export type { Orientation } from "./solve/orientation";
export { extentOf, ORIENTATION_COUNT, orientationOf } from "./solve/orientation";
export * from "./types";
export * from "./units";
