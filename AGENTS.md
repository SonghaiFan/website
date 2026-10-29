# Website

Read README.md for commands and boundaries; read MIGRATION.md before publishing or changing the original deployment repositories.

- Website code belongs here. The independent private vault owns articles, attachments, and résumé versions. Read its AGENTS.md before a vault edit. Generated staging files are disposable.
- Public staging may use private note filenames for link resolution, never their bodies. Preserve the exclusion of private data and unrelated assets. Tests use a synthetic separate vault.
- Keep Home production output vanilla HTML/CSS/JS and preserve its bilingual strings, CSS tokens, accessibility and reduced motion. Blog theme lives in apps/blog.
- Résumé editing belongs to the standalone `frank_resume` project. This repository keeps only the reviewed public PDF and homepage preview image; do not add private résumé data or an editor here.
- Integration tests require ports 4174 and 5173 free; they replace generated staging with a temporary fixture. Run dev or build afterward to restore real public content.
- API tests mock external services. Live contact sends email and chat can incur costs. Use read-only API checks unless the user requests a live transaction. Preserve the existing Worker and secrets.
- Use the SonghaiFan GitHub account for this project. Home publishes directly from this public repository; Blog publishes from the private vault repository. Public CI never checks out the private vault.
