# Migration

Website code is consolidated in this repository; the Obsidian vault remains an independent private repository. Home, Blog and API retain their existing domains and publishing resources.

## Provenance and preservation

Home originated at commit `0c5f0d8f96310346aff5563ff621165e63ff9c74`; the original vault site at `b947952ba3b9957f425aec1b2ff807a0e1c70dc5`. The résumé editor includes the working copy's uncommitted editor features. Its real defaults, historical persona data and browser export are stored only in the private vault and local backups.

The public repository starts with a filtered new history. Original repositories and their Git histories are retained in local archives; existing private Pages repositories remain publishing targets. Private data and credentials are not imported into this repository.

## Publishing design

GitHub Pages has one site per repository. Home and Blog therefore retain two publishing targets, with thin wrappers calling the shared workflow here. Wrapper templates live in deployment/. Blog builds inside its private vault repository. Shared checkout paths are explicit; only generated public output is uploaded.

Public main-branch CI promotes successful commits to the tested tag. Private target workflows periodically resolve that tag and skip if build.json already matches; article pushes build immediately. This avoids holding private-vault credentials or a broad personal token in public CI. Scheduling is eventually consistent, not an immediate dispatch guarantee. A manual dispatch with an exact SHA publishes immediately and supports rollback.

API deployment uses the existing Cloudflare identity, Worker name, route, rate limits and secrets. The root deploy:api command is the maintained deployment entrypoint; it does not copy credentials into CI.

## Directory move

After deployment verification, the active project moves to Documents/Projects/website, the vault to Documents/Knowledge, and root folders use Inbox, Personal, Resources and Archive. Runtime vault paths and Obsidian's registered vault location must be updated together. Existing research projects are moved intact; original platform checkouts and the legacy notes vault remain archived with their histories and uncommitted files. An external private migration manifest records old/new paths and file checksums.
