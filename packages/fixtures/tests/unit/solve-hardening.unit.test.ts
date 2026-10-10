// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// solveModel (pipeline steps 1-3): diagnostics, limits and exact expected values.
// Expected numbers are hand calculations from the spec; see the comments.

import { INCH, type Instance, MM, type Param, type Project, solveModel } from "@kerf/core";
import { describe, expect } from "vitest";
import { loadProject, withParam } from "../../src/index";
import { milestone } from "../../src/milestone";

/** Narrows a value that a test fixture is known to provide. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("fixture value is missing");
  return value;
}

const uid = (n: number): string =>
  `01K7M3Q8ZD00000000F1${n.toString(16).toUpperCase().padStart(6, "0")}`;
const bookcase = loadProject("bookcase");
const rules = (p: Project) => solveModel(p).diagnostics.map((d) => d.rule);
const errorRules = (p: Project) =>
  solveModel(p)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.rule);

function withExtraParams(
  project: Project,
  ...extra: Array<[string, string, Param["kind"]]>
): Project {
  return {
    ...project,
    params: [
      ...project.params,
      ...extra.map(([name, expr, kind], i) => ({ id: uid(900 + i), name, expr, kind })),
    ],
  };
}

function withPartField(
  project: Project,
  partName: string,
  field: "length" | "width" | "thickness",
  expr: string,
): Project {
  return {
    ...project,
    parts: project.parts.map((p) => (p.name === partName ? { ...p, [field]: expr } : p)),
  };
}

/** One 18 mm panel, optionally repeated by a pattern. */
function panelProject(
  options: {
    units?: "imperial" | "metric";
    pattern?: Project["patterns"][number]["spacing"];
    axis?: "x" | "y" | "z";
    count?: string;
    position?: Instance["position"];
    params?: Param[];
  } = {},
): Project {
  const stock = uid(1);
  const def = uid(2);
  const instance = uid(3);
  return {
    schemaVersion: 1,
    name: "Panel",
    units: options.units ?? "metric",
    params: options.params ?? [{ id: uid(4), name: "width", expr: "600mm", kind: "length" }],
    stock: [
      {
        id: stock,
        name: "18 ply",
        kind: "sheet",
        thickness: 18 * MM,
        sheet: { length: 2440 * MM, width: 1220 * MM, grain: "along-length" },
        allowance: { length: 0, width: 0 },
      },
    ],
    parts: [
      {
        id: def,
        name: "Panel",
        stock,
        length: 'width - 2*stock["18 ply"].thickness',
        width: "300mm",
        grainLocked: true,
        ops: [],
      },
    ],
    instances: [
      {
        id: instance,
        def,
        name: "Panel",
        position: options.position ?? { x: "0mm", y: "0mm", z: "0mm" },
        orientation: 0,
        mirrored: false,
      },
    ],
    patterns: options.pattern
      ? [
          {
            id: uid(5),
            source: instance,
            count: options.count ?? "4",
            axis: options.axis ?? "z",
            spacing: options.pattern,
          },
        ]
      : [],
    joints: [],
    matchSets: [],
    structures: [],
  };
}

describe("exact carry-through: snap once, at the end of each field", () => {
  milestone(
    "M1",
    "1in/3 then ×3 is exactly 1in; the first field still shows a snapped value",
    () => {
      const p = withExtraParams(bookcase, ["w1", "1in / 3", "length"], ["w3", "w1 * 3", "length"]);
      const { params } = solveModel(p);
      expect(params.w1?.value).toEqual({ num: 66675n, den: 1n }); // 1/3" on the 1/64" grid: 21 steps
      expect(params.w3?.value).toEqual({ num: 203200n, den: 1n }); // exactly 1"
    },
  );

  milestone("M1", "metric project: 600mm - 2 × 18mm = 564mm; 1in/3 snaps to 0.01 mm", () => {
    expect(solveModel(panelProject()).parts[0]?.length).toBe(564 * MM);
    const third = withExtraParams(panelProject(), ["third", "1in / 3", "length"]);
    expect(solveModel(third).params.third?.value).toEqual({ num: 67760n, den: 1n });
  });

  milestone("M1", '900mm in an imperial project rounds to the 1/64" grid', () => {
    const p = withExtraParams(bookcase, ["metric_len", "900mm", "length"]);
    expect(solveModel(p).params.metric_len?.value).toEqual({ num: 7200900n, den: 1n });
  });
});

