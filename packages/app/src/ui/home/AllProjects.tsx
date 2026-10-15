// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// All projects (design spec §2): every project, newest change first, and those whose names hold
// what is typed in Find a project.

import type { ProjectSummary } from "../../model/library";
import { ProjectCard } from "./ProjectCard";

/** Said where cards will be, before any project is kept. */
export const NO_PROJECTS_YET = "Projects you start will show here.";

/** `projects` as cards, in the order given; `now` is when their "Edited …" lines count from. */
export function ProjectCards({
  projects,
  now,
}: {
  projects: readonly ProjectSummary[];
  now: Date;
}) {
  return (
    <ul className="project-cards">
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
