// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The model (Interaction spec, "Viewport (center)"): every placed board, drawn with its cuts, wood-
// toned by stock, red when the engine reports an error on it, lit when selected, its grain shown on
// hover; SketchUp navigation. Picks go to the active tool through tools/dispatch.ts.

import { INCH, type PlacedPart } from "@kerf/core";
import { addAfterEffect, Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry, Matrix4 } from "three";
import { shownProject } from "../model/store";
import { dispatchPointer } from "../tools/dispatch";
import { useKerf, useKerfStore } from "../ui/useKerf";
import { geometryOf } from "./board-geometry";
import { type BoardLook, boardLooks } from "./board-looks";
import {
  cameraPosition,
  FOV_DEGREES,
  fitView,
  isFramed,
  orbit,
  pan,
  type View,
  zoom,
} from "./camera";
import { followDrag } from "./follow-drag";
import { matrixOf, toScene } from "./frames";
import { meshFor } from "./meshes";
import { usePalette } from "./palette";
import { useGeometry } from "./useGeometry";

const INCHES = (n: number): number => n / INCH;

interface BoardProps {
  look: BoardLook;
  ready: boolean;
  color: string;
  selected: boolean;
  glow: string;
}

function Board({ look, ready, color, selected, glow }: BoardProps) {
  const store = useKerfStore();
  const { placed } = look;
  const built = ready && look.geometry === "cut" ? meshFor(look.shape) : undefined;
  const { length, width, thickness } = placed.size;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the size is read through its three numbers, so an equal size from a new solve keeps the geometry.
  const geometry = useMemo(() => geometryOf(built, placed.size), [built, length, width, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const matrix = useMemo(() => new Matrix4().fromArray(matrixOf(placed.frame)), [placed.frame]);
  const down = (e: ThreeEvent<PointerEvent>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dispatchPointer(store, "down", e, placed);
    // A tool that began something to drag hears the rest of the drag wherever the pointer goes.
    if (store.getState().pending !== null && e.nativeEvent.target instanceof HTMLElement) {
      followDrag(store, e.nativeEvent, e.nativeEvent.target, e.camera);
    }
  };
  return (
    <mesh
      geometry={geometry}
      matrix={matrix}
      matrixAutoUpdate={false}
      onPointerDown={down}
      onPointerOver={() => store.getState().hover(placed.instance)}
      onPointerOut={() => store.getState().hover(null)}
    >
      <meshStandardMaterial color={color} emissive={glow} emissiveIntensity={selected ? 0.35 : 0} />
    </mesh>
  );
}

/** A line along the hovered board's length, on its show face: the grain direction. */
function GrainLine({ placed, color }: { placed: PlacedPart; color: string }) {
  const geometry = useMemo(() => {
    const m = matrixOf(placed.frame);
    const v = INCHES(placed.size.width) / 2;
    const w = INCHES(placed.size.thickness) + 0.02;
    const at = (u: number): number[] =>
      [0, 1, 2].map(
        (r) => (m[r] ?? 0) * u + (m[4 + r] ?? 0) * v + (m[8 + r] ?? 0) * w + (m[12 + r] ?? 0),
      );
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([...at(0), ...at(INCHES(placed.size.length))]), 3),
    );
    return g;
  }, [placed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

/** Lets the view's picture be the saved file's thumbnail (design spec, "Saving"). */
function ThumbnailSource() {
  const { gl } = useThree();
  const store = useKerfStore();
  useEffect(() => {
    store.getState().setThumbnailSource(
      () =>
        new Promise((resolve) => {
          gl.domElement.toBlob((blob) => {
            if (!blob) {
              resolve(undefined);
              return;
            }
            blob.arrayBuffer().then(
              (bytes) => resolve(new Uint8Array(bytes)),
              () => resolve(undefined),
            );
          }, "image/png");
        }),
    );
    return () => store.getState().setThumbnailSource(null);
  }, [gl, store]);
  return null;
}

interface Drag {
  x: number;
  y: number;
  panning: boolean;
}

/** Middle-drag orbits, Shift+middle-drag pans, the wheel zooms; after O or H the left button does too. */
function Navigation({ view, change }: { view: View; change(update: (v: View) => View): void }) {
  const { camera, gl, size } = useThree();
  const mode = useKerf((s) => s.navigation);
  const drag = useRef<Drag | null>(null);
  useEffect(() => {
    camera.position.set(...cameraPosition(view));
    camera.lookAt(...view.target);
  }, [camera, view]);
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent): void => {
      const left = e.button === 0 && mode !== null;
      if (e.button === 1) e.preventDefault();
      if (e.button === 1 || left)
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          panning: e.shiftKey || (left && mode === "pan"),
        };
    };
    const move = (e: PointerEvent): void => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      drag.current = { ...d, x: e.clientX, y: e.clientY };
      change((v) => (d.panning ? pan(v, dx, dy, size.height) : orbit(v, dx, dy)));
    };
    const up = (): void => {
      drag.current = null;
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      change((v) => zoom(v, e.deltaY));
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, change, size.height, mode]);
  return null;
}

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

