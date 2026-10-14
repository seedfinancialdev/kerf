// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// What a build-plan tab says when it has nothing to list. When an error withholds the plan, the
// banner above names it ("The build plan never lies"); otherwise the project simply has nothing
// of that kind, and the tab says so in its own words.

import { useKerf } from "../state/useKerf";

/** The empty tab's line: the blocked-plan sentence while an error withholds it, else `empty`. */
export function NothingToShow({ empty }: { empty: string }) {
  const blocked = useKerf((s) => s.solved?.result.blocked === true);
  return (
    <p className="muted">{blocked ? "Nothing to show until the problem above is fixed." : empty}</p>
  );
}
