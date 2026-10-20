// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// All projects (design spec §2): every project, newest change first, and those whose names hold
// what is typed in Find a project.

import type { Project } from "@kerf/core";
import type { ProjectSummary } from "../../model/library";
import { NotKeptCard, ProjectCard } from "./ProjectCard";

/** Said where cards will be, before any project is kept. */
export const NO_PROJECTS_YET = "Projects you start will show here.";

/**
 * `projects` as cards, in the order given, after the open project that is not kept (`notKept`), if
 * any; `now` is when their "Edited …" lines count from.
 */
export function ProjectCards({
  projects,
  notKept = null,
  now,
}: {
  projects: readonly ProjectSummary[];
  notKept?: Project | null;
  now: Date;
}) {
  return (
    <ul className="project-cards">
      {notKept && <NotKeptCard project={notKept} />}
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} now={now} />
      ))}
    </ul>
  );
}

/**
 * The All projects view: `projects` (already narrowed to those matching `query`, newest change
 * first, as the store lists them) or, when there are none, why not.
 */
export function AllProjects({
  projects,
  query,
  now,
}: {
  projects: readonly ProjectSummary[];
  query: string;
  now: Date;
}) {
  const none = query === "" ? NO_PROJECTS_YET : `No project's name has "${query}" in it.`;
  return (
    <>
      <h1 className="home-title">All projects</h1>
      {projects.length > 0 ? (
        <ProjectCards projects={projects} now={now} />
      ) : (
        <p className="home-empty">{none}</p>
      )}
    </>
  );
}
