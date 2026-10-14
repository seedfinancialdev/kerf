// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The model (Interaction spec, "Viewport (center)"): the canvas that holds every placed board
// (Board.tsx), the lines over them (Overlays.tsx) and the camera, and the guard that keeps a 3D
// failure inside the pane (ThreeDGuard.tsx). It fits the camera to the boards when they first
// appear and when the user asks.

import type { PlacedPart } from "@kerf/core";
import { addAfterEffect, Canvas, useThree } from "@react-three/fiber";
import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Camera } from "three";
import { shownProject } from "../model/store";
import { inches, toScene } from "../scene/frames";
import { HandOn } from "../state/Boundary";
import { useKerf, useKerfStore } from "../state/useKerf";
import { Board } from "./Board";
import { boardLooks } from "./board-looks";
import { FOV_DEGREES, fitView, isFramed, type View } from "./camera";
import { dispatchPointer } from "./dispatch";
import { Navigation } from "./Navigation";
import { GrainLine, Guides } from "./Overlays";
import { usePalette } from "./palette";
import { BOARD_FAULT, ENGINE_NOT_LOADED, ThreeDGuard } from "./ThreeDGuard";
import { ThumbnailSource } from "./ThumbnailSource";
import { useGeometry } from "./useGeometry";

/** Calls `drawn` after the next frame is on screen, then stops listening. */
function FirstPicture({ drawn }: { drawn(): void }) {
  useEffect(() => {
    const stop = addAfterEffect(() => {
      stop();
      drawn();
    });
    return stop;
  }, [drawn]);
  return null;
}

/**
 * Hands the view's camera to code outside the canvas, which a click on empty space needs for its
 * line of sight.
 */
function CameraKeeper({ into }: { into: MutableRefObject<Camera | null> }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    into.current = camera;
    return () => {
      into.current = null;
    };
  }, [camera, into]);
  return null;
}

interface ModelCanvasProps {
  /** True once the next frame shows the model framed (see `isFramed`). */
  framed: boolean;
  /** A click that hit no board. */
  missed(e: MouseEvent, camera: Camera | undefined): void;
  children: ReactNode;
}

/**
 * The canvas, and "Drawing the model…" over it until its first picture of the fitted view is up.
 * The canvas is on the page a few frames before the 3D view starts listening and draws, and until
 * then a click lands on nothing; the line tells the user (and a browser test) to wait. The wait
 * starts once the model is framed, in the same commit that moves the camera, so the frame it waits
 * for is taken from the fitted view; with no boards there is nothing to fit, so the first frame
 * does.
 */
function ModelCanvas({ framed, missed, children }: ModelCanvasProps) {
  const [drawn, setDrawn] = useState(false);
  const markDrawn = useCallback(() => setDrawn(true), []);
  const camera = useRef<Camera | null>(null);
  return (
    <div className="model-view" aria-busy={!drawn}>
      <Canvas
        camera={{ fov: FOV_DEGREES, near: 0.1, far: 10_000 }}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={(e) => missed(e, camera.current ?? undefined)}
      >
        {/* R3F reports every fault its boundary catches to the page; HandOn marks it as the
            3D view's, which the ThreeDGuard around the canvas says (state/Boundary.tsx). */}
        <HandOn>
          <CameraKeeper into={camera} />
          {children}
          {framed && !drawn && <FirstPicture drawn={markDrawn} />}
        </HandOn>
      </Canvas>
      {/* No live region: Notice owns role="status", and announcing a line that lasts a few frames helps no one. */}
      {!drawn && <p className="model-drawing">Drawing the model…</p>}
    </div>
  );
}

/** The corners of the box around every board, in scene inches. */
function sceneBounds(
  placements: PlacedPart[],
): [[number, number, number], [number, number, number]] {
  const pts = placements.flatMap((p) =>
    [toScene(p.box.min), toScene(p.box.max)].map((v) => v.map(inches)),
  );
  const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i] ?? 0))) as [
    number,
    number,
    number,
  ];
  const max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i] ?? 0))) as [
    number,
    number,
    number,
  ];
  return [min, max];
}

/** The 3D view of the shown project, or what stands in for it while it draws or when it cannot. */
export function Viewport() {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const result = useKerf((s) => s.solved?.result);
  const history = useKerf((s) => s.history);
  const selection = useKerf((s) => s.selection);
  const hovered = useKerf((s) => s.hovered);
  const fitRequest = useKerf((s) => s.fitRequest);
  const created = useKerf((s) => s.created);
  const palette = usePalette();
  const { ready, failed } = useGeometry();
  const [view, setView] = useState<View | null>(null);
  const placements = useMemo(() => result?.placements ?? [], [result]);
  const hasBoards = placements.length > 0;
  const change = useMemo(() => (update: (v: View) => View) => setView((v) => v && update(v)), []);

  useEffect(() => {
    if (failed) store.getState().warnOnce(ENGINE_NOT_LOADED);
  }, [failed, store]);

  // Fit when boards first appear, when another project is started or opened, and whenever Shift+Z
  // asks. Later edits keep the user's view, so the placements are read from the store here but
  // deliberately not watched.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refitting on every edit would fight the user.
  useEffect(() => {
    const boards = store.getState().solved?.result.placements ?? [];
    if (boards.length > 0) setView(fitView(...sceneBounds(boards)));
  }, [hasBoards, fitRequest, created, store]);

  if (!project || !result) return <p className="model-empty">Start a project to see it here.</p>;
  const looks = boardLooks(result, project);
  const selected = new Set(selection.kind === "boards" ? selection.instances : []);
  const hoveredBoard = placements.find((p) => p.instance === hovered);

  return (
    <ModelCanvas
      framed={isFramed(view, placements.length)}
      missed={(e, camera) => {
        if (e.button !== 2) dispatchPointer(store, "down", e, null, camera);
      }}
    >
      <hemisphereLight intensity={0.9} groundColor={palette.ground} />
      <directionalLight position={[60, 120, -80]} intensity={1.4} />
      <ThumbnailSource />
      {view && <Navigation view={view} change={change} />}
      {looks.map((look) => {
        const board = (drawCuts: boolean, faulted = false) => (
          <Board
            look={look}
            ready={drawCuts}
            faulted={faulted}
            color={palette[look.tone]}
            selected={selected.has(look.placed.instance)}
            glow={palette.accent}
            warning={palette.warning}
          />
        );
        // A fault drawing one board leaves that board plain with the badge, the rest drawn, and
        // the inspector says so (ADR 015, rule 10). It is tried again when History changes, not
        // on every preview of a drag; a failure of the geometry engine itself is a result of
        // meshFor, with the badge, not a throw.
        return (
          <ThreeDGuard
            key={look.placed.instance}
            told={BOARD_FAULT}
            fallback={board(false, true)}
            retryOn={history}
            onFault={() => store.getState().boardNotDrawn(look.placed.instance)}
          >
            {board(ready)}
          </ThreeDGuard>
        );
      })}
      <Guides color={palette.guide} />
      {hoveredBoard && <GrainLine placed={hoveredBoard} color={palette.grain} />}
    </ModelCanvas>
  );
}
