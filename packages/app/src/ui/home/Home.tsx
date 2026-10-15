// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Home (design spec §2; ADR 016, D1): where every visit after the first starts. The sidebar finds and
// opens projects; the main area is "What's on the bench?" with the templates, Inspiration (later)
// and the recent projects, or All projects. A browser that cannot keep projects is told so, and the
// banner stays.

import { type ChangeEvent, type ReactNode, useId, useRef, useState } from "react";
import { LIBRARY_NOT_KEPT, type ProjectSummary } from "../../model/library";
import type { PieceId } from "../../model/new-project";
import { useKerf, useKerfStore } from "../../state/useKerf";
import { Drawing } from "../art/drawings";
import { Notice } from "../Notice";
import { SettingsMenu } from "../SettingsMenu";
import { AllProjects, NO_PROJECTS_YET, ProjectCards } from "./AllProjects";
import { HomeSidebar, type HomeView } from "./HomeSidebar";
import { LaterBadge, Templates } from "./Templates";

/** How many recent projects the bench shows as cards: two rows of four. */
const RECENT_CARDS = 8;

/** Said when the browser will not hand over the file picked. */
const UNREADABLE_FILE = "This file could not be read from your computer; try opening it again.";

/** `projects` whose names hold `query`, in any case; all of them when nothing is typed. */
const matching = (projects: readonly ProjectSummary[], query: string): readonly ProjectSummary[] =>
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

/** "What's on the bench?": the templates, Inspiration (later), and the most recent projects. */
function Bench({
  projects,
  now,
  onNewProject,
  seeAll,
}: {
  projects: readonly ProjectSummary[];
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
      <BenchSection title="Recent files" aside={projects.length > 0 && seeAllButton}>
        {projects.length > 0 ? (
          <ProjectCards projects={projects.slice(0, RECENT_CARDS)} now={now} />
        ) : (
          <p className="home-empty">{NO_PROJECTS_YET}</p>
        )}
      </BenchSection>
    </>
  );
}

/**
 * The Home screen. `onNewProject` starts New project, with `piece` chosen when a template was
 * pressed.
 */
export function Home({ onNewProject }: { onNewProject: (piece?: PieceId) => void }) {
  const store = useKerfStore();
  const projects = useKerf((s) => s.projects);
  const kept = useKerf((s) => s.projectsKept);
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

  const openPicked = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Cleared, so picking the same file again is a change too.
    e.target.value = "";
    if (!file) return;
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      store.getState().say(UNREADABLE_FILE);
      return;
    }
    await store.getState().addFile(new Uint8Array(bytes), file.name);
  };

  return (
    <div className="home-screen">
      <header className="topbar">
        <span className="brand">Kerf</span>
        <div className="topbar-actions home-actions">
          <SettingsMenu />
        </div>
      </header>
      <Notice />
      {!kept && (
        <p role="alert" className="banner home-banner">
          {LIBRARY_NOT_KEPT}
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
            <AllProjects projects={matching(projects, typed)} query={typed} now={now} />
          ) : (
            <Bench
              projects={projects}
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
        onChange={(e) => void openPicked(e)}
      />
    </div>
  );
}
