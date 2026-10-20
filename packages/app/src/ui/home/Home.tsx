// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Home (design spec §2; ADR 016, D1): where every visit after the first starts. The sidebar finds
// and opens projects; the main area is "What's on the bench?" with the templates, Inspiration
// (later) and the recent projects, or All projects. A browser that cannot keep projects is told so,
// and the banner stays; the open project it does not keep is the first recent card, so it is never
// out of reach. New project opens over Home, which is hidden and out of reach while it is open.

import type { Project } from "@kerf/core";
import { type ReactNode, useId, useRef, useState } from "react";
import type { ProjectSummary } from "../../model/library";
import type { PieceId } from "../../model/new-project";
import { openProjectNotKept } from "../../model/store";
import { useKerf, useKerfStore } from "../../state/useKerf";
import { Drawing } from "../art/drawings";
import { Notice } from "../Notice";
import { NewProject } from "../new/NewProject";
import { addPickedFile } from "../open-file";
import { SettingsMenu } from "../SettingsMenu";
import { AllProjects, NO_PROJECTS_YET, ProjectCards } from "./AllProjects";
import { HomeSidebar, type HomeView } from "./HomeSidebar";
import { LaterBadge, Templates } from "./Templates";

/** How many recent projects the bench shows as cards: two rows of four. */
const RECENT_CARDS = 8;

/** `projects` whose names hold `query`, in any case; all of them when nothing is typed. */
const matching = <T extends { name: string }>(projects: readonly T[], query: string): T[] =>
  projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

/** A section of the bench with its heading, and what goes at the heading's right. */
function BenchSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section className="bench-section" aria-labelledby={heading}>
      <div className="bench-heading">
        <h2 id={heading}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * "What's on the bench?": the templates, Inspiration (later), and the most recent projects, after
 * the open project that is not kept (`notKept`), if any.
 */
function Bench({
  projects,
  notKept,
  now,
  onNewProject,
  seeAll,
}: {
  projects: readonly ProjectSummary[];
  notKept: Project | null;
  now: Date;
  onNewProject: (piece: PieceId) => void;
  seeAll: () => void;
}) {
  const seeAllButton = (
    <button type="button" className="quiet" onClick={seeAll}>
      See all
    </button>
  );
  return (
    <>
      <h1 className="home-title">What's on the bench?</h1>
      <p className="home-lede">Start from a piece, a blank project, or a file.</p>
      <BenchSection title="Templates">
        <Templates onPick={onNewProject} />
        <div className="inspiration">
          <span className="inspiration-art">
            <Drawing name="photo" />
          </span>
          <p>
            <b>
              Inspiration <LaterBadge />
            </b>
            Browse styles, real pieces and plans, or drop in a photo of something you love, and Kerf
            turns it into a starting point.
          </p>
        </div>
      </BenchSection>
      <BenchSection title="Recent files" aside={(projects.length > 0 || notKept) && seeAllButton}>
        {projects.length > 0 || notKept ? (
          <ProjectCards projects={projects.slice(0, RECENT_CARDS)} notKept={notKept} now={now} />
        ) : (
          <p className="home-empty">{NO_PROJECTS_YET}</p>
        )}
      </BenchSection>
    </>
  );
}

/** New project, open over Home: with the piece pressed, or none (it starts where it was left). */
type Starting = { piece?: PieceId };

/** The Home screen, and New project over it once it is asked for. */
export function Home() {
  const store = useKerfStore();
  const [starting, setStarting] = useState<Starting | null>(null);
  const onNewProject = (piece?: PieceId): void => setStarting(piece ? { piece } : {});
  const projects = useKerf((s) => s.projects);
  const notKept = useKerf(openProjectNotKept);
  const banner = useKerf((s) => s.projectsNotKept);
  const [view, setView] = useState<HomeView>("home");
  const [query, setQuery] = useState("");
  const chooser = useRef<HTMLInputElement>(null);
  const typed = query.trim();
  // Finding a project searches them all, whichever view was showing.
  const shown: HomeView = typed === "" ? view : "all";
  const now = new Date();

  const showView = (next: HomeView): void => {
    setView(next);
    if (next === "home") setQuery("");
  };

  const covered = starting !== null;

  return (
    <>
      <div className="home-screen" inert={covered} aria-hidden={covered || undefined}>
        <header className="topbar">
          <span className="brand">Kerf</span>
          <div className="topbar-actions home-actions">
            <SettingsMenu />
          </div>
        </header>
        <Notice />
        {banner && (
          <p role="alert" className="banner home-banner">
            {banner}
          </p>
        )}
        <div className="home">
          <HomeSidebar
            view={shown}
            query={query}
            setView={showView}
            setQuery={setQuery}
            newProject={() => onNewProject()}
            openFile={() => chooser.current?.click()}
          />
          <main className="home-main">
            {shown === "all" ? (
              <AllProjects
                projects={matching(projects, typed)}
                notKept={notKept && (matching([notKept], typed)[0] ?? null)}
                query={typed}
                now={now}
              />
            ) : (
              <Bench
                projects={projects}
                notKept={notKept}
                now={now}
                onNewProject={onNewProject}
                seeAll={() => showView("all")}
              />
            )}
          </main>
        </div>
        <input
          ref={chooser}
          type="file"
          accept=".kerf"
          className="visually-hidden"
          aria-label="Kerf file to open"
          tabIndex={-1}
          onChange={(e) => void addPickedFile(store, e)}
        />
      </div>
      {starting && <NewProject piece={starting.piece} onClose={() => setStarting(null)} />}
    </>
  );
}
