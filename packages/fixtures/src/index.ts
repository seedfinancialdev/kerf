// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from "node:fs";
// Node's own URL: under jsdom the global URL is jsdom's, which fileURLToPath rejects.
import { fileURLToPath, URL as NodeURL } from "node:url";
import type { Project, ShopProfile } from "@kerf/core";

export { isMilestoneActive, type MilestoneId } from "./milestones";

export const REFERENCE_PROJECTS = ["bookcase", "box"] as const;
export type ReferenceProject = (typeof REFERENCE_PROJECTS)[number];
export type ProjectVariant = "project" | "structure";

export const FIXTURES_ROOT = fileURLToPath(new NodeURL("..", import.meta.url));

export function fixturePath(rel: string): string {
  return `${FIXTURES_ROOT}${rel}`;
}

export function readFixtureText(rel: string): string {
  return readFileSync(fixturePath(rel), "utf8");
}

/** Drops annotation keys (`_spec`, `_note`): they document a fixture and are never compared. */
export function stripAnnotations<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripAnnotations) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("_"))
        .map(([key, v]) => [key, stripAnnotations(v)]),
    ) as T;
  }
  return value;
}

export function projectText(name: ReferenceProject, variant: ProjectVariant = "project"): string {
  return readFixtureText(`${name}/${variant}.json`);
}

/** `project`: explicit part graph (M1-M2). `structure`: the same piece as a form (M3). */
export function loadProject(name: ReferenceProject, variant: ProjectVariant = "project"): Project {
  return JSON.parse(projectText(name, variant)) as Project;
}

export function loadExpected<T = unknown>(name: ReferenceProject, file: string): T {
  return stripAnnotations(JSON.parse(readFixtureText(`${name}/expected/${file}.json`))) as T;
}

export function loadShopProfile(): ShopProfile {
  return JSON.parse(readFixtureText("shop-profile.json")) as ShopProfile;
}

/** Returns a copy of the project with one parameter's expression replaced. */
export function withParam(project: Project, name: string, expr: string): Project {
  const found = project.params.some((p) => p.name === name);
  if (!found) throw new Error(`fixture has no parameter "${name}"`);
  return {
    ...project,
    params: project.params.map((p) => (p.name === name ? { ...p, expr } : p)),
  };
}
