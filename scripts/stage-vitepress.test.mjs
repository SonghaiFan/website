import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = fileURLToPath(new URL("./stage-vitepress.mjs", import.meta.url))
const installedSite = path.resolve(path.dirname(script), "..")

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "vitepress-vault-"))
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }))
  const vault = path.join(sandbox, "vault")
  const site = path.join(sandbox, "website")
  for (const dir of ["docs", "Blog/en", "Notes", "assets/a", "assets/b"]) {
    fs.mkdirSync(path.join(dir.startsWith("docs") ? site : vault, dir), { recursive: true })
  }
  fs.writeFileSync(path.join(site, "package.json"), '{"type":"module"}')
  fs.symlinkSync(path.join(installedSite, "node_modules"), path.join(site, "node_modules"))
  const write = (file, content) => {
    const destination = file.startsWith("_system/site/vitepress/")
      ? path.join(site, file.slice("_system/site/vitepress/".length))
      : path.join(vault, file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, content)
  }
  for (const name of ["frank.svg", "frankie.svg", "franklin.svg"]) {
    write(`assets/2026-09-22/${name}`, `<svg data-brand="${name}"/>`)
  }
  const run = () => spawnSync(process.execPath, [script, vault, path.join(site, ".stage"), site], { encoding: "utf8" })
  return { vault, site, write, run }
}

