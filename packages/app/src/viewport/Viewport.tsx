// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The model (Interaction spec, "Viewport (center)"): every placed board, drawn with its cuts, wood-
// toned by stock, red when the engine reports an error on it, lit when selected, its grain shown on
// hover, and badged when its cuts cannot be drawn (ADR 015, rule 10); SketchUp navigation. Picks go
// to the active tool through dispatch.ts.

import { INCH, type PlacedPart } from "@kerf/core";
import { addAfterEffect, Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BufferAttribute, BufferGeometry, type Camera, Matrix4 } from "three";
import { shownProject } from "../model/store";
import { matrixOf, toScene } from "../scene/frames";
import { useKerf, useKerfStore } from "../state/useKerf";
import { badgePosition, geometryOf } from "./board-geometry";
import { type BoardLook, boardLooks } from "./board-looks";
import { cameraPosition, FOV_DEGREES, fitView, isFramed, type View } from "./camera";
import { dispatchPointer } from "./dispatch";
import { followDrag, followsDrag } from "./follow-drag";
import { meshFor } from "./meshes";
import { usePalette } from "./palette";
import { BOARD_NOT_DRAWN, ENGINE_NOT_LOADED, ThreeDGuard } from "./ThreeDGuard";
import { useGeometry } from "./useGeometry";
import { listenForViewDrags } from "./view-drag";

const INCHES = (n: number): number => n / INCH;

interface BoardProps {
  look: BoardLook;
  ready: boolean;
  color: string;
  selected: boolean;
  glow: string;
  /** The badge's colour when the board's cuts cannot be drawn (ADR 015, rule 10). */
  warning: string;
}

function Board({ look, ready, color, selected, glow, warning }: BoardProps) {
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
    if (followsDrag(store.getState()) && e.nativeEvent.target instanceof HTMLElement) {
      followDrag(store, e.nativeEvent, e.nativeEvent.target, e.camera);
    }
  };
  return (
    <>
      <mesh
        geometry={geometry}
        matrix={matrix}
        matrixAutoUpdate={false}
        onPointerDown={down}
        onPointerOver={() => store.getState().hover(placed.instance)}
        onPointerOut={() => store.getState().hover(null)}
      >
        <meshStandardMaterial
          color={color}
          emissive={glow}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>
      {built?.ok === false && <WarningBadge placed={placed} color={warning} />}
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

/** The Tape's guide lines, dashed, kept for the session (ADR 015, D6). */
function Guides({ color }: { color: string }) {
  const guides = useKerf((s) => s.guides);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const points = guides.flatMap(([a, b]) => [...toScene(a), ...toScene(b)].map(INCHES));
    g.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [guides]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (guides.length === 0) return null;
  return (
    <lineSegments geometry={geometry} onUpdate={(line) => line.computeLineDistances()}>
      <lineDashedMaterial color={color} dashSize={1} gapSize={0.5} />
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

/** Middle-drag orbits, Shift+middle-drag pans, the wheel zooms; after O or H the left button does too. */
function Navigation({ view, change }: { view: View; change(update: (v: View) => View): void }) {
  const { camera, gl, size } = useThree();
  const mode = useKerf((s) => s.navigation);
  useEffect(() => {
    camera.position.set(...cameraPosition(view));
    camera.lookAt(...view.target);
  }, [camera, view]);
  useEffect(
    () => listenForViewDrags(gl.domElement, { mode, height: size.height, change }),
    [gl, change, size.height, mode],
  );
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

/** Hands the view's camera to code outside the canvas, which a click on empty space needs for its line of sight. */
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
 * for is taken from the fitted view; with no boards there is nothing to fit, so the first frame does.
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
        <CameraKeeper into={camera} />
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
  const { ready, failed } = useGeometry();
  const [view, setView] = useState<View | null>(null);
  const placements = useMemo(() => result?.placements ?? [], [result]);
  const hasBoards = placements.length > 0;
  const change = useMemo(() => (update: (v: View) => View) => setView((v) => v && update(v)), []);

  useEffect(() => {
    if (failed) store.getState().warnOnce(ENGINE_NOT_LOADED);
  }, [failed, store]);

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
      missed={(e, camera) => {
        if (e.button !== 2) dispatchPointer(store, "down", e, null, camera);
      }}
    >
      <hemisphereLight intensity={0.9} groundColor={palette.ground} />
      <directionalLight position={[60, 120, -80]} intensity={1.4} />
      <ThumbnailSource />
      {view && <Navigation view={view} change={change} />}
      {looks.map((look) => {
        const board = (drawCuts: boolean) => (
          <Board
            look={look}
            ready={drawCuts}
            color={palette[look.tone]}
            selected={selected.has(look.placed.instance)}
            glow={palette.accent}
            warning={palette.warning}
          />
        );
        // The geometry engine failing on one board leaves that board plain, the rest drawn.
        return (
          <ThreeDGuard
            key={look.placed.instance}
            told={BOARD_NOT_DRAWN}
            fallback={board(false)}
            retryOn={result}
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