describe("part references and explicit thickness", () => {
  milestone("M1", "side.thickness, shelf.length and an explicit part thickness resolve", () => {
    const p = withExtraParams(
      withPartField(bookcase, "Back", "thickness", "1/2in"),
      ["t2", "side.thickness * 2", "length"],
      ["half", "shelf.length / 2", "length"],
    );
    const model = solveModel(p);
    expect(model.params.t2?.value).toEqual({ num: 292100n, den: 1n }); // 2 × 23/32"
    expect(model.params.half?.value).toEqual({ num: 3511550n, den: 1n }); // 17-9/32"
    expect(model.parts.find((x) => x.name === "Back")?.thickness).toBe(INCH / 2);
  });

  milestone("M1", "an unknown part property is reported on its field", () => {
    const p = withExtraParams(bookcase, ["bad", "side.foo", "length"]);
    const found = solveModel(p).diagnostics.find((d) => d.rule === "unknown-reference");
    expect(found?.field).toBe("bad");
  });
});

describe("positions", () => {
  milestone(
    "M1",
    "4 evenly spaced shelves sit at 14-1/4, 28-33/64, 42-49/64 and 57-1/32 inches",
    () => {
      // Span between the top face of the bottom and the underside of the top:
      // 72 - 2 × 23/32 = 70-9/16". Gap = (70-9/16 - 4 × 23/32) / 5 = 13.5375". Each position
      // snaps once to 1/64".
      const z = solveModel(bookcase)
        .instances.filter((i) => i.pattern)
        .map((i) => i.position.z);
      expect(z).toEqual([2895600, 5794375, 8689975, 11588750]);
    },
  );

  milestone(
    "M1",
    "a single shelf sits at 35-41/64 inches, and does not move when the width changes",
    () => {
      const one = withParam(bookcase, "shelf_count", "1");
      const shelf = (p: Project) => solveModel(p).instances.find((i) => i.pattern)?.position.z;
      expect(shelf(one)).toBe(7242175);
      expect(shelf(withParam(one, "width", "30in"))).toBe(7242175);
    },
  );

  milestone("M1", "other instances land where their expressions say", () => {
    const at = (name: string) => solveModel(bookcase).instances.find((i) => i.name === name);
    expect(at("Top")?.position.z).toBe(14630400 - 146050); // 72" - 23/32"
    expect(at("Back")?.position).toMatchObject({ x: 146050 - 76200, y: 2438400 - 50800 });
    expect(at("Left side")?.position.x).toBe(36 * INCH - 146050);
  });

  milestone(
    "M1",
    "instances come back in project order, pattern members in place of the source",
    () => {
      const names = solveModel(bookcase).instances.map((i) => i.name);
      expect(names).toEqual([
        "Right side",
        "Left side",
        "Top",
        "Bottom",
        "Shelf 1",
        "Shelf 2",
        "Shelf 3",
        "Shelf 4",
        "Back",
      ]);
      const ids = solveModel(bookcase).instances.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  milestone("M1", "a mirrored instance has the same extent as an unmirrored one", () => {
    const { instances } = solveModel(bookcase);
    const right = instances.find((i) => i.name === "Right side");
    const left = instances.find((i) => i.name === "Left side");
    expect(left?.extent).toEqual(right?.extent);
  });

  milestone("M1", "fixed pattern: members step along the axis from the source position", () => {
    const p = panelProject({
      units: "imperial",
      pattern: { mode: "fixed", step: "10in" },
      position: { x: "0mm", y: "0mm", z: "23/32in" },
      count: "4",
    });
    const members = solveModel(p).instances;
    expect(members.map((m) => m.position.z)).toEqual([146050, 2178050, 4210050, 6242050]);
    expect(members.map((m) => m.id)).toEqual([0, 1, 2, 3].map((i) => `${uid(5)}:${i}`));
    expect(members.map((m) => m.name)).toEqual(["Panel 1", "Panel 2", "Panel 3", "Panel 4"]);
  });

  milestone("M1", "patterns can run along x and y", () => {
    for (const axis of ["x", "y"] as const) {
      const p = panelProject({ pattern: { mode: "fixed", step: "1000mm" }, axis, count: "3" });
      const values = solveModel(p).instances.map((m) => m.position[axis]);
      expect(values).toEqual([0, 1000 * MM, 2000 * MM]);
    }
  });

  milestone("M1", "solving does not modify the project", () => {
    const before = JSON.stringify(bookcase);
    solveModel(bookcase);
    expect(JSON.stringify(bookcase)).toBe(before);
  });
});

describe("assembled envelope", () => {
  const envelope = (p: Project) => {
    const max = { x: 0, y: 0, z: 0 };
    const min = {
      x: Number.POSITIVE_INFINITY,
      y: Number.POSITIVE_INFINITY,
      z: Number.POSITIVE_INFINITY,
    };
    for (const i of solveModel(p).instances) {
      for (const a of ["x", "y", "z"] as const) {
        min[a] = Math.min(min[a], i.position[a]);
        max[a] = Math.max(max[a], i.position[a] + i.extent[a]);
      }
    }
    return { min, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
  };

  milestone("M1", "bookcase assembles to 36 x 12 x 72 inches from the origin", () => {
    expect(envelope(bookcase)).toEqual({
      min: { x: 0, y: 0, z: 0 },
      size: { x: 36 * INCH, y: 12 * INCH, z: 72 * INCH },
    });
  });

  milestone("M1", "resized to 30 inches wide it is 30 x 12 x 72", () => {
    expect(envelope(withParam(bookcase, "width", "30in")).size).toEqual({
      x: 30 * INCH,
      y: 12 * INCH,
      z: 72 * INCH,
    });
  });

  milestone("M1", "keepsake box assembles to 10 x 6 x 4 inches from the origin", () => {
    expect(envelope(loadProject("box"))).toEqual({
      min: { x: 0, y: 0, z: 0 },
      size: { x: 10 * INCH, y: 6 * INCH, z: 4 * INCH },
    });
  });
});

describe("geometry the model must refuse", () => {
  milestone("M1", "zero, negative and snapped-to-zero part sizes are errors", () => {
    for (const bad of ["0in", "-5in", "1/200in"]) {
      const p = withParam(bookcase, "depth", bad);
      expect(rules(p)).toContain("invalid-dimension");
    }
  });

  milestone("M1", "a part with an invalid size is not emitted, and says why", () => {
    const model = solveModel(withParam(bookcase, "depth", "0in"));
    expect(model.parts.find((p) => p.name === "Side")).toBeUndefined();
    expect(model.diagnostics.find((d) => d.rule === "invalid-dimension")?.severity).toBe("error");
  });

  milestone("M1", "a pattern step of zero or less is an error", () => {
    for (const step of ["0mm", "-10mm"]) {
      expect(errorRules(panelProject({ pattern: { mode: "fixed", step } }))).toContain(
        "invalid-pattern",
      );
    }
  });

  milestone("M1", "members that cannot fit in their span are an error (pattern-overlap)", () => {
    expect(errorRules(withParam(bookcase, "shelf_count", "100"))).toContain("pattern-overlap");
    const reversed = panelProject({ pattern: { mode: "distribute", from: "500mm", to: "100mm" } });
    expect(errorRules(reversed)).toContain("pattern-overlap");
  });
});

describe("names, ids and references", () => {
  milestone("M1", "duplicate parameter, part (by slug) and stock names are errors", () => {
    const dupParam = {
      ...bookcase,
      params: [...bookcase.params, { ...must(bookcase.params[0]), id: uid(950) }],
    };
    expect(rules(dupParam)).toContain("duplicate-name");

    const dupPart = {
      ...bookcase,
      parts: bookcase.parts.map((p) => (p.name === "Top" ? { ...p, name: "side" } : p)),
    };
    expect(rules(dupPart)).toContain("duplicate-name");

    const dupStock = {
      ...bookcase,
      stock: bookcase.stock.map((s) => ({ ...s, name: "3/4 plywood" })),
    };
    expect(rules(dupStock)).toContain("duplicate-name");
  });

  milestone("M1", "reserved and non-identifier parameter names are rejected", () => {
    for (const name of ["min", "stock", "my-width", "__proto__"]) {
      const p = {
        ...bookcase,
        params: [...bookcase.params, { id: uid(951), name, expr: "1in", kind: "length" as const }],
      };
      expect(rules(p)).toContain("invalid-name");
    }
  });

  milestone(
    "M1",
    "a part name with no letters or digits is an invalid name, not a duplicate",
    () => {
      const p = {
        ...bookcase,
        parts: bookcase.parts.map((x) => (x.name === "Top" ? { ...x, name: "!!!" } : x)),
      };
      expect(rules(p)).toContain("invalid-name");
      expect(rules(p)).not.toContain("duplicate-name");
    },
  );

  milestone("M1", "repeated ids and dangling references make the whole project invalid", () => {
    const dupId = {
      ...bookcase,
      instances: [...bookcase.instances, { ...must(bookcase.instances[0]) }],
    };
    const noStock = {
      ...bookcase,
      parts: bookcase.parts.map((p, i) => (i === 0 ? { ...p, stock: uid(990) } : p)),
    };
    const noDef = {
      ...bookcase,
      instances: bookcase.instances.map((x, i) => (i === 0 ? { ...x, def: uid(991) } : x)),
    };
    const noSource = {
      ...bookcase,
      patterns: bookcase.patterns.map((x) => ({ ...x, source: uid(992) })),
    };
    for (const bad of [dupId, noStock, noDef, noSource]) {
      const model = solveModel(bad);
      expect(model.diagnostics.map((d) => d.rule)).toEqual(["invalid-project"]);
      expect(model.parts).toEqual([]);
      expect(model.instances).toEqual([]);
    }
  });

  milestone("M1", "a project that is not even the right shape is invalid, not a crash", () => {
    const fractional = {
      ...bookcase,
      stock: bookcase.stock.map((s) => ({ ...s, thickness: 1.5 })),
    };
    expect(rules(fractional)).toEqual(["invalid-project"]);
    const badAxis = { ...bookcase, patterns: bookcase.patterns.map((p) => ({ ...p, axis: "w" })) };
    expect(rules(badAxis as unknown as Project)).toEqual(["invalid-project"]);
  });

  milestone("M1", "two patterns on one instance are an error", () => {
    const base = panelProject({ pattern: { mode: "fixed", step: "10mm" } });
    const doubled = {
      ...base,
      patterns: [...base.patterns, { ...must(base.patterns[0]), id: uid(960) }],
    };
    expect(rules(doubled)).toContain("duplicate-pattern");
  });

  milestone("M1", "a pattern count of 0 is invalid; a non-whole count is a type mismatch", () => {
    expect(rules(withParam(bookcase, "shelf_count", "0"))).toContain("invalid-count");
    expect(rules(withParam(bookcase, "shelf_count", "7/2"))).toContain("type-mismatch");
    expect(rules(withParam(bookcase, "shelf_count", "4in"))).toContain("type-mismatch");
  });

  milestone("M1", "an instance's parent is not applied, and the solver says so", () => {
    const parented = {
      ...bookcase,
      instances: bookcase.instances.map((x, i) =>
        i === 2 ? { ...x, parent: must(bookcase.instances[0]).id } : x,
      ),
    };
    const found = solveModel(parented).diagnostics.find((d) => d.rule === "not-solved-yet");
    expect(found?.severity).toBe("warning");
  });
});

describe("expression problems become diagnostics on the field", () => {
  milestone(
    "M1",
    "division by zero, bad syntax and unknown stock are errors on their field",
    () => {
      const zero = withParam(bookcase, "depth", "12in / 0");
      expect(solveModel(zero).diagnostics.find((d) => d.field === "depth")).toBeDefined();
      const syntax = withPartField(bookcase, "Back", "length", "1in +");
      const model = solveModel(syntax);
      expect(model.diagnostics.map((d) => d.rule)).toContain("expression-syntax");
      expect(model.instances).toHaveLength(8); // only the Back instance is dropped
      expect(rules(withPartField(bookcase, "Back", "length", 'stock["nope"].thickness'))).toContain(
        "unknown-reference",
      );
    },
  );

  milestone("M1", "a bad roundover radius is reported (it is evaluated, not skipped)", () => {
    const p = {
      ...bookcase,
      parts: bookcase.parts.map((x) =>
        x.name === "Shelf" ? { ...x, ops: x.ops.map((o) => ({ ...o, radius: "wdith" })) } : x,
      ),
    };
    const found = solveModel(p).diagnostics.find((d) => d.rule === "unknown-reference");
    expect(found?.field).toBe("Shelf roundover radius");
  });
});

describe("cycles", () => {
  const cycleRules = (p: Project) =>
    solveModel(p).diagnostics.filter((d) => d.rule === "parameter-cycle");

  milestone("M1", "a parameter referring to itself is named once, in the singular", () => {
    const [d] = cycleRules(withParam(bookcase, "width", "width + 1in"));
    expect(d?.severity).toBe("error");
    expect(d?.message).toContain('"width" refers to itself');
  });

  milestone(
    "M1",
    "three-member cycle names all three; a tail that leads into it is not named",
    () => {
      const p = withExtraParams(
        bookcase,
        ["a", "b + 1in", "length"],
        ["b", "c + 1in", "length"],
        ["c", "d + 1in", "length"],
        ["d", "b + 1in", "length"],
      );
      const [d, ...rest] = cycleRules(p);
      expect(rest).toEqual([]);
      for (const n of ["b", "c", "d"]) expect(d?.message).toContain(`"${n}"`);
      expect(d?.message).not.toContain('"a"');
    },
  );

  milestone("M1", "two separate cycles are reported separately", () => {
    const p = withExtraParams(
      bookcase,
      ["p1", "p2", "length"],
      ["p2", "p1", "length"],
      ["q1", "q2", "length"],
      ["q2", "q1", "length"],
    );
    expect(cycleRules(p)).toHaveLength(2);
  });

  milestone("M1", "a cycle through part properties is found", () => {
    const p = withPartField(
      withPartField(bookcase, "Side", "length", "top.length"),
      "Top",
      "length",
      "side.length",
    );
    expect(cycleRules(p)).toHaveLength(1);
  });

  milestone(
    "M1",
    "a cycle removes everything that depends on it and nothing else, with one diagnostic",
    () => {
      const p = withParam(withParam(bookcase, "width", "height + 1in"), "height", "width - 1in");
      const model = solveModel(p);
      expect(model.diagnostics).toHaveLength(1);
      expect(model.diagnostics[0]?.rule).toBe("parameter-cycle");
      expect(model.parts).toEqual([]);
      expect(model.instances).toEqual([]);
      expect(Object.keys(model.params).sort()).toEqual(
        [
          "depth",
          "rabbet_depth",
          "back_rabbet_depth",
          "dado_depth",
          "roundover_radius",
          "shelf_count",
        ].sort(),
      );
    },
  );
});

describe("hostile input is answered with diagnostics, never an exception", () => {
  milestone("M1", "huge lengths, counts and nesting", () => {
    const cases: Array<[string, string]> = [
      ["width", "99999999999999999999999in"],
      ["shelf_count", "99999999999999999999"],
      ["shelf_count", "20000"],
      ["shelf_count", "5000000"],
      ["width", `${"(".repeat(5000)}1in${")".repeat(5000)}`],
      ["width", Array(5000).fill("1in").join("+")],
      ["width", "constructor"],
      ["shelf_count", "toString"],
    ];
    for (const [name, expr] of cases) {
      const model = solveModel(withParam(bookcase, name, expr));
      expect(model.diagnostics.some((d) => d.severity === "error")).toBe(true);
    }
  });

  milestone("M1", "an instance position that names an object-prototype property", () => {
    const p = {
      ...bookcase,
      instances: bookcase.instances.map((x, i) =>
        i === 0 ? { ...x, position: { ...x.position, x: "-constructor" } } : x,
      ),
    };
    expect(rules(p)).toContain("unknown-reference");
  });
});
