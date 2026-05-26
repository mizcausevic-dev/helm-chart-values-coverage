import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { check, declaredPathsOf, findValueRefs } from "../src/check.js";
import { toMarkdown, toSummary } from "../src/format.js";
import type { CoverageReport } from "../src/types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const cleanChart = `${here}/../fixtures/sample-chart`;
const gappyChart = `${here}/../fixtures/sample-chart-with-gaps`;
const NOW = "2026-05-27T08:00:00Z";

describe("findValueRefs", () => {
  it("captures dotted .Values paths with line numbers", () => {
    const refs = findValueRefs(`a: {{ .Values.image.tag }}\nb: {{ .Values.replicaCount }}\n`, "x.yaml");
    expect(refs.map((r) => r.path).sort()).toEqual(["image.tag", "replicaCount"]);
    expect(refs.find((r) => r.path === "image.tag")?.source).toBe("x.yaml:1");
  });

  it("captures multiple refs on one line", () => {
    const refs = findValueRefs(`{{ .Values.foo }} {{ .Values.bar.baz }}`, "x.yaml");
    expect(refs.map((r) => r.path).sort()).toEqual(["bar.baz", "foo"]);
  });

  it("ignores .Values without a key", () => {
    expect(findValueRefs(`{{ .Values }}`, "x.yaml")).toEqual([]);
  });
});

describe("declaredPathsOf", () => {
  it("flattens nested objects into dotted keys", () => {
    expect(declaredPathsOf({ image: { repo: "x", tag: "1.0" }, replicas: 3 }).sort()).toEqual([
      "image.repo",
      "image.tag",
      "replicas"
    ]);
  });
  it("treats arrays as leaves", () => {
    expect(declaredPathsOf({ x: [1, 2, 3] })).toEqual(["x"]);
  });
  it("treats null as a leaf at its key", () => {
    expect(declaredPathsOf({ x: null })).toEqual(["x"]);
  });
  it("returns [] when called with a primitive", () => {
    expect(declaredPathsOf("x" as unknown as object)).toEqual([]);
  });
});

describe("check (clean chart)", () => {
  it("produces no missing-default findings when every ref has a default", () => {
    const r = check(cleanChart, { now: NOW });
    expect(r.missing).toEqual([]);
  });

  it("declared / referenced paths populate correctly", () => {
    const r = check(cleanChart, { now: NOW });
    expect(r.referencedPaths).toContain("image.repository");
    expect(r.referencedPaths).toContain("service.port");
    expect(r.declaredPaths).toContain("image.repository");
  });

  it("ok=true when no high findings", () => {
    const r = check(cleanChart, { now: NOW });
    expect(r.ok).toBe(true);
  });
});

describe("check (gappy chart)", () => {
  it("flags missing-default for image.tag, image.pullPolicy, service.url", () => {
    const r = check(gappyChart, { now: NOW });
    expect(r.missing).toContain("image.tag");
    expect(r.missing).toContain("image.pullPolicy");
    expect(r.missing).toContain("service.url");
    for (const f of r.findings.filter((x) => x.code === "missing-default")) {
      expect(f.severity).toBe("high");
    }
  });

  it("flags unused-default for legacyKey", () => {
    const r = check(gappyChart, { now: NOW });
    expect(r.unused).toContain("legacyKey");
    const f = r.findings.find((x) => x.code === "unused-default" && x.subject === "legacyKey");
    expect(f?.severity).toBe("low");
  });

  it("ok=false when missing-default present", () => {
    expect(check(gappyChart, { now: NOW }).ok).toBe(false);
  });

  it("populates missingSites with source:line", () => {
    const r = check(gappyChart, { now: NOW });
    const sites = r.missingSites.filter((s) => s.path === "image.tag");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0].source).toMatch(/^templates\/deployment\.yaml:\d+$/);
  });

  it("respects --ignore-missing-prefixes", () => {
    const r = check(gappyChart, { now: NOW, ignoreMissingPrefixes: ["service"] });
    expect(r.missing).not.toContain("service.url");
  });

  it("respects --ignore-unused-prefixes", () => {
    const r = check(gappyChart, { now: NOW, ignoreUnusedPrefixes: ["legacyKey"] });
    expect(r.unused).not.toContain("legacyKey");
  });
});

describe("check (missing values.yaml / templates)", () => {
  it("returns missing-values-yaml when values.yaml absent", () => {
    const r = check(`${here}/../fixtures/non-existent-chart`, { now: NOW });
    expect(r.findings.some((f) => f.code === "missing-values-yaml")).toBe(true);
    expect(r.findings.some((f) => f.code === "missing-templates")).toBe(true);
    expect(r.ok).toBe(false);
  });
});

describe("formatters", () => {
  it("toMarkdown renders ❌ + missing/unused sections on gappy chart", () => {
    const r = check(gappyChart, { now: NOW });
    const md = toMarkdown(r);
    expect(md).toContain("❌");
    expect(md).toContain("Missing defaults");
    expect(md).toContain("Unused defaults");
    expect(md).toContain("image.tag");
  });

  it("toMarkdown renders ✅ + 'No coverage issues.' on clean chart", () => {
    const r: CoverageReport = check(cleanChart, { now: NOW });
    const md = toMarkdown(r);
    expect(md).toContain("✅");
    expect(md).toContain("No coverage issues.");
  });

  it("toSummary emits a one-liner", () => {
    const s = toSummary(check(gappyChart, { now: NOW }));
    expect(s).toMatch(/templates/);
    expect(s).toMatch(/missing/);
  });
});
