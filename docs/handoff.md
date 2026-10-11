# Handoff

The production implementation is in `apps/web`, `packages`, `services` and `infrastructure`. Start with [README](../README.md), [architecture](architecture.md), [implementation status](implementation.md) and [approved product behaviour](product.md).

## Retained design references

The standalone HTML prototype in `apps/prototype` preserves the approved visual/interaction reference. Run it with `yarn dev:prototype`. It starts on 11 October 2026 with synthetic data; edits reset on reload. Its charts, reminder settings and “Describe a day” preview are illustrative. Those shortcuts are not production requirements.

`design/archive` preserves the exact original concept fragments. `design/screenshots` contains design review captures (files marked earlier predate the final refinements). `samples/initial-state.json` is a synthetic sample export, not production account data. Original browser checks remain in `tests/*.cjs`; application tests are in `tests/production`.

The RealTracker reference supplied during design established swipe right=done, left=not done, repeat-to-clear, numeric habits, skip, and the history bars. Relevant accepted behaviour is recorded in `product.md`. Its archive is not republished here.

The user superseded the original frontend-reference requirement with the current console/domain conventions. Current frontend, replication and CDK pipeline sources were inspected before implementation; the application uses independently implemented code and public packages. The production logo is `apps/web/public/logo.svg`.

## Release checks

Do not infer deployment success from a successful synth. Check CodePipeline, CloudFormation, Amplify's publish job, production DNS/TLS, authenticated API access, and independent browser sessions. Record actual results in `implementation.md`. Never record test passwords or tokens in the repository.
