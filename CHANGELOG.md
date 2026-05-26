# Changelog

## v0.1.0 — 2026-05-27

- Initial release: cross-reference `{{ .Values.* }}` usage in a Helm chart's `templates/` against the dotted keys declared in `values.yaml`.
- 4 finding codes: `missing-default` (referenced but no default — high), `missing-values-yaml`, `missing-templates` (high), `unused-default` (low).
- Parent-coverage honored: declaring `image: {}` covers `.Values.image.tag`, and declaring `image.tag` covers `.Values.image`.
- Library API: `check(chartRoot, opts)` → `CoverageReport`; `findValueRefs` and `declaredPathsOf` helpers.
- Formatters: `toMarkdown(report)` (with missing-defaults table including source:line) and `toSummary(report)`.
- CLI: `helm-chart-values-coverage <chart-root>` with `--format json|markdown|summary`, `--ignore-missing-prefixes`, `--ignore-unused-prefixes`, `--skip`, `--fail-on-high`, `--fail-on-unused`, `--out FILE`.
- Lane #3 (Kubernetes control planes), fourth scanner in the offline-CI kit alongside `k8s-deprecated-api-scanner`, `k8s-rbac-overscope-finder`, `k8s-pod-security-audit`.
- Node 20/22 CI (lint, typecheck, coverage, build, demo, `npm audit`), AGPL-3.0-or-later, Dependabot.
