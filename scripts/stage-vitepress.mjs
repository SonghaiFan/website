import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { pathToFileURL, fileURLToPath } from "node:url"

const [vaultArg, outputArg, siteArg] = process.argv.slice(2)
if (!vaultArg || !outputArg) {
  throw new Error("Usage: node stage-vitepress.mjs <vault-root> <output-directory> [site-root]")
}

const vaultRoot = path.resolve(vaultArg)
const siteRoot = path.resolve(siteArg || fileURLToPath(new URL("../apps/blog", import.meta.url)))
const outputRoot = path.resolve(outputArg)
const docsRoot = path.join(outputRoot, "docs")
const publicRoot = path.join(docsRoot, "public")
const siteOrigin = "https://blog.songhai.site"
const blogRoot = path.join(vaultRoot, "Blog")
const assetsRoot = path.join(vaultRoot, "assets")
for (const folder of [blogRoot, assetsRoot]) {
  if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Missing vault directory: ${folder}`)
}
const requireFromSite = createRequire(path.join(siteRoot, "package.json"))
const matter = requireFromSite("gray-matter")
const { createMarkdownRenderer } = await import(pathToFileURL(requireFromSite.resolve("vitepress")).href)
const markdownRenderer = await createMarkdownRenderer(path.join(siteRoot, "docs"), {})

function sourceLastUpdated(file) {
  const relative = path.relative(vaultRoot, file)
  try {
    const committed = execFileSync("git", ["log", "-1", "--format=%cI", "--", relative], { cwd: vaultRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    if (committed) return new Date(committed)
  } catch { /* Test fixtures and non-Git vaults use the source file time. */ }
  return fs.statSync(file).mtime
}

// The source vault is in Melbourne. Keep a Git timestamp near midnight on the
// author's calendar day when turning it into a static date label.
function localDate(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

if (![".stage", ".stage-dev-refresh"].some((name) => outputRoot === path.join(siteRoot, name))) {
  throw new Error("Staging output must be the site's .stage or .stage-dev-refresh directory")
}

fs.rmSync(outputRoot, { recursive: true, force: true })
fs.mkdirSync(outputRoot, { recursive: true })
const sourceDocsRoot = path.join(siteRoot, "docs")
fs.cpSync(sourceDocsRoot, docsRoot, {
  recursive: true,
  filter: (file) => {
    const relative = path.relative(sourceDocsRoot, file)
    return path.basename(file) !== ".DS_Store"
      && ![".vitepress/cache", ".vitepress/dist"].some((generated) =>
        relative === generated || relative.startsWith(`${generated}${path.sep}`))
  },
})
fs.mkdirSync(path.join(outputRoot, "scripts"), { recursive: true })

function walk(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(file) : [file]
  })
}

const assets = walk(assetsRoot).filter((file) => fs.statSync(file).isFile())
const copiedAssets = new Set()
const cardBrandIcons = ["frank.svg", "frankie.svg", "franklin.svg"]
for (const name of cardBrandIcons) {
  const relative = path.join("2026-09-22", name)
  const source = path.join(assetsRoot, relative)
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Missing card brand icon: assets/${relative}`)
  }
  const destination = path.join(publicRoot, "assets", relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  copiedAssets.add(relative)
}
const locales = [
  { name: "zh", source: blogRoot, output: path.join(docsRoot, "zh/blog/posts"), urlPrefix: "/zh/blog/posts/" },
  { name: "en", source: path.join(blogRoot, "en"), output: path.join(docsRoot, "en/blog/posts"), urlPrefix: "/blog/posts/" },
]

// Projects are written like posts (Blog/projects, Blog/en/projects) and staged by
// the same pipeline; they differ only in where they are listed and in their order.
const projectLocales = [
  { name: "zh", kind: "project", source: path.join(blogRoot, "projects"), output: path.join(docsRoot, "zh/projects"), urlPrefix: "/zh/projects/" },
  { name: "en", kind: "project", source: path.join(blogRoot, "en/projects"), output: path.join(docsRoot, "en/projects"), urlPrefix: "/projects/" },
]