test("stages only public posts and referenced assets, with links, callouts, and paired translations", (t) => {
  const { site, write, run } = fixture(t)
  write("Blog/Hello.md", '---\ntranslationKey: hello\ndate: 2025-01-02\ntags: [PhD]\n---\n# 你好\n\n[[Other]]\n\n![[assets/a/pic (1).png]]\n\n> [!note] 提示\n> 内容\n\n```md\n![[secret.png]]\n```\n')
  write("Blog/Other.md", '---\ndate: 2025-01-03\ntags: [AI]\n---\n# 另一篇\n')
  write("Blog/2026-10-01.md", "---\npillar: ''\n---\n\n# 今天的笔记\n")
  write("Blog/Older.md", '---\ndate: 2024-10-01\ntags: [Design]\n---\n# 更早的文章\n')
  write("Blog/en/Hello.md", "---\ntranslationKey: hello\ndate: 2025-01-02\n---\n# Hello\n")
  write("Notes/secret.md", "PRIVATE_SENTINEL")
  write("assets/a/pic (1).png", "image")
  write("assets/b/unused.png", "private image")
  write("assets/projects/hello.jpg", "project image")
  write("_system/site/vitepress/docs/.vitepress/cache/stale.txt", "generated cache")
  write("_system/site/vitepress/docs/.vitepress/dist/stale.txt", "generated output")
  write("Blog/en/projects/hello.md", '---\ntitle: Hello Project\ndescription: Explores public stories.\ncover: "[[assets/projects/hello.jpg]]"\norder: 1\nperiod: 2024-2025\n---\n# Hello Project\n\nThe public project details.\n')
  write("Blog/projects/hello.md", '---\ntitle: 你好项目\ndescription: 探索公开故事。\ncover: "[[assets/projects/hello.jpg]]"\norder: 1\n---\n# 你好项目\n')
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const staged = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Hello.md"), "utf8")
  assert.match(staged, /translationUrl: \/blog\/posts\/Hello/)
  assert.match(staged, /commentTerm: ['"]?blog:hello/)
  assert.match(staged, /name: ['"]?giscus:backlink/)
  const english = fs.readFileSync(path.join(site, ".stage/docs/en/blog/posts/Hello.md"), "utf8")
  assert.match(english, /commentTerm: ['"]?blog:hello/)
  assert.match(staged, /lastUpdated:/)
  assert.match(staged, /readingMinutes: 1/)
  assert.match(staged, /\[Other\]\(\/zh\/blog\/posts\/Other\)/)
  assert.match(staged, /pic%20%281%29\.png/)
  assert.match(staged, /::: info 提示/)
  assert.match(staged, /!\[\[secret\.png\]\]/)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/public/assets/b/unused.png")), false)
  for (const name of ["frank.svg", "frankie.svg", "franklin.svg"]) {
    assert.equal(
      fs.readFileSync(path.join(site, `.stage/docs/public/assets/2026-09-22/${name}`), "utf8"),
      `<svg data-brand="${name}"/>`,
    )
  }
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/Notes/secret.md")), false)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/.vitepress/cache")), false)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/.vitepress/dist")), false)
  const home = fs.readFileSync(path.join(site, ".stage/docs/zh/index.md"), "utf8")
  assert.match(home, /journalHome: true/)
  assert.match(home, /<HomeSearch \/>/)
  assert.match(home, /<BlogFilter \/>/)
  assert.match(home, /data-type="note".*2026-10-01/)
  assert.doesNotMatch(home, /data-type="daily"/)
  assert.match(home, /data-type="note".*Hello/)
  assert.match(home, /\/zh\/blog\/posts\/Hello/)
  assert.doesNotMatch(home, /journal-entry-arrow|↗/)
  assert.doesNotMatch(home, /portfolioHome/)
  const sidebar = JSON.parse(fs.readFileSync(path.join(site, ".stage/scripts/zhBlogIndex.json"), "utf8"))
  assert.equal(sidebar.length, 1)
  assert.match(sidebar[0].text, /全部随笔/)
  assert.deepEqual(sidebar[0].items.map((item) => item.link), [
    "/zh/blog/posts/2026-10-01", "/zh/blog/posts/Other", "/zh/blog/posts/Hello", "/zh/blog/posts/Older",
  ])
  assert.match(sidebar[0].items[0].text, /2026-10-01.*今天的笔记/)
  const dated = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/2026-10-01.md"), "utf8")
  assert.match(dated, /title: 今天的笔记/)
  assert.doesNotMatch(dated, /# 今天的笔记/)
  assert.match(dated, /<h1 class="search-document-title" aria-hidden="true">今天的笔记<a href="#"/)
  const projectIndex = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/projects.json"), "utf8"))
  assert.equal(projectIndex.projects.length, 2)
  assert.equal(projectIndex.projects[0].url, "https://blog.songhai.site/projects/hello")
  assert.equal(projectIndex.projects[1].url, "https://blog.songhai.site/zh/projects/hello")
  assert.equal(projectIndex.projects[0].description, "Explores public stories.")
  assert.equal(projectIndex.projects[0].image, "https://blog.songhai.site/assets/projects/hello.jpg")
  assert.equal(fs.readFileSync(path.join(site, ".stage/docs/public/assets/projects/hello.jpg"), "utf8"), "project image")
  const project = fs.readFileSync(path.join(site, ".stage/docs/zh/projects/hello.md"), "utf8")
  assert.match(project, /blogPost: true/)
  assert.match(project, /project: true/)
  assert.match(project, /cover: \/assets\/projects\/hello\.jpg/)
  assert.match(project, /translationUrl: \/projects\/hello/)
  assert.match(home, /data-type="project".*\/zh\/projects\/hello/)
  const searchIndex = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/search-index.json"), "utf8"))
  assert.deepEqual(searchIndex.posts.filter((entry) => entry.locale === "zh").map((entry) => entry.type), ["note", "note", "note", "note", "project"])
  assert.equal(searchIndex.posts.find((entry) => entry.slug === "hello" && entry.locale === "en").period, "2024-2025")
  assert.doesNotMatch(JSON.stringify(searchIndex), /PRIVATE_SENTINEL/)
  const legacyProject = fs.readFileSync(path.join(site, ".stage/docs/zh/projects.md"), "utf8")
  assert.match(legacyProject, /0;url=\/zh\/\?type=project/)
  const legacyBlog = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/index.md"), "utf8")
  assert.match(legacyBlog, /0;url=\/zh\//)
  const projectSidebar = JSON.parse(fs.readFileSync(path.join(site, ".stage/scripts/enProjectIndex.json"), "utf8"))
  assert.deepEqual(projectSidebar[0].items.map((item) => item.link), ["/projects/hello"])
  assert.match(projectSidebar[0].items[0].text, /2024-2025.*Hello Project/)
  assert.doesNotMatch(JSON.stringify(projectIndex), /PRIVATE_SENTINEL/)
})

test("project cards infer metadata and use the first body image unless cover is overridden", (t) => {
  const { site, write, run } = fixture(t)
  write("assets/projects/first.png", "first image")
  write("assets/projects/second.png", "second image")
  write("Blog/projects/Minimal.md", "A project with no metadata.\n\n![[assets/projects/first.png]]\n\n![[assets/projects/second.png]]\n")
  write("Blog/projects/Markdown.md", '---\ncover: ""\n---\nA Markdown image.\n\n![First](assets/projects/first.png)\n')
  write("Blog/projects/Override.md", '---\ncover: "[[assets/projects/second.png]]"\n---\nAn explicit cover.\n\n![[assets/projects/first.png]]\n')
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const { projects } = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/projects.json"), "utf8"))
  assert.equal(projects.length, 3)
  const minimal = projects.find((project) => project.title === "Minimal")
  assert.equal(minimal.description, "A project with no metadata.")
  assert.equal(minimal.image, "https://blog.songhai.site/assets/projects/first.png")
  assert.equal(projects.find((project) => project.title === "Markdown").image, minimal.image)
  assert.equal(projects.find((project) => project.title === "Override").image, "https://blog.songhai.site/assets/projects/second.png")
})

test("keeps Daily private and treats all public writing as Note, including legacy daily metadata", (t) => {
  const { site, write, run } = fixture(t)
  write("Daily/2026-10-02.md", "PRIVATE_DAILY_SENTINEL\n")
  write("Blog/2026-10-02.md", "Today.\n")
  write("Blog/2026-10-03.md", "---\ntype: note\n---\nA dated note.\n")
  write("Blog/Thought.md", "---\ntype: daily\n---\nA named daily entry.\n")
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const index = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/search-index.json"), "utf8"))
  assert.deepEqual(index.posts.map(({ slug, type }) => [slug, type]).sort(), [
    ["2026-10-03", "note"], ["2026-10-02", "note"], ["Thought", "note"],
  ].sort())
  assert.doesNotMatch(JSON.stringify(index), /PRIVATE_DAILY_SENTINEL/)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/Daily/2026-10-02.md")), false)
  const legacy = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Thought.md"), "utf8")
  assert.match(legacy, /type: note/)
  const raw = fs.readFileSync(path.join(site, ".stage/docs/public/zh/blog/posts/Thought.md"), "utf8")
  assert.match(raw, /type: note/)
})

test("uses publication date, then source Git or file time; ignores handwritten updated property", (t) => {
  const { site, vault, write, run } = fixture(t)
  write("Blog/Published.md", "---\ndate: 2025-01-02\nupdated: 2020-01-01\n---\nPublished first.\n")
  write("Blog/Updated.md", "---\nupdated: 2020-01-01\n---\nUpdated note.\n")
  write("Blog/Fallback.md", "---\ndate:\n---\nNo date property.\n")
  const updatedTime = new Date("2026-09-30T15:00:00Z") // Oct 1 in Melbourne
  fs.utimesSync(path.join(vault, "Blog/Updated.md"), updatedTime, updatedTime)
  const fallbackTime = new Date("2026-09-28T15:00:00Z") // Sep 29 in Melbourne
  fs.utimesSync(path.join(vault, "Blog/Fallback.md"), fallbackTime, fallbackTime)
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const index = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/search-index.json"), "utf8"))
  const bySlug = Object.fromEntries(index.posts.map((post) => [post.slug, post]))
  assert.equal(bySlug.Published.displayDate, "2025-01-02")
  assert.equal(bySlug.Updated.displayDate, "2026-10-01")
  assert.equal(bySlug.Updated.date, null)
  assert.equal(bySlug.Fallback.displayDate, "2026-09-29")
  const sidebar = JSON.parse(fs.readFileSync(path.join(site, ".stage/scripts/zhBlogIndex.json"), "utf8"))
  assert.deepEqual(sidebar[0].items.map((item) => item.link), [
    "/zh/blog/posts/Updated", "/zh/blog/posts/Fallback", "/zh/blog/posts/Published",
  ])
  assert.match(sidebar[0].items[0].text, /2026-10-01.*Updated/)
  const staged = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Updated.md"), "utf8")
  assert.match(staged, /displayDate: '?2026-10-01'?/)
  assert.match(staged, /lastUpdated: '?2026-09-30T15:00:00.000Z'?/)
  assert.doesNotMatch(staged, /updated: 2020-01-01/)
  assert.doesNotMatch(staged, /datePublished/)
  const card = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/cards/zh/Updated.json"), "utf8"))
  assert.equal(card.date, "2026-10-01")
})

test("keeps the Git update date when a tracked note has uncommitted edits", (t) => {
  const { vault, site, write, run } = fixture(t)
  write("Blog/Tracked.md", "---\nupdated: 2020-01-01\n---\nFirst version.\n")
  const git = (args, env = {}) => {
    const result = spawnSync("git", ["-C", vault, ...args], {
      encoding: "utf8", env: { ...process.env, ...env },
    })
    assert.equal(result.status, 0, result.stderr)
  }
  git(["init", "-q"])
  git(["add", "Blog/Tracked.md"])
  git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "Publish note"], {
    GIT_AUTHOR_DATE: "2026-09-29T15:00:00Z",
    GIT_COMMITTER_DATE: "2026-09-29T15:00:00Z",
  })
  write("Blog/Tracked.md", "---\nupdated: 2020-01-01\n---\nEdited locally.\n")
  fs.utimesSync(path.join(vault, "Blog/Tracked.md"), new Date("2026-10-04T12:00:00Z"), new Date("2026-10-04T12:00:00Z"))
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const index = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/search-index.json"), "utf8"))
  assert.equal(index.posts[0].displayDate, "2026-09-30")
})

test("renders a private-note wikilink as text and links it after publication", (t) => {
  const { site, write, run } = fixture(t)
  write("Blog/Hello.md", "Today I read [[secret|the private note]].\n")
  write("Notes/secret.md", "PRIVATE_SENTINEL")
  let result = run()
  assert.equal(result.status, 0, result.stderr)
  let staged = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Hello.md"), "utf8")
  assert.match(staged, /Today I read the private note\./)
  assert.doesNotMatch(staged, /PRIVATE_SENTINEL|\/zh\/blog\/posts\/secret/)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/Notes/secret.md")), false)
  write("Blog/secret.md", "Public version.\n")
  result = run()
  assert.equal(result.status, 0, result.stderr)
  staged = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Hello.md"), "utf8")
  assert.match(staged, /\[the private note\]\(\/zh\/blog\/posts\/secret\)/)
  assert.doesNotMatch(staged, /PRIVATE_SENTINEL/)
})

test("rejects missing and ambiguous wikilinks", (t) => {
  const { write, run } = fixture(t)
  write("Blog/Hello.md", "[[unknown]]\n")
  let result = run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing wikilink/)
  write("Notes/unknown.md", "private")
  write("Daily/unknown.md", "also private")
  result = run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Ambiguous wikilink/)
})

test("rejects ambiguous asset names", (t) => {
  const { write, run } = fixture(t)
  write("Blog/Hello.md", "![[same.png]]\n")
  write("assets/a/same.png", "one")
  write("assets/b/same.png", "two")
  const result = run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Ambiguous attachment/)
})

