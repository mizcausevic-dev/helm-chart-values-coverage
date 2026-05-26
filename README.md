# helm-chart-values-coverage

Cross-reference `{{ .Values.* }}` usage in a Helm chart's `templates/` against the dotted keys declared in `values.yaml`. Pure offline transform — no `helm` CLI required, no cluster access.

Catches the two failure modes `helm lint` doesn't: **missing defaults** (a template references a key that has no default in `values.yaml` — install with the wrong override and you get `<nil>`) and **unused defaults** (values.yaml accumulates dead keys nobody references anymore).

> Status: v0.1.0 — Node 20/22 supported, library + CLI. Lane #3 (Kubernetes control planes).

## What it flags

| Code | Severity | Rule |
|---|---|---|
| `missing-default` | 🔴 | A `.Values.X` path is referenced in `templates/` but no key in `values.yaml` covers it. |
| `missing-values-yaml` | 🔴 | The chart directory has no `values.yaml`. |
| `missing-templates` | 🔴 | The chart directory has no `templates/`. |
| `unused-default` | 🟡 | A key declared in `values.yaml` is never referenced by any template. |

Parent-coverage is honored: declaring `image: {}` (an empty object) under `values.yaml` covers a reference to `.Values.image.tag` — Helm allows callers to supply just the child. Likewise, declaring `image.tag: "1.0"` covers a reference to `.Values.image` because the leaf is present.

## CLI

```
npx helm-chart-values-coverage <chart-root>
    [--format json|markdown|summary]
    [--ignore-missing-prefixes global,parent]
    [--ignore-unused-prefixes serviceMonitor]
    [--skip path-substring,path-substring]
    [--fail-on-high]
    [--fail-on-unused]
    [--out FILE]
```

Walks `<chart-root>/templates/**/*.{yaml,yml,tpl}` and emits findings. Use `--ignore-missing-prefixes global` to silence references to parent-chart values; `--ignore-unused-prefixes` to keep unused-by-design values like `serviceMonitor.*`.

Exit codes:
- `0` — clean (or fail flags unset)
- `1` — `--fail-on-high` and high finding present, OR `--fail-on-unused` and any unused present
- `2` — usage / I/O error

## Library

```ts
import { check, toMarkdown, declaredPathsOf, findValueRefs } from "helm-chart-values-coverage";

const report = check("./charts/my-app");
console.log(report.missing);       // ["image.tag", "service.url", …]
console.log(report.unused);        // ["legacyKey", …]
console.log(report.missingSites);  // [{ path: "image.tag", source: "templates/deployment.yaml:11" }]
console.log(toMarkdown(report));
```

## Composes with

- [**`k8s-deprecated-api-scanner`**](https://github.com/mizcausevic-dev/k8s-deprecated-api-scanner) — flag deprecated `apiVersion` in rendered manifests.
- [**`k8s-rbac-overscope-finder`**](https://github.com/mizcausevic-dev/k8s-rbac-overscope-finder) — flag over-scoped RBAC in chart templates.
- [**`k8s-pod-security-audit`**](https://github.com/mizcausevic-dev/k8s-pod-security-audit) — Pod Security Standards audit on rendered workloads.

Together: a 4-scanner offline CI gate kit for Helm chart authors.

## Develop

```
npm install
npm run lint && npm run typecheck && npm run coverage && npm run build
npm run demo
```

## License

[AGPL-3.0-or-later](LICENSE)
