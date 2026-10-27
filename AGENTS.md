# Website

Read README.md for commands and boundaries; read MIGRATION.md before publishing or changing the original deployment repositories.

- Website code belongs here. The independent private vault owns articles, attachments, and résumé versions. Read its AGENTS.md before a vault edit. Generated staging files are disposable.
- Public staging may use private note filenames for link resolution, never their bodies. Preserve the exclusion of private data and unrelated assets. Tests use a synthetic separate vault.
- Keep Home production output vanilla HTML/CSS/JS and preserve its bilingual strings, CSS tokens, accessibility and reduced motion. Blog theme lives in apps/blog. Résumé presentation changes should preserve both Visual and ATS layouts.
- The résumé's local endpoints are development-only. Keep host/origin/session checks, revision checks and atomic writes. Real data stays outside this repository; sample data is fictional. Public PDF updates require an explicit selection and preview.
- Integration tests require ports 4174, 5173 and 4176 free; they replace generated staging with a temporary fixture. Run dev or build afterward to restore real public content.
- API tests mock external services. Live contact sends email and chat can incur costs. Use read-only API checks unless the user requests a live transaction. Preserve the existing Worker and secrets.
- Use the SonghaiFan GitHub account for this project. Publishing workflows run in the private target repositories; public CI never checks out the private vault.