const collect = (collectionLocales) => collectionLocales.flatMap((locale) => {
  fs.mkdirSync(locale.output, { recursive: true })
  if (!fs.existsSync(locale.source)) return []
  return fs.readdirSync(locale.source, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const file = path.join(locale.source, entry.name)
      const parsed = matter(fs.readFileSync(file, "utf8"))
      const slug = entry.name.slice(0, -3)
      const rawDate = parsed.data.date
      const slugDate = slug.match(/^(\d{4}-\d{2}-\d{2})(?:-(\d{2})-(\d{2})-(\d{2}))?(?:-|$)/)
      const inferredSlugDate = slugDate
        ? `${slugDate[1]}T${slugDate[2] || "00"}:${slugDate[3] || "00"}:${slugDate[4] || "00"}Z`
        : null
      const date = rawDate == null || rawDate === ""
        ? (inferredSlugDate ? new Date(inferredSlugDate) : null)
        : new Date(rawDate)
      if (date && Number.isNaN(date.getTime())) throw new Error(`Invalid date in ${file}`)
      const modifiedAt = sourceLastUpdated(file)
      const displayDate = date ? date.toISOString().slice(0, 10) : localDate(modifiedAt)
      const sourcePillar = typeof parsed.data.pillar === "string" ? parsed.data.pillar.trim().toLowerCase() : ""
      const pillar = { frank: "study", franklin: "tools", frankie: "play" }[sourcePillar] || sourcePillar
      if (pillar && !["study", "tools", "play"].includes(pillar)) {
        throw new Error(`Invalid pillar in ${path.relative(vaultRoot, file)}: ${pillar}`)
      }
      const declaredType = typeof parsed.data.type === "string" ? parsed.data.type.trim().toLowerCase() : ""
      if (declaredType && !["note", "daily", "project"].includes(declaredType)) {
        throw new Error(`Invalid blog type in ${path.relative(vaultRoot, file)}: ${declaredType}`)
      }
      if (declaredType && (locale.kind === "project") !== (declaredType === "project")) {
        throw new Error(`Blog type does not match folder in ${path.relative(vaultRoot, file)}: ${declaredType}`)
      }
      // Daily/ is a private writing location. Once a piece is in Blog/, it is
      // public writing, regardless of its filename or an older `type: daily`.
      const type = locale.kind === "project" ? "project" : "note"
      const firstHeading = parsed.content.match(/^#\s+(.+)\s*$/m)?.[1]?.trim()
      const titleFromHeading = slugDate && firstHeading && firstHeading !== slug ? firstHeading : null
      return {
        kind: locale.kind || "post",
        type,
        order: Number(parsed.data.order ?? 999),
        file, locale: locale.name, output: path.join(locale.output, entry.name),
        slug, url: `${locale.urlPrefix}${slug}`, parsed,
        title: String(parsed.data.title || titleFromHeading || slug),
        titleFromHeading: Boolean(!parsed.data.title && titleFromHeading),
        date: date?.toISOString() ?? null,
        displayDate,
        modifiedAt: modifiedAt.toISOString(),
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [],
        pillar: pillar || null,
        translationKey: typeof parsed.data.translationKey === "string" ? parsed.data.translationKey.trim()
          // A project's Chinese and English pages share a file name, which pairs them.
          : locale.kind === "project" ? `project:${slug}` : "",
      }
    })
})
const posts = collect(locales)
const projectPages = collect(projectLocales)
const pages = [...posts, ...projectPages]
const privateNotes = ["Daily", "Notes"].flatMap((folder) =>
  walk(path.join(vaultRoot, folder)).filter((file) => file.endsWith(".md")))

const translations = new Map()
for (const post of pages) {
  if (!post.translationKey) continue
  const pair = translations.get(post.translationKey) || {}
  if (pair[post.locale]) throw new Error(`Duplicate translationKey for ${post.locale}: ${post.translationKey}`)
  pair[post.locale] = post
  translations.set(post.translationKey, pair)
}

function encodeUrlPath(file) {
  return file.split(path.sep).map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29")).join("/")
}

