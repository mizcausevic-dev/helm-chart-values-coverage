import type { CoverageReport, FindingSeverity } from "./types.js";

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  high: "🔴 high",
  medium: "🟠 medium",
  low: "🟡 low"
};

export function toMarkdown(report: CoverageReport): string {
  const lines: string[] = [];
  lines.push(report.ok ? `# Helm chart values coverage ✅` : `# Helm chart values coverage ❌`);
  lines.push(``);
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(``);
  lines.push(
    `- Chart root: \`${report.chartRoot}\``
  );
  lines.push(
    `- Templates: ${report.templates} · Referenced \`.Values\` paths: ${report.referencedPaths.length} · Declared in values.yaml: ${report.declaredPaths.length}`
  );
  lines.push(
    `- Missing defaults: **${report.missing.length}** · Unused defaults: ${report.unused.length}`
  );

  if (report.missing.length > 0) {
    lines.push(``);
    lines.push(`## Missing defaults (${report.missing.length})`);
    lines.push(``);
    lines.push(`| .Values path | sources |`);
    lines.push(`|---|---|`);
    for (const p of report.missing) {
      const sources = report.missingSites.filter((s) => s.path === p).map((s) => `\`${s.source}\``).join("<br>");
      lines.push(`| \`${p}\` | ${sources} |`);
    }
  }

  if (report.unused.length > 0) {
    lines.push(``);
    lines.push(`## Unused defaults (${report.unused.length})`);
    lines.push(``);
    for (const p of report.unused) lines.push(`- \`${p}\``);
  }

  if (report.missing.length === 0 && report.unused.length === 0 && report.findings.length === 0) {
    lines.push(``);
    lines.push(`No coverage issues.`);
  }

  return lines.join("\n");
}

export function toSummary(report: CoverageReport): string {
  return `${report.templates} templates · ${report.referencedPaths.length} refs · ${report.declaredPaths.length} declared · ${report.missing.length} missing · ${report.unused.length} unused (${report.ok ? "ok" : "fail"})`;
}

export function severityLabel(s: FindingSeverity): string {
  return SEVERITY_LABEL[s];
}