interface ModelCanvasProps {
  /** True once the next frame shows the model framed (see `isFramed`). */
  framed: boolean;
  /** A click that hit no board. */
  missed(e: MouseEvent): void;
  children: ReactNode;
}

/**
 * The canvas, and "Drawing the model…" over it until its first picture of the fitted view is up.
 * The canvas is on the page a few frames before the 3D view starts listening and draws, and until
 * then a click lands on nothing; the line tells the user (and a browser test) to wait. The wait
 * starts once the model is framed, in the same commit that moves the camera, so the frame it waits
 * for is taken from the fitted view; with no boards there is nothing to fit, so the first frame does.
 */
function ModelCanvas({ framed, missed, children }: ModelCanvasProps) {
  const [drawn, setDrawn] = useState(false);
  const markDrawn = useCallback(() => setDrawn(true), []);
  return (
    <div className="model-view" aria-busy={!drawn}>
      <Canvas
        camera={{ fov: FOV_DEGREES, near: 0.1, far: 10_000 }}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={missed}
      >
        {children}
        {framed && !drawn && <FirstPicture drawn={markDrawn} />}
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
    [toScene(p.box.min), toScene(p.box.max)].map((v) => v.map(INCHES)),
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

export function Viewport() {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const result = useKerf((s) => s.solved?.result);
  const selection = useKerf((s) => s.selection);
  const hovered = useKerf((s) => s.hovered);
  const fitRequest = useKerf((s) => s.fitRequest);
  const created = useKerf((s) => s.created);
  const palette = usePalette();
  const { ready, failure } = useGeometry();
  const [view, setView] = useState<View | null>(null);
  const placements = useMemo(() => result?.placements ?? [], [result]);
  const hasBoards = placements.length > 0;
  const change = useMemo(() => (update: (v: View) => View) => setView((v) => v && update(v)), []);

  useEffect(() => {
    if (failure)
      store
        .getState()
        .say(`The 3D view could not start (${failure}), so boards are shown as plain blanks.`);
  }, [failure, store]);

  // Fit when boards first appear, when another project is started or opened, and whenever Shift+Z asks. Later edits keep the user's view, so
  // the placements are read from the store here but deliberately not watched.
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
      missed={(e) => {
        if (e.button !== 2) dispatchPointer(store, "down", e, null);
      }}
    >
      <hemisphereLight intensity={0.9} groundColor={palette.ground} />
      <directionalLight position={[60, 120, -80]} intensity={1.4} />
      <ThumbnailSource />
      {view && <Navigation view={view} change={change} />}
      {looks.map((look) => (
        <Board
          key={look.placed.instance}
          look={look}
          ready={ready}
          color={palette[look.tone]}
          selected={selected.has(look.placed.instance)}
          glow={palette.accent}
        />
      ))}
      {hoveredBoard && <GrainLine placed={hoveredBoard} color={palette.grain} />}
    </ModelCanvas>
  );
}