function attachment(target, from) {
  const clean = decodeURIComponent(target.trim().replace(/^<|>$/g, "").split(/[?#]/)[0])
  if (!clean || /^(?:https?:|data:|mailto:)/i.test(clean)) return null
  if (clean.startsWith("/images/") || clean.startsWith("/icons/")) {
    const siteFile = path.join(publicRoot, clean.slice(1))
    if (!fs.existsSync(siteFile)) throw new Error(`Missing site asset in ${from}: ${clean}`)
    return clean
  }
  const candidates = [
    path.resolve(vaultRoot, clean.replace(/^\//, "")),
    path.resolve(path.dirname(from), clean),
  ].filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
  if (candidates.length === 0 && !clean.includes("/")) {
    candidates.push(...assets.filter((file) => path.basename(file) === clean))
  }
  const unique = [...new Set(candidates.map((file) => fs.realpathSync(file)))]
  if (unique.length !== 1) {
    throw new Error(`${unique.length ? "Ambiguous" : "Missing"} attachment in ${path.relative(vaultRoot, from)}: ${clean}`)
  }
  const relative = path.relative(fs.realpathSync(assetsRoot), unique[0])
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Public attachment must be inside assets/: ${clean}`)
  }
  const destination = path.join(publicRoot, "assets", relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(unique[0], destination)
  copiedAssets.add(relative)
  return `/assets/${encodeUrlPath(relative)}`
}

function findPost(target, from) {
  const clean = decodeURIComponent(target.trim()).replace(/\.md$/i, "")
  const explicit = clean.replace(/^\//, "").replace(/^Blog\//i, "")
  const scoped = pages.filter((post) => {
    const relative = path.relative(blogRoot, post.file).replace(/\.md$/i, "")
    return relative === explicit || post.slug === clean || post.slug === path.basename(clean)
      || (Array.isArray(post.parsed.data.aliases) && post.parsed.data.aliases.includes(clean))
  })
  const sameLanguage = scoped.filter((post) => post.locale === from.locale)
  const matches = sameLanguage.length ? sameLanguage : scoped
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new Error(`Ambiguous wikilink in ${path.relative(vaultRoot, from.file)}: ${target}`)
  }
  const privateMatches = privateNotes.filter((file) => {
    const relative = path.relative(vaultRoot, file).replace(/\.md$/i, "")
    const withinFolder = relative.replace(/^(?:Daily|Notes)\//, "")
    return relative === clean || withinFolder === clean
  })
  const candidates = privateMatches.length ? privateMatches
    : clean.includes("/") ? [] : privateNotes.filter((file) => path.basename(file, ".md") === clean)
  if (candidates.length === 1) return null
  throw new Error(`${candidates.length ? "Ambiguous" : "Missing"} wikilink in ${path.relative(vaultRoot, from.file)}: ${target}`)
}

function slugifyHeading(heading) {
  return heading.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-")
}

function imageSize(value) {
  const match = String(value || "").trim().match(/^(\d+)(?:x(\d+))?$/i)
  return match ? { width: Number(match[1]), height: match[2] ? Number(match[2]) : null } : null
}

function escapeAttribute(value) {
  return String(value).replace(/[&"<>]/g, (character) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[character])
}

function transformInline(line, post) {
  return line.split(/(`+[^`]*`+)/g).map((piece) => {
    if (piece.startsWith("`")) return piece
    return piece
      .replace(/!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)/g, (match, alt, raw) => {
        const url = attachment(raw, post.file)
        return url ? `![${alt}](${url})` : match
      })
      .replace(/!\[\[([^\]]+)\]\]/g, (_, raw) => {
        const [target, caption] = raw.split("|")
        const url = attachment(target, post.file)
        const size = imageSize(caption)
        const label = (size ? "" : caption?.trim()) || path.basename(target.split("#")[0])
        if (/\.pdf$/i.test(target.trim())) return `[${label}](${url})`
        if (size) {
          const dimensions = ` width="${size.width}"${size.height ? ` height="${size.height}"` : ""}`
          return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(label)}"${dimensions}>`
        }
        return `![${label}](${url})`
      })
      .replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
        const [destination, label] = raw.split("|")
        const [target, heading] = destination.split("#")
        const linked = target ? findPost(target, post) : post
        if (!linked) return String(label || heading || path.basename(target.replace(/\.md$/i, ""))).replace(/[\\[\]_*`]/g, "\\$&")
        const anchor = heading ? `#${slugifyHeading(heading)}` : ""
        return `[${label || heading || linked.title}](${linked.url}${anchor})`
      })
      .replace(/(?<!\\)==([^=\n]+)==/g, "<mark>$1</mark>")
  }).join("")
}

const calloutKind = { note: "info", abstract: "info", info: "info", tip: "tip", success: "tip", warning: "warning", caution: "warning", danger: "danger", error: "danger" }
function stripObsidianComments(line, state) {
  return line.split(/(`+[^`]*`+)/g).map((piece) => {
    if (piece.startsWith("`")) return piece
    let cursor = 0
    let visible = ""
    while (cursor < piece.length) {
      if (state.open) {
        const close = piece.indexOf("%%", cursor)
        if (close < 0) return visible
        cursor = close + 2
        state.open = false
        continue
      }
      const start = piece.indexOf("%%", cursor)
      if (start < 0) return visible + piece.slice(cursor)
      visible += piece.slice(cursor, start)
      cursor = start + 2
      state.open = true
    }
    return visible
  }).join("")
}

