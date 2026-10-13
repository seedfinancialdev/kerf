// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The shop checklist (Interaction spec, "4. Joinery from your shop": table saw kerf, dado stack
// max width, router with straight bits and roundover bits, hand tools for dovetails). Every change
// is checked by the engine (`shopProblem`) before it is kept.

import { formatLength, type Len, parseLength, type ShopProfile, shopProblem } from "@kerf/core";
import { NumberField } from "./NumberField";
import { useKerf, useKerfStore } from "./useKerf";

type Tool = ShopProfile["tools"][number];
const IN = 203_200;

/** "1/8\", 1/4\"" → lengths, or the first entry that is not a length. */
function readBits(text: string): Len[] | string {
  const parts = text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  const out: Len[] = [];
  for (const part of parts) {
    try {
      out.push(parseLength(part, "imperial"));
    } catch {
      return `"${part}" is not a bit size; write sizes like 1/4", 1/2".`;
    }
  }
  return out;
}

const showBits = (bits: Len[]): string => bits.map((b) => formatLength(b, "imperial")).join(", ");

export function ShopCard() {
  const store = useKerfStore();
  const shop = useKerf((s) => s.shop);
  const tool = <T extends Tool["type"]>(type: T) =>
    shop.tools.find((t): t is Extract<Tool, { type: T }> => t.type === type);
  const dado = tool("dadoStack");
  const router = tool("router");
  const hand = tool("handTools");

  /** Keeps the shop when the engine accepts it; otherwise returns the engine's reason. */
  const save = (next: ShopProfile): string | null => {
    const problem = shopProblem(next);
    if (problem) return problem.message;
    store.getState().setShop(next);
    return null;
  };
  const withTool = (type: Tool["type"], replacement: Tool | undefined): ShopProfile => ({
    ...shop,
    tools: [...shop.tools.filter((t) => t.type !== type), ...(replacement ? [replacement] : [])],
  });

  return (
    <div className="shop-card">
      <NumberField
        label="Blade kerf"
        display={formatLength(shop.kerf, "imperial")}
        onSubmit={(text) => {
          try {
            return save({ ...shop, kerf: parseLength(text, "imperial") });
          } catch (e) {
            return e instanceof Error ? e.message : "That is not a length.";
          }
        }}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={dado !== undefined}
          onChange={(e) =>
            save(
              withTool(
                "dadoStack",
                e.target.checked ? { type: "dadoStack", maxWidth: (3 * IN) / 4 } : undefined,
              ),
            )
          }
        />
        Dado stack
      </label>
      {dado && (
        <NumberField
          label="Widest dado"
          display={formatLength(dado.maxWidth, "imperial")}
          onSubmit={(text) => {
            try {
              return save(
                withTool("dadoStack", {
                  type: "dadoStack",
                  maxWidth: parseLength(text, "imperial"),
                }),
              );
            } catch (e) {
              return e instanceof Error ? e.message : "That is not a length.";
            }
          }}
        />
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={router !== undefined}
          onChange={(e) =>
            save(
              withTool(
                "router",
                e.target.checked
                  ? { type: "router", straightBits: [], roundoverBits: [] }
                  : undefined,
              ),
            )
          }
        />
        Router
      </label>
      {router && (
        <>
          <NumberField
            label="Straight bits"
            display={showBits(router.straightBits)}
            onSubmit={(text) => {
              const bits = readBits(text);
              return typeof bits === "string"
                ? bits
                : save(withTool("router", { ...router, straightBits: bits }));
            }}
          />
          <NumberField
            label="Roundover bits"
            display={showBits(router.roundoverBits)}
            onSubmit={(text) => {
              const bits = readBits(text);
              return typeof bits === "string"
                ? bits
                : save(withTool("router", { ...router, roundoverBits: bits }));
            }}
          />
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={hand?.dovetails === true}
          onChange={(e) =>
            save(
              withTool(
                "handTools",
                e.target.checked ? { type: "handTools", dovetails: true } : undefined,
              ),
            )
          }
        />
        Dovetails by hand
      </label>
    </div>
  );
}
