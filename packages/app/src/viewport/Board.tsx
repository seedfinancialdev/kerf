// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// One placed board in the model (Interaction spec, "Viewport (center)"): its cuts, or its blank
// with a warning badge when they cannot be drawn (ADR 015, rule 10), tinted by stock or error and
// lit when selected. A press on it goes to the active tool through dispatch.ts. How it looks is
// BoardMesh.tsx; this adds the pointer, the pick and the badge.

import type { PlacedPart } from "@kerf/core";
import type { ThreeEvent } from "@react-three/fiber";
import { useKerf, useKerfStore } from "../state/useKerf";
import { BoardMesh } from "./BoardMesh";
import { badgePosition } from "./board-geometry";
import type { BoardLook } from "./board-looks";
import { dispatchPointer } from "./dispatch";
import { followDrag, followsDrag } from "./follow-drag";
import { meshFor } from "./meshes";

interface BoardProps {
  look: BoardLook;
  ready: boolean;
  /** True when drawing this board failed, so it is drawn plain with the badge (ADR 015, rule 10). */
  faulted?: boolean;
  color: string;
  selected: boolean;
  glow: string;
  /** The badge's colour when the board's cuts cannot be drawn (ADR 015, rule 10). */
  warning: string;
}

/** One board of the model; see the file header. */
export function Board({
  look,
  ready,
  faulted = false,
  color,
  selected,
  glow,
  warning,
}: BoardProps) {
  const store = useKerfStore();
  const { placed } = look;
  // An engine fault is asked about again once History moves, not on every preview frame.
  const recorded = useKerf((s) => s.history);
  const built = ready && look.geometry === "cut" ? meshFor(look.shape, recorded) : undefined;
  const down = (e: ThreeEvent<PointerEvent>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dispatchPointer(store, "down", e, placed);
    // A tool that began something to drag hears the rest of the drag wherever the pointer goes.
    if (followsDrag(store.getState()) && e.nativeEvent.target instanceof HTMLElement) {
      followDrag(store, e.nativeEvent, e.nativeEvent.target, e.camera);
    }
  };
  // The group hears the pointer on the board it holds (R3F passes a hit on to its parents); the
  // badge stays outside it, so a press on the badge is not a press on the board.
  return (
    <>
      <group
        onPointerDown={down}
        onPointerOver={() => store.getState().hover(placed.instance)}
        onPointerOut={() => store.getState().hover(null)}
      >
        <BoardMesh look={look} color={color} built={built} glow={selected ? glow : undefined} />
      </group>
      {(faulted || built?.ok === false) && <WarningBadge placed={placed} color={warning} />}
    </>
  );
}

/** Half the size of the warning badge, in inches. */
const BADGE_RADIUS_INCHES = 0.75;

/**
 * The warning badge over a board the view draws as its plain blank because its cuts cannot be
 * drawn (ADR 015, rule 10); the inspector says why when the board is picked.
 */
function WarningBadge({ placed, color }: { placed: PlacedPart; color: string }) {
  return (
    <mesh position={badgePosition(placed.box)}>
      <octahedronGeometry args={[BADGE_RADIUS_INCHES]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}
