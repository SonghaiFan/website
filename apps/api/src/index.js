import { F_ANSWER_INSTRUCTIONS, F_ROUTING_INSTRUCTIONS } from "./f-prompt.js"

const INDEX_URL = "https://blog.songhai.site/api/search-index.json"
const PROJECTS_URL = "https://blog.songhai.site/api/projects.json"
const MAX_QUERY_LENGTH = 160
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20
const CHAT_MODEL = "gpt-5-mini"
const CHAT_MAX_LENGTH = 500
const CHAT_HISTORY_MAX_MESSAGES = 20
const CHAT_REQUEST_MAX_BYTES = 50000
const CONTACT_TO = "songhai.fan2022@gmail.com"
const CONTACT_FROM = "Songhai Fan website <contact@mail.songhai.site>"
const CHAT_ORIGINS = new Set(["https://songhai.site", "https://www.songhai.site", "http://127.0.0.1:4174", "http://localhost:4174", "http://127.0.0.1:4182", "http://localhost:4182"])

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

function json(data, status = 200, extraHeaders = {}, cors = corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      ...extraHeaders,
    },
  })
}

function chatCors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}

function chatJson(data, status, origin) {
  return json(data, status, { "Cache-Control": "no-store" }, chatCors(origin))
}

function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function makeSnippet(content, terms, maxLength = 240) {
  const text = plainText(content)
  const lower = text.toLocaleLowerCase()
  const matchAt = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0)
  const start = Math.max(0, (matchAt.length ? Math.min(...matchAt) : 0) - 80)
  const end = Math.min(text.length, start + maxLength)
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`
}

export function searchPosts(posts, query, limit = DEFAULT_LIMIT) {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return posts.map((post) => {
    const title = String(post.title || "").toLocaleLowerCase()
    const tags = (Array.isArray(post.tags) ? post.tags : []).join(" ").toLocaleLowerCase()
    const content = String(post.content || "").toLocaleLowerCase()
    const searchable = `${title} ${tags} ${content}`
    if (!terms.every((term) => searchable.includes(term))) return null

    const score = terms.reduce((sum, term) => sum
      + (title.includes(term) ? 6 : 0)
      + (tags.includes(term) ? 3 : 0)
      + (content.includes(term) ? 1 : 0), 0)
    return { post, score }
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.post.title).localeCompare(String(b.post.title)))
    .slice(0, limit)
}

function chatMatches(posts, query, limit = 4) {
  const terms = query.toLocaleLowerCase().split(/[\s,，、]+/u).filter((term) => term.length > 1)
  if (!terms.length) return []
  const matches = posts.map((post) => {
    const title = String(post.title || "").toLocaleLowerCase()
    const tags = (Array.isArray(post.tags) ? post.tags : []).join(" ").toLocaleLowerCase()
    const content = String(post.content || "").toLocaleLowerCase()
    const coveredTerms = terms.filter((term) => title.includes(term) || tags.includes(term) || content.includes(term))
    if (coveredTerms.length < Math.min(2, terms.length)) return null
    const score = terms.reduce((sum, term) => sum
      + (title.includes(term) ? 6 : 0)
      + (tags.includes(term) ? 3 : 0)
      + (content.includes(term) ? 1 : 0), 0)
    return score ? { post, score } : null
  }).filter(Boolean)
  return matches.sort((a, b) => b.score - a.score).slice(0, limit)
}

async function publicPosts() {
  const response = await fetch(INDEX_URL, { cf: { cacheTtl: 300, cacheEverything: true }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error("Blog index unavailable")
  const index = await response.json()
  if (!Array.isArray(index.posts)) throw new Error("Invalid blog index")
  return index.posts
}

async function publicProjects() {
  const response = await fetch(PROJECTS_URL, { cf: { cacheTtl: 300, cacheEverything: true }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error("Project index unavailable")
  const index = await response.json()
  if (!Array.isArray(index.projects)) throw new Error("Invalid project index")
  return index.projects.filter((project) => {
    try {
      return ["en", "zh"].includes(project.locale)
        && new URL(project.url).origin === "https://blog.songhai.site"
        && new URL(project.image).origin === "https://blog.songhai.site"
    } catch { return false }
  })
}

function projectSlug(project) {
  return new URL(project.url).pathname.split("/").filter(Boolean).at(-1) || ""
}

function referencedProject(message, projects, locale) {
  const lower = message.toLocaleLowerCase()
  const words = new Set(lower.match(/[\p{L}\p{N}-]+/gu) || [])
  return [...projects].sort((a, b) => Number(b.locale === locale) - Number(a.locale === locale))
    .find((project) => words.has(projectSlug(project).toLocaleLowerCase())
      || lower.includes(project.title.toLocaleLowerCase()))
}

function isProjectBrowse(message) {
  return /\b(?:show|see|browse|list|introduce|overview|what|which|all)\b[^?]{0,70}\b(?:projects?|portfolio)\b|\b(?:projects?|portfolio)\b[^?]{0,50}\b(?:overview|list)\b|(?:看看|展示|介绍|浏览|有哪些|所有|全部)[^。？]{0,35}(?:项目|作品)/iu.test(message)
}

function smallTalkReply(message, locale) {
  const thanks = /\b(?:thanks|thank you|cheers)\b|谢谢|多谢/iu.test(message)
  const howAreYou = /\bhow are you\b|最近怎么样|你好吗/iu.test(message)
  if (locale === "zh") return `${thanks ? "不客气！" : howAreYou ? "我很好，谢谢！" : "你好，我是 f。"}我能介绍范松海、展示他的项目或简历，也能根据他的文章回答问题并附原文链接。`
  return `${thanks ? "You're welcome! " : howAreYou ? "Doing well, thanks! " : "Hi, I'm f. "}I can introduce Songhai, show his projects or CV, and answer questions about his writing with links to the original posts.`
}

// gpt-5-mini is a reasoning model: max_output_tokens caps its hidden reasoning
// and the visible answer together. When reasoning spends the budget the
// response comes back "incomplete" with a cut-off or empty answer, which used to
// surface as a 502. Budgets below leave room for both; if one still runs out,
// retry once with double the room rather than return half a sentence.
// A rate-limit or server error from OpenAI also gets one quick retry. A timeout
// does not: the visitor has already waited 25 seconds.
async function openaiResponse(key, body) {
  for (let attempt = 1; ; attempt += 1) {
    const last = attempt === 2
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: CHAT_MODEL, store: false, ...body }),
      signal: AbortSignal.timeout(25000),
    })
    if (!last && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      continue
    }
    if (!response.ok) throw new Error(`OpenAI response failed: ${response.status}`)
    const data = await response.json()
    if (data.status === "incomplete") {
      if (!last && data.incomplete_details?.reason === "max_output_tokens") {
        body = { ...body, max_output_tokens: body.max_output_tokens * 2 }
        continue
      }
      throw new Error(`OpenAI response incomplete: ${data.incomplete_details?.reason || "unknown"}`)
    }
    return data
  }
}

function answerText(response) {
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n").trim()
}

async function handleContact(request, env, origin) {
  if (!origin || !CHAT_ORIGINS.has(origin)) return json({ error: "Origin not allowed." }, 403, { "Cache-Control": "no-store" }, {})
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return chatJson({ error: "Use application/json." }, 415, origin)
  if (Number(request.headers.get("content-length")) > 5000) return chatJson({ error: "Request is too large." }, 413, origin)
  let body
  try {
    const raw = await request.text()
    if (raw.length > 5000) return chatJson({ error: "Request is too large." }, 413, origin)
    body = JSON.parse(raw)
  } catch { return chatJson({ error: "Invalid JSON." }, 400, origin) }
  if (typeof body?.website === "string" && body.website.trim()) return chatJson({ sent: true }, 200, origin)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const email = typeof body?.email === "string" ? body.email.trim() : ""
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  if (!name || name.length > 80 || /[\r\n]/u.test(name)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254
    || !message || message.length > 2000) {
    return chatJson({ error: "Enter a valid name, email, and message (up to 2,000 characters)." }, 400, origin)
  }
  if (!env.RESEND_API_KEY || !env.CONTACT_RATE_LIMIT) return chatJson({ error: "Email is not configured yet." }, 503, origin)
  const visitor = request.headers.get("CF-Connecting-IP") || "unknown"
  const { success } = await env.CONTACT_RATE_LIMIT.limit({ key: `contact:${visitor}` })
  if (!success) return chatJson({ error: "Too many messages. Please try again later." }, 429, origin)
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: [CONTACT_TO],
        reply_to: email,
        subject: `Website message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Resend rejected email: ${response.status}`)
    const result = await response.json()
    if (typeof result?.id !== "string" || !result.id) throw new Error("Resend did not confirm acceptance")
    return chatJson({ sent: true }, 200, origin)
  } catch (error) {
    console.error("Contact email failed", error instanceof Error ? error.message : "unknown")
    return chatJson({ error: "The email could not be sent right now. Please try again later." }, 502, origin)
  }
}

async function handleChat(request, env, origin) {
  if (!origin || !CHAT_ORIGINS.has(origin)) return json({ error: "Origin not allowed." }, 403, { "Cache-Control": "no-store" }, {})
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return chatJson({ error: "Use application/json." }, 415, origin)
  if (Number(request.headers.get("content-length")) > CHAT_REQUEST_MAX_BYTES) return chatJson({ error: "Request is too large." }, 413, origin)

  let body
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > CHAT_REQUEST_MAX_BYTES) return chatJson({ error: "Request is too large." }, 413, origin)
    body = JSON.parse(raw)
  } catch { return chatJson({ error: "Invalid JSON." }, 400, origin) }
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  if (!message || message.length > CHAT_MAX_LENGTH) return chatJson({ error: `Message must be 1–${CHAT_MAX_LENGTH} characters.` }, 400, origin)
  const history = Array.isArray(body.history) ? body.history.slice(-CHAT_HISTORY_MAX_MESSAGES) : []
  if (history.some((item) => !["user", "assistant"].includes(item?.role) || typeof item?.content !== "string" || item.content.length > 800)) {
    return chatJson({ error: "Invalid conversation history." }, 400, origin)
  }
  if (!env.OPENAI_API_KEY || !env.CHAT_RATE_LIMIT) return chatJson({ error: "Chat is not configured yet." }, 503, origin)
  const visitor = request.headers.get("CF-Connecting-IP") || "unknown"
  const { success } = await env.CHAT_RATE_LIMIT.limit({ key: `chat:${visitor}` })
  if (!success) return chatJson({ error: "Too many questions. Please try again shortly." }, 429, origin)

  const input = [
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: message },
  ]
  const locale = /[\u3400-\u9fff]/u.test(message) ? "zh" : "en"
  const answerLanguageInstruction = locale === "zh" ? "Reply only in Simplified Chinese." : "Reply only in English."
  const tools = [
    { type: "function", name: "search_blog", description: "Retrieve Songhai Fan's published blog posts and project pages before answering any question about him or his work. Project browsing also uses this tool.", parameters: { type: "object", properties: { query: { type: "string", description: "Specific names or keywords from the latest question and conversation; preserve project acronyms exactly." }, browseProjects: { type: "boolean", description: "True only for browsing or an overview of the project collection; false for a specific question." } }, required: ["query", "browseProjects"], additionalProperties: false }, strict: true },
    { type: "function", name: "show_cv", description: "Show the existing CV PDF preview and download links when the visitor asks to see Frank's CV, resume, or résumé.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
    { type: "function", name: "small_talk", description: "Greet, acknowledge thanks, or explain what f can do when the visitor is chatting socially rather than asking about Songhai's work.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
    { type: "function", name: "decline_unrelated", description: "Choose this when the visitor asks about a topic unrelated to Songhai Fan, his work, CV, projects, or writing.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  ]
  try {
    const first = await openaiResponse(env.OPENAI_API_KEY, {
      instructions: F_ROUTING_INSTRUCTIONS,
      input, tools,
      tool_choice: "required",
      parallel_tool_calls: false, max_output_tokens: 1500, reasoning: { effort: "low" },
    })
    let call = (first.output || []).find((item) => item.type === "function_call")
    if (!call) throw new Error("Missing tool call")
    if (call.name === "small_talk") return chatJson({ answer: smallTalkReply(message, locale), sources: [] }, 200, origin)
    if (call.name === "show_cv") return chatJson({ action: call.name, sources: [] }, 200, origin)
    let projectPages = null
    if (call.name === "search_blog" || call.name === "decline_unrelated") {
      try { projectPages = await publicProjects() } catch { /* Article search can still work. */ }
    }
    const knownProject = referencedProject(message, projectPages || [], locale)
    if (call.name === "decline_unrelated" && knownProject) {
      call = { ...call, name: "search_blog", arguments: JSON.stringify({ query: projectSlug(knownProject), browseProjects: false }) }
    }
    const routedOutput = (first.output || []).map((item) => item.type === "function_call" && item.call_id === call.call_id ? call : item)
    if (call.name === "decline_unrelated") {
      return chatJson({ answer: /[\u3400-\u9fff]/u.test(message)
        ? "我是 f，范松海的 AI 助手。我只回答与他、他的项目和文章有关的问题。"
        : "I'm f, Songhai Fan's AI assistant. I only answer questions about him, his projects, and his writing.", sources: [] }, 200, origin)
    }
    if (call.name !== "search_blog") throw new Error("Unknown tool call")
    const args = JSON.parse(call.arguments)
    const browseProjects = !knownProject && (args.browseProjects === true || isProjectBrowse(message))
    if (browseProjects) {
      if (!projectPages) return chatJson({ error: "The projects are temporarily unavailable." }, 502, origin)
      const projects = projectPages.filter((project) => project.locale === locale)
      if (!projects.length) return chatJson({ answer: locale === "zh" ? "目前没有公开的项目介绍。" : "There are no published project pages yet.", sources: [] }, 200, origin)
      const sources = projects.map((project, index) => ({ number: index + 1, title: project.title, url: project.url }))
      const evidence = projects.map((project, index) => ({
        number: index + 1, title: project.title, description: project.description,
        content: String(project.content || "").slice(0, 1400),
      }))
      const second = await openaiResponse(env.OPENAI_API_KEY, {
        instructions: `${F_ANSWER_INSTRUCTIONS}\n${answerLanguageInstruction}\nThe search_blog result contains the current published project pages. Give a real but very short overview. Strict limit: ONE Chinese sentence of at most 80 Chinese characters, or at most 45 English words. Name up to TWO representative projects and explain each in a short phrase with its [number] citation. Start with one broad theme. Do not name, enumerate, or describe the other projects; the visual cards provide the complete list. Do not add a final instruction to click the cards or any raw URL. Rewrite a longer draft before returning it.`,
        input: [...input, ...routedOutput, { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(evidence) }],
        max_output_tokens: 2500,
        reasoning: { effort: "low" },
      })
      const answer = answerText(second)
      if (!answer) throw new Error("Empty project answer")
      return chatJson({ action: "show_projects", answer, sources, projects: projects.map(({ title, description, url, image }) => ({ title, description, url, image })) }, 200, origin)
    }
    let posts = []
    try { posts = await publicPosts() } catch {
      if (!projectPages) return chatJson({ error: "The published work is temporarily unavailable." }, 502, origin)
    }
    const projectDocuments = (projectPages || [])
      .filter((project) => project.locale === locale && (!knownProject || projectSlug(project) === projectSlug(knownProject)))
      .map((project) => ({
        title: project.title, url: project.url, locale: project.locale,
        tags: [projectSlug(project)],
        content: `${project.description || ""}\n${project.content || ""}`,
      }))
    const query = String(knownProject ? projectSlug(knownProject) : args.query || "").slice(0, MAX_QUERY_LENGTH)
    const projectUrls = new Set(projectDocuments.map((project) => project.url))
    const matches = chatMatches([...posts, ...projectDocuments], query, 8).filter(({ post, score }) => {
      try {
        return new URL(post.url).origin === "https://blog.songhai.site"
          && (!projectUrls.has(post.url) || knownProject || score >= 4)
      } catch { return false }
    }).slice(0, 4)
    const sources = matches.map(({ post }, index) => ({
      number: index + 1,
      title: String(post.title || "Untitled"),
      url: String(post.url || ""),
      snippet: makeSnippet(String(post.content || ""), query.toLocaleLowerCase().split(/\s+/u), 180),
    }))
    if (!sources.length) return chatJson({ answer: /[\u3400-\u9fff]/u.test(message)
      ? "我不知道。范松海的公开文章和项目页面里没有足够信息回答这个问题。"
      : "I don't know. Songhai Fan's published posts and project pages don't give me enough to answer that.", sources: [] }, 200, origin)
    const evidence = matches.slice(0, sources.length).map(({ post }, index) => ({
      number: index + 1, title: sources[index].title, url: sources[index].url,
      content: String(post.content || "").slice(0, 5000),
    }))
    const second = await openaiResponse(env.OPENAI_API_KEY, {
      instructions: `${F_ANSWER_INSTRUCTIONS}\n${answerLanguageInstruction}\nCite only source numbers present in the search_blog result. The result may contain blog posts and project pages. Do not output raw URLs.`,
      input: [...input, ...routedOutput, { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(evidence) }],
      max_output_tokens: 3000,
      reasoning: { effort: "low" },
    })
    const answer = answerText(second)
    if (!answer) throw new Error("Empty answer")
    const matchedProjectUrls = new Set(matches.map(({ post }) => post.url))
    const projects = (projectPages || []).filter((project) => project.locale === locale && matchedProjectUrls.has(project.url))
      .map(({ title, description, url, image }) => ({ title, description, url, image }))
    return chatJson(projects.length ? { action: "show_projects", answer, sources, projects } : { answer, sources }, 200, origin)
  } catch (error) {
    console.error("Chat failed", error instanceof Error ? error.message : "unknown")
    return chatJson({ error: "I couldn't answer right now. Please try again shortly." }, 502, origin)
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url)
    if (url.pathname === "/chat") {
      const origin = request.headers.get("Origin")
      if (request.method === "OPTIONS") return origin && CHAT_ORIGINS.has(origin)
        ? new Response(null, { status: 204, headers: chatCors(origin) })
        : new Response(null, { status: 403 })
      if (request.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405, { Allow: "POST, OPTIONS", "Cache-Control": "no-store" }, {})
      return handleChat(request, env, origin)
    }
    if (url.pathname === "/contact") {
      const origin = request.headers.get("Origin")
      if (request.method === "OPTIONS") return origin && CHAT_ORIGINS.has(origin)
        ? new Response(null, { status: 204, headers: chatCors(origin) })
        : new Response(null, { status: 403 })
      if (request.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405, { Allow: "POST, OPTIONS", "Cache-Control": "no-store" }, {})
      return handleContact(request, env, origin)
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
    if (request.method !== "GET") return json({ error: "Method not allowed. Use GET." }, 405, { Allow: "GET, OPTIONS" })
    if (url.pathname === "/projects") {
      const locale = url.searchParams.get("lang") || "en"
      if (!["en", "zh"].includes(locale)) return json({ error: "lang must be en or zh." }, 400)
      try {
        const projects = (await publicProjects()).filter((project) => project.locale === locale)
        return json({ projects: projects.map(({ title, description, url: href, image }) => ({ title, description, url: href, image })) })
      } catch { return json({ error: "The projects are temporarily unavailable." }, 502) }
    }
    if (url.pathname !== "/search") return json({ error: "Not found. Use /search?q=keyword or /projects?lang=en." }, 404)

    const query = (url.searchParams.get("q") || "").trim()
    if (!query) return json({ error: "Missing query. Provide q=keyword." }, 400)
    if (query.length > MAX_QUERY_LENGTH) return json({ error: `Query must be ${MAX_QUERY_LENGTH} characters or fewer.` }, 400)

    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10)
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return json({ error: "limit must be an integer from 1 to 20." }, 400)
    }
    const limit = Math.min(requestedLimit, MAX_LIMIT)

    let indexResponse
    try {
      indexResponse = await fetch(INDEX_URL, { cf: { cacheTtl: 300, cacheEverything: true } })
    } catch {
      return json({ error: "The blog search index is temporarily unavailable." }, 502)
    }
    if (!indexResponse.ok) return json({ error: "The blog search index is temporarily unavailable." }, 502)

    let index
    try {
      index = await indexResponse.json()
    } catch {
      return json({ error: "The blog search index returned invalid JSON." }, 502)
    }

    const rankedMatches = searchPosts(Array.isArray(index.posts) ? index.posts : [], query, Number.MAX_SAFE_INTEGER)
    const matches = rankedMatches.slice(0, limit)
    const includeContent = url.searchParams.get("include") === "content"
    return json({
      query,
      total: rankedMatches.length,
      limit,
      results: matches.map(({ post, score }) => ({
        id: post.id,
        title: post.title,
        locale: post.locale,
        date: post.date,
        tags: post.tags,
        url: post.url,
        score,
        snippet: makeSnippet(post.content, query.toLocaleLowerCase().split(/\s+/u)),
        ...(includeContent ? { content: post.content } : {}),
      })),
    })
  },
}
