// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One sentence under the top bar saying what the current step is for (design spec, "Layout").

import { hintFor } from "../model/steps";
import { shownProject } from "../model/store";
import { useKerf } from "./useKerf";

export function HintLine() {
  const step = useKerf((s) => s.step);
  const type = useKerf((s) => shownProject(s)?.structures[0]?.type);
  return <p className="hint">{hintFor(step, type)}</p>;
}
