// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The model (Interaction spec, "Viewport (center)"): every placed board, drawn with its cuts, wood-
// toned by stock, red when the engine reports an error on it, lit when selected, its grain shown on
// hover; SketchUp navigation. Picks go to the active tool through tools/dispatch.ts.

import type { PartShape, PlacedPart, Project } from "@kerf/core";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry, Matrix4 } from "three";
import { shownProject } from "../model/store";
import { dispatchPointer } from "../tools/dispatch";
import { useKerf, useKerfStore } from "../ui/useKerf";
import { cameraPosition, FOV_DEGREES, fitView, orbit, pan, type View, zoom } from "./camera";
import { matrixOf, toScene } from "./frames";
import { type MeshResult, meshFor } from "./meshes";
import { type Palette, usePalette } from "./palette";
import { useGeometry } from "./useGeometry";

const INCHES = (n: number): number => n / 203_200;

/** The plain blank as triangles (ADR 015, rules 8 and 10), when a shape is withheld or fails. */
function blankGeometry(size: PlacedPart["size"]): BufferGeometry {
  const [l, w, t] = [size.length, size.width, size.thickness].map(INCHES) as [
    number,
    number,
    number,
  ];
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([0, 0, 0, l, 0, 0, l, w, 0, 0, w, 0, 0, 0, t, l, 0, t, l, w, t, 0, w, t]),
      3,
    ),
  );
  g.setIndex([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  g.computeVertexNormals();
  return g;
}

function geometryOf(built: MeshResult | undefined, size: PlacedPart["size"]): BufferGeometry {
  if (!built?.ok) return blankGeometry(size);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(built.mesh.positions, 3));
  g.setIndex(new BufferAttribute(built.mesh.indices, 1));
  g.computeVertexNormals();
  return g;
}

interface BoardProps {
  placed: PlacedPart;
  shape: PartShape | undefined;
  ready: boolean;
  color: string;
  selected: boolean;
  glow: string;
}

function Board({ placed, shape, ready, color, selected, glow }: BoardProps) {
  const store = useKerfStore();
  const built = ready && shape ? meshFor(shape) : undefined;
  const { length, width, thickness } = placed.size;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the size is read through its three numbers, so an equal size from a new solve keeps the geometry.
  const geometry = useMemo(() => geometryOf(built, placed.size), [built, length, width, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const matrix = useMemo(() => new Matrix4().fromArray(matrixOf(placed.frame)), [placed.frame]);
  const send = (kind: "down" | "move" | "up") => (e: ThreeEvent<PointerEvent>) => {
    if (kind === "down" && e.button !== 0) return;
    e.stopPropagation();
    dispatchPointer(store, kind, e, placed);
  };
  return (
    <mesh
      geometry={geometry}
      matrix={matrix}
      matrixAutoUpdate={false}
      onPointerDown={send("down")}
      onPointerMove={send("move")}
      onPointerUp={send("up")}
      onPointerOver={() => store.getState().hover(placed.instance)}
      onPointerOut={() => store.getState().hover(null)}
    >
      <meshStandardMaterial
        color={color}
        emissive={selected ? glow : "#000000"}
        emissiveIntensity={selected ? 0.35 : 0}
      />
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

function colorOf(project: Project, placed: PlacedPart, broken: boolean, palette: Palette): string {
  if (broken) return palette.error;
  return project.stock.find((s) => s.id === placed.stock)?.kind === "sheet"
    ? palette.sheet
    : palette.solid;
}

export function Viewport() {
  const store = useKerfStore();
  const project = useKerf((s) => shownProject(s));
  const result = useKerf((s) => s.solved?.result);
  const selection = useKerf((s) => s.selection);
  const hovered = useKerf((s) => s.hovered);
  const fitRequest = useKerf((s) => s.fitRequest);
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

  // Fit when boards first appear and whenever Shift+Z asks. Later edits keep the user's view, so
  // the placements are read from the store here but deliberately not watched.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refitting on every edit would fight the user.
  useEffect(() => {
    const boards = store.getState().solved?.result.placements ?? [];
    if (boards.length > 0) setView(fitView(...sceneBounds(boards)));
  }, [hasBoards, fitRequest, store]);

  if (!project || !result) return <p className="model-empty">Start a project to see it here.</p>;
  const shapes = new Map(result.shapes.map((x) => [x.definition, x]));
  const broken = new Set(
    result.diagnostics.flatMap((d) => (d.severity === "error" && d.part ? [d.part] : [])),
  );
  const selected = new Set(selection.kind === "boards" ? selection.instances : []);
  const hoveredBoard = placements.find((p) => p.instance === hovered);

  return (
    <Canvas
      camera={{ fov: FOV_DEGREES, near: 0.1, far: 10_000 }}
      gl={{ preserveDrawingBuffer: true }}
      onPointerMissed={(e) => dispatchPointer(store, "down", e, null)}
    >
      <hemisphereLight intensity={0.9} groundColor="#3a3d42" />
      <directionalLight position={[60, 120, -80]} intensity={1.4} />
      <ThumbnailSource />
      {view && <Navigation view={view} change={change} />}
      {placements.map((p) => (
        <Board
          key={p.instance}
          placed={p}
          shape={shapes.get(p.shape)}
          ready={ready}
          color={colorOf(project, p, broken.has(p.part), palette)}
          selected={selected.has(p.instance)}
          glow={palette.accent}
        />
      ))}
      {hoveredBoard && <GrainLine placed={hoveredBoard} color={palette.grain} />}
    </Canvas>
  );
}
