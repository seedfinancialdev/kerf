// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// New project's preview (design spec §3: "a live 3D preview of the real model, drawn by the engine"):
// the solved piece in a small canvas of its own, turning slowly so its depth reads, and still while the
// pointer is over it. It is only a picture: no navigation, no picking, no thumbnail for the download, and it
// never changes the store. If it cannot be drawn it says so in its place, and the piece can still be
// created.

import type { Project, SolveResult } from "@kerf/core";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { sceneBounds } from "../scene/frames";
import { Boundary, HandOn } from "../state/Boundary";
import { BoardMesh } from "./BoardMesh";
import { boardLooks } from "./board-looks";
import { cameraPosition, FOV_DEGREES, fitView, type View } from "./camera";
import { meshFor } from "./meshes";
import { usePalette } from "./palette";
import { useGeometry } from "./useGeometry";

/** Said in the preview's place when it cannot be drawn. */
export const PREVIEW_NOT_DRAWN =
  "The preview couldn't be drawn, but you can still create the piece.";

/** How fast the piece turns: 10° a second, slow enough to read every side as it passes. */
const TURN_RADIANS_PER_SECOND = (10 * Math.PI) / 180;

/** Puts the camera where `view` says, looking at its target. */
function Aim({ view }: { view: View }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...cameraPosition(view));
    camera.lookAt(...view.target);
  }, [camera, view]);
  return null;
}

/** Turns `children` about the vertical line through `centre` (scene inches) while `turning`. */
function Turntable({
  centre,
  turning,
  children,
}: {
  centre: [number, number, number];
  turning: boolean;
  children: ReactNode;
}) {
  const table = useRef<Group>(null);
  useFrame((_, seconds) => {
    if (turning && table.current) table.current.rotation.y += seconds * TURN_RADIANS_PER_SECOND;
  });
  const [x, y, z] = centre;
  return (
    <group position={centre}>
      <group ref={table}>
        <group position={[-x, -y, -z]}>{children}</group>
      </group>
    </group>
  );
}

/** True when the user asks the system for less motion; the piece then stands still. */
function prefersStill(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** The canvas: the lights as in the Workshop's view, and every board of `result`, turning. */
function PreviewCanvas({ project, result }: { project: Project; result: SolveResult }) {
  const palette = usePalette();
  const { ready } = useGeometry();
  const [pointerOver, setPointerOver] = useState(false);
  const still = useMemo(prefersStill, []);
  const looks = boardLooks(result, project);
  const view = useMemo(() => fitView(...sceneBounds(result.placements)), [result]);
  return (
    <div
      className="preview-canvas"
      onPointerEnter={() => setPointerOver(true)}
      onPointerLeave={() => setPointerOver(false)}
    >
      <Canvas camera={{ fov: FOV_DEGREES, near: 0.1, far: 10_000 }}>
        <HandOn>
          <hemisphereLight intensity={0.9} groundColor={palette.ground} />
          <directionalLight position={[60, 120, -80]} intensity={1.4} />
          <Aim view={view} />
          <Turntable centre={view.target} turning={!pointerOver && !still}>
            {looks.map((look) => (
              <BoardMesh
                key={look.placed.instance}
                look={look}
                color={palette[look.tone]}
                // A fault on a board is remembered for this solve only; the next change asks again.
                built={ready && look.geometry === "cut" ? meshFor(look.shape, result) : undefined}
              />
            ))}
          </Turntable>
        </HandOn>
      </Canvas>
    </div>
  );
}

/**
 * The preview of `project`, solved as `result`: its boards drawn in 3D, as plain blanks until the
 * geometry engine is loaded. If the engine or the 3D view cannot start, `PREVIEW_NOT_DRAWN` stands
 * in its place.
 */
export function Preview({ project, result }: { project: Project; result: SolveResult }) {
  const { failed } = useGeometry();
  const note = <p className="preview-note">{PREVIEW_NOT_DRAWN}</p>;
  return (
    <section aria-label="Preview of your piece" className="preview">
      {failed ? (
        note
      ) : (
        // Not ThreeDGuard: that also warns on the notice line, which would outlast the panel; the
        // words in the preview's place say all there is to say. The fault is logged for a bug report.
        <Boundary fallback={() => note} onFailure={(error) => console.error(error)}>
          <PreviewCanvas project={project} result={result} />
        </Boundary>
      )}
    </section>
  );
}