test("generates public card data with ordered Markdown blocks, pillar, and entry links", (t) => {
  const { site, write, run } = fixture(t)
  write("Blog/Hello.md", '---\ntitle: Hello Cards\npillar: tools\n---\n# First heading\n\nA paragraph with **bold**, ==marked== text, and `%%literal code%%`. %%hidden comment%%\n\n%%A hidden comment\nthat continues to this line.%%\n\nA paragraph with a block id. ^block-id\n\n| left | right |\n| --- | --- |\n| one | two |\n\n```js\nconst answer = 42\n```\n\n![[assets/a/card.png|Card image]]\n\n![[assets/a/appendix.pdf|Open appendix]]\n')
  write("assets/a/card.png", "image")
  write("assets/a/appendix.pdf", "pdf")
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const cardPath = path.join(site, ".stage/docs/public/api/cards/zh/Hello.json")
  const cardData = JSON.parse(fs.readFileSync(cardPath, "utf8"))
  assert.equal(cardData.schemaVersion, 1)
  assert.equal(cardData.pillar, "tools")
  assert.equal(cardData.title, "Hello Cards")
  const sidebar = JSON.parse(fs.readFileSync(path.join(site, ".stage/scripts/zhBlogIndex.json"), "utf8"))
  assert.match(sidebar[0].items[0].text, /\d{4}-\d{2}-\d{2}.*FRANKLIN TOOLS.*Hello Cards/)
  assert.deepEqual(cardData.blocks.map((block) => block.type), ["heading", "paragraph", "paragraph", "table", "code", "image", "paragraph"])
  assert.match(cardData.blocks[1].html, /<strong>bold<\/strong>/)
  assert.match(cardData.blocks[1].html, /<mark>marked<\/mark>/)
  assert.doesNotMatch(cardData.blocks[1].html, /hidden comment/)
  assert.match(cardData.blocks[1].html, /<code>%%literal code%%<\/code>/)
  assert.match(cardData.blocks[2].html, /block id\./)
  assert.doesNotMatch(cardData.blocks[2].html, /block-id/)
  assert.match(cardData.blocks[3].html, /<table(?:\s|>)/)
  assert.match(cardData.blocks[4].html, /answer/)
  assert.match(cardData.blocks[5].html, /class="card-image-frame"/)
  assert.match(cardData.blocks[5].html, /src="\/assets\/a\/card\.png" alt="Card image"/)
  assert.match(cardData.blocks[6].html, /<a href="\/assets\/a\/appendix\.pdf">Open appendix<\/a>/)
  const stagedPost = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Hello.md"), "utf8")
  assert.match(stagedPost, /cardDataUrl: \/api\/cards\/zh\/Hello\.json/)
  const home = fs.readFileSync(path.join(site, ".stage/docs/zh/index.md"), "utf8")
  assert.match(home, /\d{4}-\d{2}-\d{2}.*Hello Cards/)
  assert.doesNotMatch(home, /journal-entry-cards|\?view=cards/)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/public/api/cards/en/Hello.json")), false)
})

