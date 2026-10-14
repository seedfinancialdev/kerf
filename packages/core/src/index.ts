// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

export * from "./api";
export { condense, RULE_LIMIT } from "./diagnostics";
export * from "./errors";
export type { Kind, Quantity, Scope } from "./expr";
export { ExpressionError, evaluateExpression, evaluateQuantity } from "./expr";
export type { CutAdd } from "./joints/types";
export * from "./length";
export { DEFAULT_PLANING_ALLOWANCE } from "./nest";
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
export type { RuleId } from "./rules";
export { RULE_IDS } from "./rules";
export { shopProblem } from "./shop";
export type { SolvedInstance, SolvedModel, SolvedOp, SolvedPart } from "./solve/model";
export { MAX_PATTERN_COUNT, solveModel } from "./solve/model";
export {
  attachCopyIn,
  attachPartIn,
  detachCopyIn,
  detachPartIn,
  detachReferencedBoards,
  MAX_COUNT,
  projectFromTemplate,
  removeStructureIn,
  STOCK_FIELDS,
  STOCK_OPTIONS,
  TEMPLATES,
  withoutGenerated,
} from "./structures";
export * from "./types";
export * from "./units";
export { edgeName, JOINT_NAME, JOINT_WORD } from "./words";
