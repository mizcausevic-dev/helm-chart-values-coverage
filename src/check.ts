import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { parse } from "yaml";

import type { CoverageOptions, CoverageReport, Finding, ValueRefSite } from "./types.js";

/** Matches `{{ ... .Values.foo.bar.baz ... }}` and captures `foo.bar.baz`. */
const REF_REGEX = /\.Values\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/g;

export function findValueRefs(text: string, source: string): ValueRefSite[] {
  const out: ValueRefSite[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    REF_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_REGEX.exec(line)) !== null) {
      out.push({ source: `${source}:${idx + 1}`, path: m[1] });
    }
  });
  return out;
}

/** List leaf paths in a parsed values.yaml tree (returns dotted keys). */
export function declaredPathsOf(values: unknown, prefix = ""): string[] {
  if (values === null || values === undefined) return prefix ? [prefix] : [];
  if (typeof values !== "object" || Array.isArray(values)) return prefix ? [prefix] : [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    const child = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0) {
      out.push(...declaredPathsOf(v, child));
    } else {
      out.push(child);
    }
  }
  return out;
}

/** True when `path` is a prefix of `decl` or vice versa (parent / child match). */
function pathCovered(path: string, declared: Set<string>): boolean {
  if (declared.has(path)) return true;
  // A declared parent like "image" satisfies a reference to "image.repository".
  for (const d of declared) {
    if (path.startsWith(`${d}.`)) return true;
    if (d.startsWith(`${path}.`)) return true;
  }
  return false;
}

function listTemplateFiles(root: string, skip: string[] = []): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (skip.some((s) => full.includes(s))) continue;
      if (st.isDirectory()) visit(full);
      else if (/\.(ya?ml|tpl)$/i.test(entry)) out.push(full);
    }
  };
  visit(root);
  return out.sort();
}

export function check(chartRoot: string, opts: CoverageOptions = {}): CoverageReport {
  const generatedAt = opts.now ?? new Date().toISOString();
  const valuesPath = join(chartRoot, "values.yaml");
  const templatesDir = join(chartRoot, "templates");
  const findings: Finding[] = [];
  let declaredPaths: string[] = [];

  if (!existsSync(valuesPath)) {
    findings.push({
      code: "missing-values-yaml",
      severity: "high",
      message: `Chart has no values.yaml at ${relative(chartRoot, valuesPath) || valuesPath}.`,
      subject: valuesPath
    });
  } else {
    const valuesTree = parse(readFileSync(valuesPath, "utf8")) as unknown;
    declaredPaths = declaredPathsOf(valuesTree).sort();
  }

  if (!existsSync(templatesDir)) {
    findings.push({
      code: "missing-templates",
      severity: "high",
      message: `Chart has no templates/ directory at ${relative(chartRoot, templatesDir) || templatesDir}.`,
      subject: templatesDir
    });
  }

  const refSites: ValueRefSite[] = [];
  const templates = listTemplateFiles(templatesDir, opts.skip);
  for (const f of templates) {
    const rel = "templates" + sep + relative(templatesDir, f);
    const sites = findValueRefs(readFileSync(f, "utf8"), rel.replace(/\\/g, "/"));
    refSites.push(...sites);
  }

  const referencedPaths = [...new Set(refSites.map((s) => s.path))].sort();
  const declaredSet = new Set(declaredPaths);

  const missingPrefixes = opts.ignoreMissingPrefixes ?? [];
  const unusedPrefixes = opts.ignoreUnusedPrefixes ?? [];

  const missing: string[] = [];
  const missingSites: ValueRefSite[] = [];
  for (const path of referencedPaths) {
    if (missingPrefixes.some((p) => path === p || path.startsWith(`${p}.`))) continue;
    if (!pathCovered(path, declaredSet)) {
      missing.push(path);
      for (const s of refSites) if (s.path === path) missingSites.push(s);
      findings.push({
        code: "missing-default",
        severity: "high",
        message: `.Values.${path} is referenced in templates/ but has no default in values.yaml.`,
        subject: path
      });
    }
  }

  const referencedSet = new Set(referencedPaths);
  const unused: string[] = [];
  for (const decl of declaredPaths) {
    if (unusedPrefixes.some((p) => decl === p || decl.startsWith(`${p}.`))) continue;
    // Declared is unused when no reference equals it or starts with `decl.`.
    const used = referencedSet.has(decl) || [...referencedSet].some((r) => r.startsWith(`${decl}.`));
    if (!used) {
      unused.push(decl);
      findings.push({
        code: "unused-default",
        severity: "low",
        message: `values.yaml declares "${decl}" but no template references it.`,
        subject: decl
      });
    }
  }

  return {
    generatedAt,
    chartRoot,
    templates: templates.length,
    referencedPaths,
    declaredPaths,
    missing,
    unused,
    missingSites,
    findings,
    ok: !findings.some((f) => f.severity === "high")
  };
}
