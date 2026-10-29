# Website

The code for `songhai.site`, `blog.songhai.site`, and `api.songhai.site`.

## Daily use

Articles and project pages are edited in your separate Obsidian vault. The standalone [`frank_resume`](https://github.com/SonghaiFan/frank_resume) project owns résumé editing and PDF export. This repository contains only the reviewed public PDF and homepage preview image.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Use Node 24 or later. Set `VAULT_ROOT` to your vault; paths resolve from this repository. The default layout is `Documents/Projects/website` and `Documents/Knowledge`.

| Preview | Address |
| --- | --- |
| Home | http://127.0.0.1:4174/ |
| Blog | http://127.0.0.1:5173/zh/ |

Ctrl+C stops both previews. The command refuses occupied ports. Home and Blog link locally, and the homepage reads local post/project indexes. Blog content and theme edits refresh automatically. Invalid references preserve the last valid preview and print an error.

For a demo without a personal vault, run `node scripts/demo-vault.mjs /tmp/website-demo-vault`, then `VAULT_ROOT=/tmp/website-demo-vault npm run dev`. Choose a fresh directory; the generator refuses to overwrite files.

## Résumé

Use `frank_resume` as the single résumé editor and source project. Select the JSON data file there, edit and export the chosen résumé with the browser's **Save as PDF** option. Review the PDF, then replace `apps/home/assets/Songhai_Fan_Resume_2026.pdf` and `apps/home/assets/cv-preview.png` here and commit the website changes to publish them. Other résumé versions and cover letters should stay out of the public assets.

## Check, build and publish

```sh
npm run check         # tests and real public site builds
npm run test:preview  # stop previews first; uses only a synthetic temporary vault
npm run status       # deployed code/content versions and GitHub Actions links
npm run deploy:api   # deploy the existing Worker with your local Cloudflare credentials
```

Public CI runs against synthetic content. After success it updates the `tested` tag. Home deploys directly from this public repository after main-branch CI succeeds. Blog reuses the shared publishing workflow from the private vault repository; its scheduled checks pick up tested code (GitHub scheduling may be delayed), and a vault push affecting Blog/assets publishes immediately. Code is pinned to a commit in each build. No personal GitHub token or vault checkout credential is stored in this public repository.

| Target | Build output | Publishing location |
| --- | --- | --- |
| Home | `apps/home/.site-dist` | this public repository → `songhai.site` |
| Blog | `apps/blog/.stage/docs/.vitepress/dist` | private vault Pages → `blog.songhai.site` |
| API | `apps/api` | existing Worker → `api.songhai.site` |

Only a site's build output is uploaded. Each Pages site exposes `build.json` with source revisions. The homepage manual workflow dispatch deploys the tested tag. The private Blog wrapper accepts a checked 40-character website commit SHA, including a known-good SHA for rollback. Existing domain settings are retained.

API code is deployed from this repository using project-local Wrangler. Existing Worker secrets are retained; no keys belong in browser code or Git. Chat/contact previews use the production API. Automated tests mock paid calls and email delivery.

See [MIGRATION.md](MIGRATION.md) and [VERIFICATION.md](VERIFICATION.md) for migration and verification details.

## Analytics and comments

Home and Blog use separate Cloudflare Web Analytics sites. View visits, page views and paths in the Cloudflare dashboard under **Web Analytics**; no public counters are shown. The beacon runs only on the exact production hostnames, so localhost and previews do not contribute traffic. Cloudflare handles Blog's client-side navigation.

Giscus stores public comments in **SonghaiFan/website → Discussions → Announcements**. The self-hosted fork is maintained in **SonghaiFan/franklin-comments** and served at **comments.songhai.site**. Install its dedicated GitHub App only on that public repository. The private vault is never connected to Giscus. Home has an on-demand guestbook; public posts and project pages load comments near the end of the article. Sign-in is handled by GitHub. No OAuth secrets are stored in this repository.

Public embed IDs live in `apps/home/engagement.js`, shared by Home and the Blog theme. Article translations share a discussion when they have the same translation key; otherwise the stable public URL path identifies the thread. `giscus.json` allows only the existing domains and the two local preview origins. Moderate replies in GitHub Discussions. Local verification does not post test comments.

The shared widget owns its component layout and the named `songhai_light` / `songhai_dark` themes. Home and Blog use the service's `/client.js`; Blog appearance changes use a message addressed only to the comments origin. On loopback, both previews use `http://127.0.0.1:4181` from the separate comments checkout. See its `SONGHAI.md` for App setup, runtime, deployment and rollback. No App secrets belong in this website repository.

### Blog URL keys

Ordinary Blog notes keep their Chinese filenames and titles and declare a stable English `slug` in frontmatter, for example `slug: digital-asset-cleanup`. Use lowercase letters, numbers, and hyphens. Paired translations share the same slug. Published URLs and comment keys use this value; changing the title does not change either. Project pages retain their existing paths. Duplicate and malformed slugs fail the build.
