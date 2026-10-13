// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

export {
  attachCopyIn,
  attachPartIn,
  detachCopyIn,
  detachedPart,
  detachPartIn,
  detachReferencedBoards,
  removeStructureIn,
} from "./detach";
export { generate, generateFrom } from "./generate";
export { generatedId } from "./ids";
export { strandedReferences, withoutGenerated } from "./strip";
export { projectFromTemplate, STOCK_FIELDS, STOCK_OPTIONS, TEMPLATES } from "./templates";
