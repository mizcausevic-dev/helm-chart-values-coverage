#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { check } from "./check.js";
import { toMarkdown, toSummary } from "./format.js";

type Format = "json" | "markdown" | "summary";

interface Args {
  chartRoot?: string;
  format: Format;
  ignoreMissing: string[];
  ignoreUnused: string[];
  skip: string[];
  failOnHigh: boolean;
  failOnUnused: boolean;
  out?: string;
  help: boolean;
}

const FORMATS: Format[] = ["json", "markdown", "summary"];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    format: "json",
    ignoreMissing: [],
    ignoreUnused: [],
    skip: [],
    failOnHigh: false,
    failOnUnused: false,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--format") {
      const v = argv[++i] as Format;
      if (!FORMATS.includes(v)) throw new Error(`--format must be one of: ${FORMATS.join(", ")}`);
      args.format = v;
    } else if (a === "--ignore-missing-prefixes") {
      args.ignoreMissing = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--ignore-unused-prefixes") {
      args.ignoreUnused = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--skip") {
      const v = argv[++i];
      if (v) args.skip.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a === "--fail-on-high") args.failOnHigh = true;
    else if (a === "--fail-on-unused") args.failOnUnused = true;
    else if (a === "--out") args.out = argv[++i];
    else if (!a.startsWith("-")) args.chartRoot = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

const HELP = `helm-chart-values-coverage — cross-reference {{ .Values.* }} usage against values.yaml

Usage:
  helm-chart-values-coverage <chart-root>
      [--format json|markdown|summary]
      [--ignore-missing-prefixes prefix,prefix]
      [--ignore-unused-prefixes prefix,prefix]
      [--skip path-substring,path-substring]
      [--fail-on-high] [--fail-on-unused]
      [--out FILE]

Scans <chart-root>/templates/**/* for every \`{{ .Values.foo.bar }}\` reference
and cross-references it against the dotted keys in <chart-root>/values.yaml.

Findings:
  - missing-default (high)        Referenced in templates, no default in values.yaml
  - unused-default (low)          Declared in values.yaml, never referenced
  - missing-values-yaml (high)
  - missing-templates (high)

Exit codes:
  0 — no high findings (or --fail-on-high not set), no unused (or --fail-on-unused not set)
  1 — high finding AND --fail-on-high, OR any unused AND --fail-on-unused
  2 — usage / I/O error`;

export function run(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help || !args.chartRoot) {
    process.stdout.write(`${HELP}\n`);
    return args.help ? 0 : 2;
  }

  let report;
  try {
    report = check(args.chartRoot, {
      ignoreMissingPrefixes: args.ignoreMissing,
      ignoreUnusedPrefixes: args.ignoreUnused,
      skip: args.skip
    });
  } catch (e) {
    process.stderr.write(`error checking ${args.chartRoot}: ${(e as Error).message}\n`);
    return 2;
  }

  let out: string;
  if (args.format === "json") out = JSON.stringify(report, null, 2);
  else if (args.format === "markdown") out = toMarkdown(report);
  else out = toSummary(report);

  if (args.out) writeFileSync(args.out, `${out}\n`, "utf8");
  else process.stdout.write(`${out}\n`);

  if (args.failOnHigh && !report.ok) return 1;
  if (args.failOnUnused && report.unused.length > 0) return 1;
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`fatal: ${(e as Error).message}\n`);
    process.exit(2);
  }
}
