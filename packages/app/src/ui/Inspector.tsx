// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The right panel (Interaction spec, "Inspector"): what the current step offers.

import { BoardStockPanel } from "../tools/BoardStockPanel";
import { JoinPanel } from "../tools/JoinPanel";
import { TapePanel } from "../tools/TapePanel";
import { BoardInspector } from "./BoardInspector";
import { DivideStep } from "./DivideStep";
import { JoineryStep } from "./JoineryStep";
import { Problems } from "./Problems";
import { ShapeStep } from "./ShapeStep";
import { StartStep } from "./StartStep";
import { useKerf } from "./useKerf";

/** The right panel; the Board tool's stock, the Join tool's proposal or the Tape's reading comes first. */
export function Inspector() {
  const tool = useKerf((s) => s.tool);
  return (
    <>
      {tool === "board" && <BoardStockPanel />}
      {tool === "join" && <JoinPanel />}
      {tool === "tape" && <TapePanel />}
      <StepPanel />
    </>
  );
}

function StepPanel() {
  const step = useKerf((s) => s.step);
  const selection = useKerf((s) => s.selection);
  if (step !== "Start" && selection.kind === "boards") {
    return <BoardInspector instances={selection.instances} />;
  }
  switch (step) {
    case "Start":
      return <StartStep />;
    case "Shape":
      return <ShapeStep />;
    case "Divide":
      return <DivideStep />;
    case "Joinery":
      return <JoineryStep />;
    case "Build plan":
      return (
        <div className="step-panel">
          <Problems />
        </div>
      );
  }
}