function transformMarkdown(source, post) {
  const lines = source.split(/\r?\n/)
  const result = []
  let fence = null
  const commentState = { open: false }
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length }
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null
      result.push(line)
      continue
    }
    if (fence) { result.push(line); continue }
    line = stripObsidianComments(line, commentState)
    if (commentState.open && !line.trim()) continue
    line = line.replace(/(?:^|\s)\^[\w-]+\s*$/u, "")
    const callout = line.match(/^>\s*\[!([a-z-]+)\][+-]?\s*(.*)$/i)
    if (callout) {
      const kind = calloutKind[callout[1].toLowerCase()] || "info"
      const title = callout[2].trim()
      result.push(`::: ${kind}${title ? ` ${title}` : ""}`)
      while (i + 1 < lines.length && /^>/.test(lines[i + 1])) {
        i++
        result.push(transformInline(lines[i].replace(/^> ?/, ""), post))
      }
      result.push(":::")
      continue
    }
    result.push(transformInline(line, post))
  }
  return result.join("\n")
}

function removeRepeatedTitle(source, title) {
  const match = source.match(/^(?:[ \t]*\r?\n)*#\s+([^\r\n]+)\s*(?:\r?\n|$)/)
  if (!match || match[1].trim() !== title.trim()) return source
  return source.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, "")
}

function markdownBlocks(source) {
  const lines = source.split(/\r?\n/)
  const tokens = markdownRenderer.parse(source, {})
  const blocks = []
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i]
    if (token.type === "hr" && token.level === 0) {
      blocks.push({ type: "divider", html: "<hr>", text: "", flowGroup: i })
      i++
      continue
    }
    if (token.level !== 0 || !token.map) { i++; continue }
    let end = i + 1
    if (token.nesting > 0) {
      let depth = token.nesting
      while (end < tokens.length && depth > 0) {
        if (tokens[end].level === 0) depth += tokens[end].nesting
        end++
      }
    }
    const markdown = lines.slice(token.map[0], token.map[1]).join("\n")
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi, (_, alt, url) => `${alt || "External image"}: ${url}`)
    const type = token.type === "heading_open" ? "heading"
      : token.type === "fence" || token.type === "code_block" ? "code"
        : token.type === "table_open" ? "table"
          : token.type === "bullet_list_open" || token.type === "ordered_list_open" ? "list"
            : token.type === "blockquote_open" ? "quote"
              : token.type === "hr" ? "divider"
                : token.type === "html_block" ? "html" : "paragraph"
    const html = markdownRenderer.render(markdown)
    const text = markdown
      .replace(/^ {0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
      .replace(/```[^\n]*\n?|~~~[^\n]*\n?/g, "")
      .replace(/\|/g, "  ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\*\*|__|~~|[*_`]/g, "")
      .replace(/^\s*[-:| ]+$/gm, "")
      .trim()
    if (html.trim()) {
      const imageParagraph = html.trim().match(/^<p>([\s\S]*?)<\/p>$/i)
      const imageContent = imageParagraph?.[1] || html.trim()
      const standaloneImages = !imageContent.replace(/<img\b[^>]*>/gi, "").trim()
      if (/<img\b/i.test(imageContent) && (imageParagraph || standaloneImages)) {
        const pieces = imageContent.split(/(<img\b[^>]*>)/gi)
        let pendingImages = []
        const flushImages = () => {
          if (!pendingImages.length) return
          const images = pendingImages.map((image) => `<div class="card-image-frame">${image}</div>`).join("")
          const alts = pendingImages.map((image) => image.match(/\balt="([^"]*)"/i)?.[1] || "").join(" ")
          blocks.push({ type: pendingImages.length > 1 ? "image-row" : "image", html: pendingImages.length > 1 ? `<div class="card-image-row">${images}</div>` : images, text: alts, flowGroup: i })
          pendingImages = []
        }
        for (let j = 0; j < pieces.length; j++) {
          const piece = pieces[j]
          if (/^<img\b/i.test(piece)) { pendingImages.push(piece); continue }
          if (pendingImages.length && /^[ \t]*$/.test(piece) && /^<img\b/i.test(pieces[j + 1] || "")) continue
          flushImages()
          const content = piece.replace(/^(?:\s|<br\s*\/?\s*>)+|(?:\s|<br\s*\/?\s*>)+$/gi, "").trim()
          if (content) blocks.push({ type: "paragraph", html: `<p>${content}</p>`, text: content.replace(/<[^>]+>/g, ""), flowGroup: i })
        }
        flushImages()
      } else blocks.push({ type, html, text, flowGroup: i })
    }
    i = end
  }
  return blocks
}

