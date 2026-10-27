# Verification — 2026-10-27

- Content/API/résumé persistence tests pass (30 tests), including public-only staging, links, dates, citations, contact failures, atomic writes, history and concurrent-save rejection.
- Home, Blog and the migrated résumé editor build successfully. Real vault staging includes 11 posts, 14 project pages and 37 approved assets.
- The synthetic-vault integration test covers all three servers, local links/CORS, forbidden private-file requests, add/edit/delete refresh, missing-reference recovery, session checks, durable résumé writes, stale-save rejection, PDF/PNG generation, stale-public-draft rejection, and clean process shutdown.
- A4 sample PDF is one page; its first-page image is generated using print media so editor controls are excluded. Actual application versions and production email/chat are not used in tests.
- Worker packaging dry-run passes with the existing rate-limit bindings and compatibility date. Production settings were inspected before migration; secrets remain server-side.
- Four original project backups were verified against per-file SHA-256 manifests before migration. The private browser résumé export and legacy source data remain outside this public repository.
- Runtime: Node 24 is the supported/tested release line. Node 26 stalled during browser extraction; installing Chromium with Node 24 resolved it.

Deployment and filesystem completion details belong in the private migration record. Each Pages deployment exposes build.json so source revisions can be checked independently of CI status.
