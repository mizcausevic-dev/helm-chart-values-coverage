// Coverage checker for Helm charts.
// Cross-references `{{ .Values.* }}` paths used in templates/ against the
// default tree declared in values.yaml.

export interface ValueRefSite {
  /** "templates/<rel>" relative to the chart root, with optional ":<line>". */
  source: string;
  /** "foo.bar.baz" — the dotted key path under `.Values`. */
  path: string;
}

export type FindingSeverity = "high" | "medium" | "low";
export type FindingCode = "missing-default" | "unused-default" | "missing-values-yaml" | "missing-templates";

export interface Finding {
  code: FindingCode;
  severity: FindingSeverity;
  message: string;
  /** A `.Values.foo.bar` dotted path or a file path, depending on the code. */
  subject: string;
  /** Source location for `missing-default`. */
  source?: string;
}

export interface CoverageReport {
  generatedAt: string;
  chartRoot: string;
  templates: number;
  /** Distinct `{{ .Values.X }}` paths found in templates/. */
  referencedPaths: string[];
  /** Leaf paths declared in values.yaml. */
  declaredPaths: string[];
  /** Distinct paths referenced in templates but missing a default in values.yaml. */
  missing: string[];
  /** Distinct paths declared in values.yaml but never referenced. */
  unused: string[];
  /** Each reference site (path + source) for the missing paths. */
  missingSites: ValueRefSite[];
  findings: Finding[];
  ok: boolean;
}

export interface CoverageOptions {
  now?: string;
  /** Ignore values-yaml paths matching these prefixes (e.g. `global.*`, `serviceMonitor.*`). */
  ignoreUnusedPrefixes?: string[];
  /** Ignore referenced paths matching these prefixes (e.g. parent-chart values). */
  ignoreMissingPrefixes?: string[];
  /** Skip files whose paths match these substrings. */
  skip?: string[];
}