test("preserves standalone Markdown horizontal rules as card page-break markers", (t) => {
  const { site, write, run } = fixture(t)
  write("Blog/Breaks.md", [
    "First page paragraph.",
    "",
    "---",
    "",
    "Second page paragraph.",
    "",
    "```md",
    "---",
    "```",
    "",
    "| left | right |",
    "| --- | --- |",
    "| one | two |",
  ].join("\n"))
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const cardPath = path.join(site, ".stage/docs/public/api/cards/zh/Breaks.json")
  const cardData = JSON.parse(fs.readFileSync(cardPath, "utf8"))
  assert.deepEqual(cardData.blocks.map((block) => block.type), ["paragraph", "divider", "paragraph", "code", "table"])
  assert.match(cardData.blocks[1].html, /<hr\s*\/?\s*>/)
})

test("preserves Obsidian image dimensions and separates images written on one line", (t) => {
  const { site, write, run } = fixture(t)
  write("Blog/Hello.md", "![[assets/a/image.png|570]]\n\n![[assets/a/image.png|640x480]]\n\n![[assets/a/image.png|128]] ![[assets/a/image.png|442]]\n\nText before image.\n![[assets/a/image.png|128]]\n\n![[assets/a/image.png|128]] Text after image.\n")
  write("assets/a/image.png", "image")
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const stagedPost = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Hello.md"), "utf8")
  assert.match(stagedPost, /<img[^>]+width="570"/)
  assert.match(stagedPost, /<img[^>]+width="640" height="480"/)
  const cardData = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/cards/zh/Hello.json"), "utf8"))
  assert.deepEqual(cardData.blocks.map((block) => block.type), ["image", "image", "image-row", "paragraph", "image", "image", "paragraph"])
  assert.match(cardData.blocks[0].html, /width="570"/)
  assert.match(cardData.blocks[1].html, /width="640" height="480"/)
  assert.match(cardData.blocks[2].html, /width="128"/)
  assert.match(cardData.blocks[2].html, /width="442"/)
  assert.equal(cardData.blocks[3].text, "Text before image.")
  assert.match(cardData.blocks[4].html, /width="128"/)
  assert.equal(cardData.blocks[5].flowGroup, cardData.blocks[6].flowGroup)
  assert.notEqual(cardData.blocks[4].flowGroup, cardData.blocks[6].flowGroup)
})

