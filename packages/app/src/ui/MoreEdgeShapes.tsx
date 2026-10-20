// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The edge shapes the shop cannot use yet (design spec, "Router bits and edge shapes"; ADR 016,
// D7): the common roundovers it has no bit for, greyed with the reason and an offer to add the bit,
// and the shapes the engine cannot cut yet, marked Later.

import { formatLength, type Len, type Project } from "@kerf/core";
import { useState } from "react";
import type { EdgeShapeOffer } from "../model/edge-shapes";
import type { BitShape, RouterBit } from "../model/shop-record";
import { LaterBadge } from "./home/Templates";
import { InlineQuestion } from "./InlineQuestion";
import { Tip } from "./Tip";

const SHAPE_NAMES: Record<BitShape, string> = {
  roundover: "Roundover",
  chamfer: "Chamfer",
  cove: "Cove",
  ogee: "Ogee",
  straight: "Straight",
  rabbeting: "Rabbeting",
};

/**
 * The `noBit` and `later` offers as greyed buttons. Pressing a roundover without a bit asks whether
 * to add it; `onAdd` gets its radius (project units) on Yes. A later shape cannot be pressed; its
 * tip says why; one whose bit is among `bits` (the router card) is shown with its size.
 */
export function MoreEdgeShapes({
  offers,
  units,
  bits,
  onAdd,
}: {
  offers: readonly EdgeShapeOffer[];
  units: Project["units"];
  bits: readonly RouterBit[];
  onAdd: (radius: Len) => void;
}) {
  const [asking, setAsking] = useState<Len | null>(null);
  const [added, setAdded] = useState<Len | null>(null);
  const size = (len: Len) => formatLength(len, units);
  const onWall = (offer: EdgeShapeOffer) =>
    bits.some((b) => b.shape === offer.shape && b.size === offer.size);
  return (
    <>
      <fieldset className="edge-shapes">
        <legend>Other shapes</legend>
        <div className="bit-sizes">
          {offers.map((offer) =>
            offer.state === "noBit" ? (
              <Tip
                key={`${offer.shape}${offer.size}`}
                placement="left"
                besidePanel
                tip={{
                  name: SHAPE_NAMES[offer.shape],
                  text: `Needs a ${size(offer.size)} roundover bit. Add it to your shop?`,
                }}
              >
                {/* The tip shows only on hover or focus, so the reason is in the name too (R26). */}
                <button
                  type="button"
                  className="bit-size no-bit"
                  aria-label={`${size(offer.size)} roundover, not in your shop. Press to add it.`}
                  onClick={() => {
                    setAdded(null);
                    setAsking(offer.size);
                  }}
                >
                  {size(offer.size)} roundover
                </button>
              </Tip>
            ) : offer.state === "later" ? (
              <Tip
                key={`${offer.shape}${offer.size}`}
                placement="left"
                besidePanel
                tip={{
                  name: SHAPE_NAMES[offer.shape],
                  text: `${SHAPE_NAMES[offer.shape]}s are coming later.`,
                }}
              >
                {/* aria-disabled, not disabled: it stays focusable so its tip is reachable (R26). It
                    has no action, so pressing it does nothing. */}
                <button type="button" className="bit-size later" aria-disabled="true">
                  {onWall(offer) ? `${size(offer.size)} ${offer.shape}` : SHAPE_NAMES[offer.shape]}{" "}
                  <LaterBadge />
                </button>
              </Tip>
            ) : null,
          )}
        </div>
      </fieldset>
      {asking !== null && (
        <InlineQuestion
          text={`Add a ${size(asking)} roundover bit to your shop?`}
          answers={[
            {
              label: "Yes, add it",
              onPick: () => {
                onAdd(asking);
                setAdded(asking);
                setAsking(null);
              },
            },
            { label: "No", onPick: () => setAsking(null) },
          ]}
        />
      )}
      {added !== null && (
        <p className="ask-said" role="status">
          Added a {size(added)} roundover bit to your shop.
        </p>
      )}
    </>
  );
}
