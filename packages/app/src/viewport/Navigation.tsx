// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// SketchUp navigation for the view (Interaction spec, "3D tools"): puts the camera where the view
// says and turns drags and the wheel into changes of it.

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useKerf } from "../state/useKerf";
import { cameraPosition, type View } from "./camera";
import { listenForViewDrags } from "./view-drag";

/**
 * Middle-drag orbits, Shift+middle-drag pans, the wheel zooms; after O or H the left button does
 * too.
 */
export function Navigation({
  view,
  change,
}: {
  view: View;
  change(update: (v: View) => View): void;
}) {
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
