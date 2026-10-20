// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Your shop, the pegboard (design spec, §1; ADR 016, D3): the first screen at first launch and reached
// later from Home or Settings, and left for the screen it was reached from. The wall is a draft
// until "That's my shop" saves it; "Skip for now" keeps the starter shop and Kerf asks about a tool
// only when a project needs it.

import { useState } from "react";
import { hungCount, recordOf, wallFrom } from "../../model/pegboard";
import type { ShopRecord } from "../../model/shop-record";
import { useKerf, useKerfStore } from "../../state/useKerf";
import { Notice } from "../Notice";
import { Pegboard } from "./Pegboard";

/** The Your shop screen: the pegboard, then a bar with the count and the two ways to leave. */
export function YourShop() {
  const store = useKerfStore();
  const saved = useKerf((s) => s.shopRecord);
  const units = useKerf((s) => s.unitsForNew);
  const [wall, setWall] = useState(() => wallFrom(saved));
  const count = hungCount(wall);

  const keep = (record: ShopRecord): void => {
    store.getState().setShopRecord(record);
    store.getState().leaveShop();
  };

  return (
    <div className="shop-screen">
      <header className="topbar">
        <span className="brand">Kerf</span>
      </header>
      <Notice />
      <main className="shop-page">
        <div className="shop-content">
          <h1>Hang up your tools.</h1>
          <p className="lede">
            Tap everything in your shop. Kerf plans joints and cuts around what you've got, and asks
            about the rest only when a project needs it.
          </p>
          <Pegboard wall={wall} units={units} change={setWall} />
        </div>
      </main>
      <footer className="shop-bar">
        <p className="shop-count">
          <b>{count}</b> {count === 1 ? "thing" : "things"} on your wall
        </p>
        {saved.setUp ? (
          // A shop already set up is never put back to the starter shop by leaving.
          <button type="button" className="quiet" onClick={() => store.getState().leaveShop()}>
            Cancel
          </button>
        ) : (
          <button type="button" className="quiet" onClick={() => keep({ ...saved, setUp: false })}>
            Skip for now
          </button>
        )}
        <button type="button" className="primary" onClick={() => keep(recordOf(wall, true))}>
          That's my shop
        </button>
      </footer>
    </div>
  );
}