test("accepts existing brand-name pillar values without editing the Obsidian source", (t) => {
  const { site, write, run } = fixture(t)
  write("Blog/Tool.md", "---\npillar: franklin\n---\nA tool.\n")
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const card = JSON.parse(fs.readFileSync(path.join(site, ".stage/docs/public/api/cards/zh/Tool.json"), "utf8"))
  assert.equal(card.pillar, "tools")
  const staged = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/Tool.md"), "utf8")
  assert.match(staged, /pillar: tools/)
})

test("rejects unsupported card pillars", (t) => {
  const { write, run } = fixture(t)
  write("Blog/Hello.md", "---\npillar: maybe\n---\nHello\n")
  const result = run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Invalid pillar/)
})

test("semantic slugs keep source titles and wikilinks while sharing translated discussions", (t) => {
  const { site, write, run } = fixture(t)
  write("Blog/中文标题.md", '---\nslug: semantic-note\ndate: 2026-10-01\n---\n正文 [[另一篇]]\n')
  write("Blog/另一篇.md", '---\nslug: other-note\ndate: 2026-10-02\n---\n第二篇\n')
  write("Blog/en/English title.md", '---\nslug: semantic-note\ndate: 2026-10-01\n---\nEnglish text\n')
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const article = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/semantic-note.md"), "utf8")
  assert.match(article, /title: 中文标题/)
  assert.match(article, /commentTitle: 中文标题/)
  assert.match(article, /commentTerm: ['"]?blog:semantic-note/)
  assert.match(article, /translationUrl: \/blog\/posts\/semantic-note/)
  assert.match(article, /\[另一篇\]\(\/zh\/blog\/posts\/other-note\)/)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/zh/blog/posts/中文标题.md")), false)
})

test("rejects duplicate or malformed semantic slugs", (t) => {
  const { write, run } = fixture(t)
  write("Blog/First.md", '---\nslug: same-key\n---\nFirst\n')
  write("Blog/Second.md", '---\nslug: same-key\n---\nSecond\n')
  assert.match(run().stderr, /Duplicate slug/)
  write("Blog/Second.md", '---\nslug: Invalid Key\n---\nSecond\n')
  assert.match(run().stderr, /Invalid slug/)
})


test("custom publishing folders agree across staging, links and private exclusions", (t) => {
  const { vault, site, write, run } = fixture(t)
  fs.renameSync(path.join(vault, "assets"), path.join(vault, "Media"))
  write(".blog-publisher.json", JSON.stringify({ publicFolder: "Writing/Public", englishFolder: "English", projectsFolder: "Work", assetsFolder: "Media", privateFolders: ["Journal", "Drafts"] }))
  write("Writing/Public/Hello.md", '---\nslug: hello\n---\nPublic text [[Journal/Secret]] ![[Media/photo.png]]\n')
  write("Writing/Public/English/Hello.md", '---\nslug: hello\n---\nEnglish text\n')
  write("Writing/Public/Work/demo.md", 'Project details.\n')
  write("Media/photo.png", "public photo")
  write("Media/unused.png", "PRIVATE ATTACHMENT")
  write("Journal/Secret.md", "PRIVATE BODY")
  write("Blog/Old.md", "OLD PUBLIC ROOT MUST NOT APPEAR")
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const article = fs.readFileSync(path.join(site, ".stage/docs/zh/blog/posts/hello.md"), "utf8")
  assert.match(article, /Public text/)
  assert.doesNotMatch(article, /PRIVATE BODY/)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/en/blog/posts/hello.md")), true)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/zh/projects/demo.md")), true)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/public/assets/photo.png")), true)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/public/assets/unused.png")), false)
  assert.equal(fs.existsSync(path.join(site, ".stage/docs/zh/blog/posts/old.md")), false)
})

test("rejects unsafe publishing config before staging", (t) => {
  const { write, run } = fixture(t)
  for (const publicFolder of ["../Notes", ".obsidian", "Notes/Public", "/absolute"]) {
    write(".blog-publisher.json", JSON.stringify({ publicFolder }))
    assert.notEqual(run().status, 0, publicFolder)
  }
})
