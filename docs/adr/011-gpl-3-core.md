# ADR 011: GPL-3.0 core

Status: Accepted

## Context

"License: core app GPL-3.0 (or AGPL-3.0 for any server components) so the cloud tier and marketplace can't be cloned as a closed hosted product; plan files in an open format so users always own their designs." (Product spec)

## Decision

GPL-3.0 core. "Blocks closed hosted clones; compatible with OpenCutList." (Prototype plan, Decisions locked)

"GPL-3.0 headers and `LICENSE` from the first commit." (Build plan)

## Consequences

- `LICENSE` is the GPL-3.0 text; every source file carries a GPL-3.0 header.
- Porting logic from OpenCutList (GPL-3.0) is allowed with attribution (ADR 007).
- Plan files (`.kerf`) stay in an open, human-readable, diffable format.
