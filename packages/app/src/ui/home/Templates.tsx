// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Home's Templates (design spec §2): tiles for Bookcase, Cabinet and Box, which open New project
// with that piece chosen, and Table and Dresser, marked Later, whose tips say they are coming.

import { PIECES, type Piece, type PieceId } from "../../model/new-project";
import { Drawing, type DrawingName } from "../art/drawings";
import { Tip, type TipText } from "../Tip";
import { TIPS } from "../tips";

/** The pieces shown as tiles, with their drawings; "Something else" is New project's alone. */
const TILE_ART: Partial<Record<PieceId, { drawing: DrawingName; tip?: TipText }>> = {
  bookcase: { drawing: "bookcase" },
  cabinet: { drawing: "cabinet" },
  box: { drawing: "box" },
  table: { drawing: "table", tip: TIPS.table },
  dresser: { drawing: "dresser", tip: TIPS.dresser },
};

const TILES = PIECES.flatMap((piece) => {
  const art = TILE_ART[piece.id];
  return art ? [{ piece, ...art }] : [];
});

/** The "Later" mark on what Kerf cannot do yet. */
export function LaterBadge() {
  return <span className="later-badge">Later</span>;
}

/** One tile; a piece that is not built yet cannot be pressed. */
function Tile({
  piece,
  drawing,
  onPick,
}: {
  piece: Piece;
  drawing: DrawingName;
  onPick?: () => void;
}) {
  return (
    <button type="button" className="template-tile" disabled={piece.later} onClick={onPick}>
      <span className="tile-picture">
        <Drawing name={drawing} />
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

/** The template tiles; `onPick` gets the piece of a working tile pressed. */
export function Templates({ onPick }: { onPick: (piece: PieceId) => void }) {
  return (
    <div className="template-tiles">
      {TILES.map(({ piece, drawing, tip }) =>
        tip ? (
          // A disabled button gets no pointer events, so its tip hangs on the span around it.
          <Tip key={piece.id} tip={tip}>
            <span className="tip-anchor">
              <Tile piece={piece} drawing={drawing} />
            </span>
          </Tip>
        ) : (
          <Tile key={piece.id} piece={piece} drawing={drawing} onPick={() => onPick(piece.id)} />
        ),
      )}
    </div>
  );
}
