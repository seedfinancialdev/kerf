// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Home's sidebar (design spec §2): New project, Find a project, Home, All projects, Open file…, the
// last few projects under Recent files, Learn, and Your shop at the foot.

import type { Stock } from "@kerf/core";
import { useId } from "react";
import { isHung, PEG_TOOLS, type PegTool, wallFrom } from "../../model/pegboard";
import { openProjectNotKept } from "../../model/store";
import { useKerf, useKerfStore } from "../../state/useKerf";
import { Drawing } from "../art/drawings";
import { TOOL_CARDS } from "../shop/Pegboard";
import { Tip } from "../Tip";
import { TIPS } from "../tips";

/** How many projects Recent files lists. */
const RECENT = 5;

/** Home's two views: the bench (templates and recent files) and every project. */
export type HomeView = "home" | "all";

/** "a", "a and b", "a, b and c". */
const listed = (words: readonly string[]): string =>
  words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/** One line on what is hung: the tools, then the wood ("Table saw, router · 3/4 plywood"). */
function shopLine(tools: readonly PegTool[], wood: readonly Stock[]): string {
  const names = tools.map((t, i) =>
    i === 0 ? TOOL_CARDS[t].name : TOOL_CARDS[t].name.toLowerCase(),
  );
  const toolText = names.length > 0 ? names.join(", ") : "No tools hung yet";
  const woodText = wood.length > 0 ? listed(wood.map((s) => s.name)) : "no wood yet";
  return `${toolText} · ${woodText}`;
}

/** Your shop at the sidebar's foot: small drawings of the hung tools, what is hung, and Edit. */
function ShopSummary() {
  const store = useKerfStore();
  const record = useKerf((s) => s.shopRecord);
  const heading = useId();
  const wall = wallFrom(record);
  const tools = PEG_TOOLS.filter((t) => isHung(wall, t));
  return (
    <section className="home-shop" aria-labelledby={heading}>
      <h2 id={heading}>Your shop</h2>
      <div className="home-shop-tools">
        {tools.map((t) => (
          <Drawing key={t} name={TOOL_CARDS[t].drawing} />
        ))}
      </div>
      <p>{shopLine(tools, record.stock)}</p>
      <button type="button" onClick={() => store.getState().setScreen("shop")}>
        Edit
      </button>
    </section>
  );
}

/** The newest projects, each a button that opens it. */
function RecentFiles() {
  const store = useKerfStore();
  const recent = useKerf((s) => s.projects).slice(0, RECENT);
  const heading = useId();
  return (
    <section className="home-recent" aria-labelledby={heading}>
      <h2 id={heading} className="home-label">
        Recent files
      </h2>
      {recent.length > 0 ? (
        <ul>
          {recent.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="home-link"
                onClick={() => void store.getState().openProject(p.id)}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-label-empty">None yet</p>
      )}
    </section>
  );
}

/** Says that the tour needs a project to show around the Workshop in (design spec §4). */
const NO_PROJECT_FOR_TOUR = "Make a project first, then the tour will show you around.";

/**
 * Brings the tour back (design spec §4, "reopened from Learn"): it shows the Workshop, so it starts
 * there on the open project the library does not keep (opening another would lose it), else on the
 * newest project, or says that a project is needed first.
 */
function useLearn(): () => Promise<void> {
  const store = useKerfStore();
  return async () => {
    if (openProjectNotKept(store.getState())) {
      store.getState().setScreen("workshop");
      store.getState().startTour();
      return;
    }
    const newest = store.getState().projects[0];
    if (!newest) {
      store.getState().say(NO_PROJECT_FOR_TOUR);
      return;
    }
    if (await store.getState().openProject(newest.id)) store.getState().startTour();
  };
}

/**
 * The sidebar. `view` is the view shown, `query` what is typed in Find a project; the handlers
 * change them, start a new project and open a file.
 */
export function HomeSidebar({
  view,
  query,
  setView,
  setQuery,
  newProject,
  openFile,
}: {
  view: HomeView;
  query: string;
  setView: (view: HomeView) => void;
  setQuery: (query: string) => void;
  newProject: () => void;
  openFile: () => void;
}) {
  const current = (v: HomeView) => (v === view ? "page" : undefined);
  const learn = useLearn();
  return (
    <aside className="home-sidebar" aria-label="Your projects">
      <button type="button" className="primary home-new" onClick={newProject}>
        New project
      </button>
      <input
        type="search"
        className="home-search"
        aria-label="Find a project"
        placeholder="Find a project"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <nav aria-label="Projects" className="home-nav">
        <button
          type="button"
          className="home-link"
          aria-current={current("home")}
          onClick={() => setView("home")}
        >
          Home
        </button>
        <button
          type="button"
          className="home-link"
          aria-current={current("all")}
          onClick={() => setView("all")}
        >
          All projects
        </button>
        <button type="button" className="home-link" onClick={openFile}>
          Open file…
        </button>
      </nav>
      <RecentFiles />
      <Tip tip={TIPS.learn}>
        <button type="button" className="home-link home-learn" onClick={() => void learn()}>
          Learn
        </button>
      </Tip>
      <ShopSummary />
    </aside>
  );
}
