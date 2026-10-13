// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a build-plan tab says when the engine withheld its part of the plan: an error blocks it, and
// the banner above names the error ("The build plan never lies").

export function NothingToShow() {
  return <p className="muted">Nothing to show until the problem above is fixed.</p>;
}
