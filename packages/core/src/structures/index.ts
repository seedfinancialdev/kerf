// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

export {
  attachPartIn,
  detachCopyIn,
  detachedPart,
  detachPartIn,
  detachReferencedBoards,
} from "./detach";
export { generate, generateFrom } from "./generate";
export { generatedId } from "./ids";
export { strandedReferences, withoutGenerated } from "./strip";
export { projectFromTemplate, STOCK_OPTIONS, TEMPLATES } from "./templates";