// About 400 CJK characters or 220 Latin words per minute, ignoring code and markup.
function readingMinutes(markdown) {
  const text = markdown.replace(/```[\s\S]*?```/g, "").replace(/<[^>]+>|!?\[[^\]]*\]\([^)]*\)/g, " ")
  const han = (text.match(/\p{Script=Han}/gu) || []).length
  const words = (text.replace(/\p{Script=Han}/gu, " ").match(/[\p{L}\p{N}]+/gu) || []).length
  return Math.max(1, Math.round(han / 400 + words / 220))
}

function excerptFromMarkdown(markdown, locale) {
  const lines = markdown.split(/\r?\n/)
  let fence = null
  let paragraph = []
  let excerpt = ""
  const finish = () => {
    if (!paragraph.length || excerpt) return
    excerpt = paragraph.join(" ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, "$1")
      .replace(/<[^>]*>/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/[*_~]/g, "")
      .replace(/&(?:nbsp|#160);/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim()
  }
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    if (!line.trim()) {
      finish()
      if (excerpt) break
      paragraph = []
      continue
    }
    if (/^\s*(?:#{1,6}\s|>|:::|[-*+]\s|\d+[.)]\s|\|)|^\s*(?:!\[|<img\b|<figure\b|<div\b)/i.test(line)) {
      finish()
      if (excerpt) break
      paragraph = []
      continue
    }
    paragraph.push(line.trim())
  }
  finish()
  const maxLength = locale === "zh" ? 110 : 160
  const characters = [...excerpt]
  if (characters.length > maxLength) {
    excerpt = characters.slice(0, maxLength).join("").replace(/\s+\S*$/, "").trim()
  }
  return excerpt
}

function firstLocalImage(markdown) {
  let fence = null
  for (const line of markdown.split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const markdownImage = line.match(/!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)/)
    const htmlImage = line.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i)
    const match = markdownImage || htmlImage
    if (!match) continue
    const imageUrl = (markdownImage ? match[2].replace(/^<|>$/g, "") : match[1]).trim()
    if (!imageUrl.startsWith("/")) continue
    let localPath
    try { localPath = decodeURIComponent(imageUrl.split(/[?#]/)[0]) } catch { continue }
    if (!localPath.startsWith("/assets/") && !localPath.startsWith("/images/")) continue
    if (!fs.existsSync(path.join(publicRoot, localPath.slice(1)))) continue
    return { url: absoluteUrl(localPath), alt: markdownImage ? match[1].trim() : "" }
  }
  return null
}

function isoDate(value) {
  if (value == null || value === "") return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function absoluteUrl(pathname) {
  return new URL(pathname, siteOrigin).href
}

const publicPosts = [...posts].sort((a, b) =>
  b.displayDate.localeCompare(a.displayDate) || a.title.localeCompare(b.title))
for (const post of pages) {
  const pair = translations.get(post.translationKey)
  const other = pair?.[post.locale === "zh" ? "en" : "zh"]
  const data = { ...post.parsed.data, title: post.title, blogPost: true, type: post.type }
  data.commentTerm = `blog:${post.translationKey || post.url}`
  delete data.updated
  if (post.pillar) data.pillar = post.pillar
  if (post.kind === "project") {
    data.project = true
    // The cover is a vault attachment, written as a wikilink so Obsidian keeps it in step.
    if (data.cover) data.cover = attachment(String(data.cover).replace(/^!?\[\[|\]\]$/g, "").split("|")[0], post.file)
  }
  data.lastUpdated = post.modifiedAt
  if (post.kind !== "project") data.displayDate = post.displayDate
  if (other) data.translationUrl = other.url
  if (data.date == null && post.date) data.date = post.date
  const transformed = removeRepeatedTitle(transformMarkdown(post.parsed.content, post), post.title)
  const description = typeof data.description === "string" && data.description.trim()
    ? data.description.trim()
    : excerptFromMarkdown(transformed, post.locale)
      || (post.locale === "zh" ? "关于数据、交互与 AI 的观察与实践。" : "Notes on data, interfaces, and AI.")
  data.description = description
  const leadImage = firstLocalImage(transformed)
  if (post.kind === "project" && !data.cover && leadImage) data.cover = leadImage.url
  data.readingMinutes = readingMinutes(transformed)
  const cardDataUrl = `/api/cards/${post.locale}/${post.kind === "project" ? "projects/" : ""}${encodeURIComponent(post.slug)}.json`
  data.cardDataUrl = cardDataUrl
  const rawMarkdownUrl = `${post.url}.md`
  data.rawMarkdownUrl = rawMarkdownUrl
  const canonicalUrl = absoluteUrl(post.url)
  const publishedAt = post.date
  const modifiedAt = isoDate(data.lastUpdated)
  const schema = {
    "@context": "https://schema.org",
    "@type": post.kind === "project" ? "CreativeWork" : "BlogPosting",
    headline: post.title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    inLanguage: post.locale === "zh" ? "zh-Hans" : "en",
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    ...(modifiedAt ? { dateModified: modifiedAt } : {}),
    ...(leadImage ? { image: [leadImage.url] } : {}),
  }
  const authorValues = Array.isArray(data.author) ? data.author : [data.author]
  const authors = authorValues
    .filter((author) => typeof author === "string" && author.trim() && !/^(?:your name|author|unknown|tbd)$/i.test(author.trim()))
    .map((author) => ({ "@type": "Person", name: author.trim() }))
  if (authors.length) schema.author = authors
  const schemaJson = JSON.stringify(schema).replace(/</g, "\\u003c")
  const pageHead = Array.isArray(data.head) ? data.head : []
  const socialHeadKeys = new Set([
    "og:type", "og:title", "og:description", "og:url", "og:site_name", "og:locale", "og:image", "og:image:alt",
    "article:published_time", "article:modified_time",
  ])
  data.head = [
    ["meta", { name: "giscus:backlink", content: canonicalUrl }],
    ...pageHead.filter((entry) => {
      const [tag, attributes] = entry || []
      return !(
        (tag === "link" && (attributes?.rel === "canonical" || attributes?.type === "text/markdown"))
        || (tag === "meta" && socialHeadKeys.has(attributes?.property))
        || (tag === "script" && attributes?.type === "application/ld+json")
      )
    }),
    ["link", { rel: "canonical", href: canonicalUrl }],
    ["link", { rel: "alternate", type: "text/markdown", href: absoluteUrl(rawMarkdownUrl) }],
    ...(other ? [
      ["link", { rel: "alternate", hreflang: post.locale === "zh" ? "zh-Hans" : "en", href: canonicalUrl }],
      ["link", { rel: "alternate", hreflang: other.locale === "zh" ? "zh-Hans" : "en", href: absoluteUrl(other.url) }],
    ] : []),
    ["meta", { property: "og:type", content: "article" }],
    ["meta", { property: "og:title", content: post.title }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:url", content: canonicalUrl }],
    ["meta", { property: "og:site_name", content: "Frank / Journal" }],
    ["meta", { property: "og:locale", content: post.locale === "zh" ? "zh_CN" : "en_US" }],
    ...(leadImage ? [
      ["meta", { property: "og:image", content: leadImage.url }],
      ["meta", { property: "og:image:alt", content: leadImage.alt || post.title }],
    ] : []),
    ...(publishedAt ? [["meta", { property: "article:published_time", content: publishedAt }]] : []),
    ...(modifiedAt ? [["meta", { property: "article:modified_time", content: modifiedAt }]] : []),
    ["meta", { name: "twitter:card", content: leadImage ? "summary_large_image" : "summary" }],
    ["meta", { name: "twitter:title", content: post.title }],
    ["meta", { name: "twitter:description", content: description }],
    ...(leadImage ? [
      ["meta", { name: "twitter:image", content: leadImage.url }],
      ["meta", { name: "twitter:image:alt", content: leadImage.alt || post.title }],
    ] : []),
    ["script", { type: "application/ld+json" }, schemaJson],
  ]
  // The visible title lives in Layout.vue. Give VitePress local search a heading
  // as well, so posts without Markdown headings are indexed by title and body.
  const searchHeading = `<h1 class="search-document-title" aria-hidden="true">${escapeAttribute(post.title)}<a href="#" aria-hidden="true"></a></h1>`
  fs.writeFileSync(post.output, matter.stringify(`${searchHeading}\n\n${transformed}`, data))
  const rawMarkdownDirectory = path.join(publicRoot, path.dirname(post.url.slice(1)))
  fs.mkdirSync(rawMarkdownDirectory, { recursive: true })
  const rawFrontmatter = { ...post.parsed.data, title: post.title, type: post.type }
  if (post.pillar) rawFrontmatter.pillar = post.pillar
  if (rawFrontmatter.date == null && post.date) rawFrontmatter.date = post.date.slice(0, 10)
  fs.writeFileSync(path.join(rawMarkdownDirectory, `${post.slug}.md`), matter.stringify(transformed, rawFrontmatter))
  post.staged = { data, transformed }
  const cardDirectory = path.join(publicRoot, "api/cards", post.locale, post.kind === "project" ? "projects" : "")
  fs.mkdirSync(cardDirectory, { recursive: true })
  fs.writeFileSync(path.join(cardDirectory, `${post.slug}.json`), `${JSON.stringify({
    schemaVersion: 1,
    locale: post.locale,
    title: post.title,
    date: post.kind === "project" ? post.date : post.date || post.displayDate,
    pillar: post.pillar,
    sourceUrl: `https://blog.songhai.site${post.url}`,
    blocks: markdownBlocks(transformed),
  })}\n`)
}

const apiDirectory = path.join(publicRoot, "api")
fs.mkdirSync(apiDirectory, { recursive: true })
const searchIndex = {
  schemaVersion: 1,
  description: "Public blog notes and projects for search and content retrieval.",
  posts: [...publicPosts, ...projectPages].map((post) => ({
    id: `${post.locale}:${post.slug}`,
    locale: post.locale,
    slug: post.slug,
    title: post.title,
    type: post.type,
    date: post.date,
    displayDate: post.kind === "project" ? null : post.displayDate,
    period: post.kind === "project" ? String(post.parsed.data.period ?? "") : null,
    tags: post.tags,
    translationKey: post.translationKey || null,
    url: absoluteUrl(post.url),
    markdownUrl: absoluteUrl(`${post.url}.md`),
    contentType: "text/markdown",
    content: transformMarkdown(post.parsed.content, post),
  })),
}
fs.writeFileSync(path.join(apiDirectory, "search-index.json"), `${JSON.stringify(searchIndex, null, 2)}\n`)

const byProjectOrder = (a, b) => a.order - b.order || a.title.localeCompare(b.title)
const projects = ["en", "zh"].flatMap((locale) => projectPages
  .filter((project) => project.locale === locale && project.staged.data.cover && project.parsed.data.homepage !== false)
  .sort(byProjectOrder)
  .map((project) => ({
    locale,
    title: project.title,
    description: String(project.staged.data.description || ""),
    url: absoluteUrl(project.url),
    image: absoluteUrl(project.staged.data.cover),
    order: project.order,
    content: project.staged.transformed.trim(),
  })))
fs.writeFileSync(path.join(apiDirectory, "projects.json"), `${JSON.stringify({ schemaVersion: 1, projects }, null, 2)}\n`)

const sorted = [...posts].sort((a, b) =>
  b.displayDate.localeCompare(a.displayDate) || a.title.localeCompare(b.title))
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character])
for (const locale of locales) {
  const entries = sorted.filter((post) => post.locale === locale.name)
  const localeProjects = projectPages.filter((project) => project.locale === locale.name).sort(byProjectOrder)
  const allEntries = [...entries, ...localeProjects]
  const chinese = locale.name === "zh"
  const heading = chinese ? "博客" : "Blog"
  const description = chinese ? "随笔与项目。关于数据、交互和 AI 的观察与实践。" : "Notes and projects on data, interfaces, and AI."
  const index = [
    "---", "layout: page", `title: ${heading}`, "journalHome: true", "---", "",
    `<main class="journal-index">`,
    `<header class="journal-intro"><p class="journal-kicker">FRANK / BLOG</p><h1>${heading}</h1><p>${description}</p><BlogFilter /><HomeSearch /></header>`,
    `<div class="journal-entries" aria-label="${chinese ? "博客内容列表" : "Blog entries"}">`,
    ...(allEntries.length ? allEntries.map((post) => {
      const date = post.displayDate
      const meta = post.type === "project" ? String(post.parsed.data.period ?? "") : (date || (chinese ? "未标日期" : "Undated"))
      const typeLabel = chinese ? { note: "随笔", project: "项目" }[post.type]
        : { note: "Note", project: "Project" }[post.type]
      const articleUrl = escapeHtml(encodeURI(post.url))
      const metaHtml = date && post.type !== "project" ? `<time datetime="${date}">${date}</time>` : escapeHtml(meta)
      return `<div class="journal-entry" data-type="${post.type}"><a class="journal-entry-link" href="${articleUrl}"><span class="journal-entry-date"><span class="journal-entry-type">${typeLabel}</span>${metaHtml}</span><span class="journal-entry-title">${escapeHtml(post.title)}</span></a></div>`
    }) : [`<p class="journal-empty">${chinese ? "暂无内容。" : "No entries yet."}</p>`]),
    "</div>", "</main>", "",
  ]
  const landing = `${index.join("\n")}\n`
  fs.writeFileSync(path.join(docsRoot, locale.name, "index.md"), landing)
  const homeUrl = chinese ? "/zh/" : "/"
  for (const [filename, destination] of [
    [path.join(docsRoot, locale.name, "blog/index.md"), homeUrl],
    [path.join(docsRoot, locale.name, "projects.md"), `${homeUrl}?type=project`],
  ]) {
    fs.writeFileSync(filename, matter.stringify(`<p>${chinese ? "页面已移至" : "This page has moved to"} <a href="${destination}">${chinese ? "博客首页" : "the blog home"}</a>。</p>`, {
      title: heading,
      layout: "page",
      head: [
        ["meta", { "http-equiv": "refresh", content: `0;url=${destination}` }],
        ["link", { rel: "canonical", href: absoluteUrl(homeUrl) }],
      ],
    }))
  }

  const pillarLabels = { study: "FRANK STUDY", tools: "FRANKLIN TOOLS", play: "FRANKIE PLAY" }
  const sections = [{
    text: `<span class="journal-side-heading">${chinese ? "全部随笔" : "All notes"}<small>INDEX</small></span><span class="journal-side-count">${String(entries.length).padStart(2, "0")}</span>`,
    link: homeUrl,
    items: entries.map((post) => {
      const date = post.displayDate
      const meta = date || (chinese ? "未标日期" : "Undated")
      const pillar = post.pillar ? `<span class="journal-side-pillar">${pillarLabels[post.pillar]}</span>` : ""
      return {
        text: `<span class="journal-side-meta"><span>${meta}</span>${pillar}</span><span class="journal-side-title">${escapeHtml(post.title)}</span>`,
        link: post.url,
      }
    }),
  }]
  fs.writeFileSync(path.join(outputRoot, `scripts/${locale.name}BlogIndex.json`), JSON.stringify(sections))

  // The project sidebar mirrors the article one: same markup, ordered by `order`,
  // with the period where a post shows its date.
  const projectSections = localeProjects.length ? [{
    text: `<span class="journal-side-heading">${chinese ? "全部项目" : "All projects"}<small>INDEX</small></span><span class="journal-side-count">${String(localeProjects.length).padStart(2, "0")}</span>`,
    link: `${homeUrl}?type=project`,
    items: localeProjects.map((project) => ({
      text: `<span class="journal-side-meta"><span>${escapeHtml(String(project.parsed.data.period ?? ""))}</span></span><span class="journal-side-title">${escapeHtml(project.title)}</span>`,
      link: project.url,
    })),
  }] : []
  fs.writeFileSync(path.join(outputRoot, `scripts/${locale.name}ProjectIndex.json`), JSON.stringify(projectSections))
}

const indexJson = (name) => fs.readFileSync(path.join(outputRoot, `scripts/${name}.json`), "utf8")
fs.writeFileSync(path.join(outputRoot, "scripts/blogIndex.js"), ["enBlogIndex", "zhBlogIndex", "enProjectIndex", "zhProjectIndex"]
  .map((name) => `export const ${name} = ${indexJson(name)};\n`).join(""))
console.log(`Staged ${posts.length} posts, ${projectPages.length} project pages and ${copiedAssets.size} public assets.`)
