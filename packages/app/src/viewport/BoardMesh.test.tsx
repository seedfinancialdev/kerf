// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The Workshop's Board and New project's preview draw a board the same way: Board draws through
// BoardMesh and only adds the pointer, the pick and the badge. Each is drawn into a scene by R3F's
// own renderer with a stand-in for WebGL (jsdom has none; nothing here is drawn to a screen), and
// the board's triangles, place and paint are compared.

import { solve } from "@kerf/core";
import { act, createRoot, extend } from "@react-three/fiber";
import type { ReactNode } from "react";
import { Group, Mesh, MeshStandardMaterial, type Object3D, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { startProject } from "../model/commands";
import { STARTER_RECORD, shopProfileFor } from "../model/shop-record";
import { createStorage } from "../model/storage";
import { createKerfStore } from "../model/store";
import { KerfProvider } from "../state/useKerf";
import { memoryLibrary } from "../testing/memory-library";
import { memoryStorage } from "../testing/memory-storage";
import { Board } from "./Board";
import { BoardMesh } from "./BoardMesh";
import { boardLooks } from "./board-looks";

// <Canvas> teaches R3F the three.js classes; a root made by hand must be taught the ones a board
// uses. React's act is used here outside Testing Library, which otherwise tells React so.
extend({ Group, Mesh, MeshStandardMaterial });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const project = startProject("Bookcase", "imperial").project;
const [look] = boardLooks(solve(project, shopProfileFor(STARTER_RECORD)), project);

/** What R3F asks of a renderer before it draws; nothing is drawn here. */
const standIn = {
  render: () => undefined,
  setPixelRatio: () => undefined,
  setSize: () => undefined,
  dispose: () => undefined,
  domElement: document.createElement("canvas"),
} as unknown as WebGLRenderer;

/** What is seen of a mesh: its triangles, where it stands, and its paint. */
const seen = (mesh: Mesh) => {
  const material = mesh.material as MeshStandardMaterial;
  return {
    triangles: Array.from(mesh.geometry.getAttribute("position").array),
    matrix: [...mesh.matrix.elements],
    color: material.color.getHexString(),
    emissive: material.emissive.getHexString(),
    emissiveIntensity: material.emissiveIntensity,
  };
};

/** What is seen of each mesh `children` put in a scene, read while the scene is still up. */
async function drawn(children: ReactNode): Promise<ReturnType<typeof seen>[]> {
  const store = createKerfStore({
    storage: createStorage(memoryStorage()),
    library: memoryLibrary(),
  });
  const root = createRoot(document.createElement("canvas"));
  await root.configure({
    gl: standIn,
    frameloop: "never",
    events: undefined,
    size: { width: 100, height: 100, top: 0, left: 0 },
  });
  let scene: Object3D | undefined;
  await act(async () => {
    scene = root.render(<KerfProvider store={store}>{children}</KerfProvider>).getState().scene;
  });
  const meshes: ReturnType<typeof seen>[] = [];
  scene?.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(seen(o as Mesh));
  });
  root.unmount();
  return meshes;
}

describe("<Board> and <BoardMesh>", () => {
  if (!look) throw new Error("The bookcase has no boards.");

  it("draw an unpicked board alike", async () => {
    const board = await drawn(
      <Board
        look={look}
        ready={false}
        color="#d9b48a"
        selected={false}
        glow="#e0a458"
        warning="#e6c069"
      />,
    );
    const mesh = await drawn(<BoardMesh look={look} color="#d9b48a" built={undefined} />);
    expect(board).toHaveLength(1);
    expect(board[0]?.triangles.length).toBeGreaterThan(0);
    expect(board).toEqual(mesh);
  });

  it("draw a picked board alike, lit with the glow", async () => {
    const board = await drawn(
      <Board look={look} ready={false} color="#d9b48a" selected glow="#e0a458" warning="#e6c069" />,
    );
    const mesh = await drawn(
      <BoardMesh look={look} color="#d9b48a" built={undefined} glow="#e0a458" />,
    );
    expect(board).toEqual(mesh);
    expect(board[0]?.emissive).toBe("e0a458");
    expect(board[0]?.emissiveIntensity).toBeGreaterThan(0);
  });
});
