// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The right panel (Interaction spec, "Inspector"): what the current step offers.

import { StartStep } from "./StartStep";
import { useKerf } from "./useKerf";

export function Inspector() {
  const step = useKerf((s) => s.step);
  switch (step) {
    case "Start":
      return <StartStep />;
    default:
      return null;
  }
}
