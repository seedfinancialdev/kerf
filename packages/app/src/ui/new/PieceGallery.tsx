// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// New project's left side (design spec §3, "Tabs"): Templates (the pieces, with Table and Dresser
// marked Later and "Something else"), Blank (an empty project, a plain case, a plain box), Open
// file (a .kerf file, added as a new project) and Inspiration, which comes later.

import { useId, useRef } from "react";
import { BLANKS, PIECES, type Piece, type PieceId } from "../../model/new-project";
import { useKerfStore } from "../../state/useKerf";
import { Drawing, type DrawingName } from "../art/drawings";
import { LaterBadge } from "../home/Templates";
import { addPickedFile } from "../open-file";

/** The gallery's tabs that hold something today. */
export type GalleryTab = "templates" | "blank" | "file";

const TABS: ReadonlyArray<{ tab: GalleryTab; label: string }> = [
  { tab: "templates", label: "Templates" },
  { tab: "blank", label: "Blank" },
  { tab: "file", label: "Open file" },
];

/** Each piece's drawing on its tile. */
const DRAWINGS: Record<PieceId, DrawingName> = {
  bookcase: "bookcase",
  cabinet: "cabinet",
  box: "box",
  table: "table",
  dresser: "dresser",
  idea: "idea",
  empty: "blank",
  plainCase: "cabinet",
  plainBox: "box",
};

/** The tab a piece is found under. */
export function tabOf(piece: PieceId): GalleryTab {
  return BLANKS.some((b) => b.id === piece) ? "blank" : "templates";
}

/**
 * One piece's tile, pressed when it is the piece chosen. A piece that comes later stays pressable
 * (so it can say so) but is marked unavailable.
 */
function PieceTile({
  piece,
  chosen,
  onPress,
}: {
  piece: Piece;
  chosen: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="template-tile piece-tile"
      aria-pressed={piece.later ? undefined : chosen}
      aria-disabled={piece.later || undefined}
      onClick={onPress}
    >
      <span className="tile-picture">
        <Drawing name={DRAWINGS[piece.id]} />
      </span>
      <span className="tile-text">
        <span className="tile-name">
          {piece.name}
          {piece.later && (
            <>
              {" "}
              <LaterBadge />
            </>
          )}
        </span>{" "}
        <span className="tile-blurb">{piece.blurb}</span>
      </span>
    </button>
  );
}

/** Open file: a .kerf file chosen here is added as a new project and opens. */
function OpenFile() {
  const store = useKerfStore();
  const chooser = useRef<HTMLInputElement>(null);
  return (
    <div className="open-file">
      <span className="open-file-art">
        <Drawing name="blank" />
      </span>
      <p>
        <b>Open a .kerf file</b>A project saved from Kerf, yours or someone else's. It is added to
        your projects and opens; the file itself is not changed.
      </p>
      <button type="button" className="primary" onClick={() => chooser.current?.click()}>
        Choose a file…
      </button>
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
  );
}

/**
 * The gallery: its tabs and what the open one holds. `chosen` is the piece the settings show;
 * `onPick` chooses a piece that can be built; `onLater` is told of a press on one that comes later,
 * and `later` is what to say about it.
 */
export function PieceGallery({
  tab,
  setTab,
  chosen,
  onPick,
  onLater,
  later,
}: {
  tab: GalleryTab;
  setTab: (tab: GalleryTab) => void;
  chosen: PieceId;
  onPick: (piece: PieceId) => void;
  onLater: (piece: PieceId) => void;
  later: string | null;
}) {
  const ids = useId();
  const tabId = (t: GalleryTab) => `${ids}-${t}`;
  const tiles = (pieces: readonly Piece[]) => (
    <div className="piece-tiles">
      {pieces.map((piece) => (
        <PieceTile
          key={piece.id}
          piece={piece}
          chosen={piece.id === chosen}
          onPress={() => (piece.later ? onLater(piece.id) : onPick(piece.id))}
        />
      ))}
    </div>
  );
  return (
    <>
      <div role="tablist" aria-label="Start from" className="tabs new-project-tabs">
        {TABS.map(({ tab: t, label }) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={tabId(t)}
            aria-selected={t === tab}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={false} aria-disabled="true" disabled>
          Inspiration <LaterBadge />
        </button>
      </div>
      <div role="tabpanel" aria-labelledby={tabId(tab)} className="new-project-tab">
        {tab === "templates" && tiles(PIECES)}
        {tab === "blank" && tiles(BLANKS)}
        {tab === "file" && <OpenFile />}
        {tab === "templates" && (
          <p className="new-project-later" aria-live="polite">
            {later}
          </p>
        )}
      </div>
    </>
  );
}
