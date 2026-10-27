# Blog search and chat API

Cloudflare Worker serving public search and project data, f's cited chat, and the homepage contact form.

## Endpoint

```text
GET https://api.songhai.site/search?q=keyword
```

Chinese and English terms are matched case-insensitively. Space-separated terms must all occur in a result. Responses include ranked article metadata and a snippet. Add `limit=1..20` to set the result count (default `5`), or `include=content` to include full Markdown for each matching article.

Examples:

```text
https://api.songhai.site/search?q=causal%20graphs
https://api.songhai.site/search?q=%E6%95%B0%E6%8D%AE%E5%8F%AF%E8%A7%86%E5%8C%96&include=content
```

## Deploy

The Worker reads the public index at `https://blog.songhai.site/api/search-index.json`, so new published posts appear without redeploying this Worker. To change the API code, from this directory run:

```sh
npx wrangler deploy
```

The Worker reads two generated public indexes: `search-index.json` for posts and `projects.json` for the blog's project section. `GET /projects?lang=en` (or `zh`) returns the current project cards. Changes to published project pages appear automatically after the blog deploy and cache expiry, without a Worker or homepage redeploy.

## Cited AI chat

```text
POST https://api.songhai.site/chat
Origin: https://songhai.site
Content-Type: application/json

{"message":"What does Frank write about causal graphs?","history":[]}
```

f uses Responses API function calls to identify `small_talk`, `show_cv`, `search_blog`, or `decline_unrelated`. Small talk gets a brief capabilities reply. Questions about Songhai go through `search_blog` before f answers. The search reads the blog's current public post and project indexes; project collection requests show current project cards, specific project matches show only related cards, and article-only results show cited original posts. Answers contain `answer` and `sources`, where each source has a verified `https://blog.songhai.site/...` URL and a number matching its `[1]` citations. The model instructions live in `src/f-prompt.js`. The Worker sends only matching public excerpts to OpenAI and sets `store: false`. Chat accepts the most recent 10 user/assistant turns (20 messages) from the current page, applies a six requests per minute per IP limit, and allows browser requests only from the homepage and local preview origins. Search and project GET endpoints remain public.

Set `OPENAI_API_KEY` as a Cloudflare Worker secret before enabling chat on the home page. Do not commit the key or put it in the static site. `npx wrangler deploy` publishes Worker code and the rate limit binding. An OpenAI project with available credit is needed for generated answers.

Run `node --test test/chat.test.mjs` to check citation URLs, tool selection, origin rejection, and the existing search endpoint without making paid API calls.

## In-page email

`POST /contact` accepts a visitor's name, email, and message from the Songhai avatar's composer. This same Worker calls Resend's email API with `RESEND_API_KEY`, stored only as a Worker secret. The recipient is fixed in `src/index.js`, and the visitor's address is the reply-to address. The form reports success only after Resend returns an email ID. It rejects invalid input, checks the browser origin, uses a honeypot field, and limits each IP to two messages per minute.

Set up Resend's free plan, add and verify the sending domain `mail.songhai.site` using the DNS records shown in its dashboard, and create a sending API key. From this directory, run `npx wrangler secret put RESEND_API_KEY` and paste the key only into Wrangler's hidden prompt. The fixed sender is `Songhai Fan website <contact@mail.songhai.site>`; delivery goes to the resume's public Gmail address. The home page never sees the API key. Until the verified domain and Worker secret are ready, `/contact` returns an error and the visitor's draft remains in the composer. After setup, send a real test message and confirm receipt before publishing the email form.
