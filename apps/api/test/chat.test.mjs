import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import worker from '../src/index.js'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })

test('chat searches public posts and returns verified citation URLs', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('projects.json')) return Response.json({ projects: [] })
    if (url.includes('search-index.json')) return Response.json({ posts: [
      { title: 'Causal Graphs', url: 'https://blog.songhai.site/en/blog/posts/causal-graphs', content: 'I use causal graphs to understand data.', tags: ['visualization'] },
      { title: 'Untrusted', url: 'https://example.com/evil', content: 'causal graphs', tags: [] },
    ] })
    if (calls.filter((call) => call.url.includes('/v1/responses')).length === 1) {
      return Response.json({ output: [{ type: 'function_call', name: 'search_blog', call_id: 'call-1', arguments: '{"query":"causal graphs","browseProjects":false}' }] })
    }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Frank writes about causal graphs [1].' }] }] })
  }
  const request = new Request('https://api.songhai.site/chat', {
    method: 'POST',
    headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify({ message: 'What did Frank write about causal graphs?' }),
  })
  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://songhai.site')
  const data = await response.json()
  assert.equal(data.answer, 'Frank writes about causal graphs [1].')
  assert.equal(data.sources.length, 1)
  assert.equal(data.sources[0].number, 1)
  assert.equal(data.sources[0].title, 'Causal Graphs')
  assert.equal(data.sources[0].url, 'https://blog.songhai.site/en/blog/posts/causal-graphs')
  assert.match(data.sources[0].snippet, /causal graphs/)
  assert.equal(data.action, undefined)
  assert.equal(data.projects, undefined)
  const finalCall = JSON.parse(calls.at(-1).options.body)
  assert.equal(finalCall.store, false)
  assert.match(finalCall.instructions, /Reply only in English/)
  assert.match(finalCall.instructions, /Never say 'I wrote'/)
  assert.equal(finalCall.input.at(-1).type, 'function_call_output')
  assert.equal(JSON.parse(finalCall.input.at(-1).output).length, 1)
})

test('a weak keyword overlap does not turn an article answer into a project card', async () => {
  let modelCalls = 0
  globalThis.fetch = async (url, options) => {
    if (url.includes('projects.json')) return Response.json({ projects: [
      { locale: 'en', title: 'Narrative Graph', description: 'A project about interactive data.', content: 'Research uses visualization tools.', url: 'https://blog.songhai.site/projects/narrative-graph', image: 'https://blog.songhai.site/images/projects/narrative-graph.jpg' },
    ] })
    if (url.includes('search-index.json')) return Response.json({ posts: [
      { title: 'Getting Started with Data Visualization in Python', url: 'https://blog.songhai.site/en/blog/posts/python-visualization', content: 'Python visualization begins with charts.', tags: ['Python'] },
      { title: 'Unrelated note', url: 'https://blog.songhai.site/en/blog/posts/unrelated', content: 'A passing mention of Python.', tags: [] },
    ] })
    modelCalls += 1
    if (modelCalls === 1) return Response.json({ output: [{ type: 'function_call', name: 'search_blog', call_id: 'article-call', arguments: '{"query":"Python visualization","browseProjects":false}' }] })
    const evidence = JSON.parse(JSON.parse(options.body).input.at(-1).output)
    assert.deepEqual(evidence.map((source) => source.title), ['Getting Started with Data Visualization in Python'])
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'The article introduces Python charts [1].' }] }] })
  }
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' },
    body: '{"message":"What did you write about Python visualization?"}',
  }), { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.action, undefined)
  assert.equal(data.projects, undefined)
  assert.equal(data.sources.length, 1)
  assert.match(data.answer, /\[1\]/)
})

test('small talk briefly explains f and does not retrieve the blog', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    return Response.json({ output: [{ type: 'function_call', name: 'small_talk', call_id: 'hello-call', arguments: '{}' }] })
  }
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' },
    body: '{"message":"Hi, how are you?"}',
  }), { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.match(data.answer, /Doing well, thanks/)
  assert.match(data.answer, /projects or CV/)
  assert.match(data.answer, /original posts/)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /api.openai.com/)
})

test('model can choose a predefined CV action without searching the blog', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    return Response.json({ output: [{ type: 'function_call', name: 'show_cv', call_id: 'call-cv', arguments: '{}' }] })
  }
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' }, body: '{"message":"Could you bring up your résumé?"}',
  }), { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).action, 'show_cv')
  assert.equal(calls.length, 1)
  assert.match(calls[0], /api.openai.com/)
})

test('project overview is grounded in published project pages and returns visual cards', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('projects.json')) return Response.json({ projects: [
      { locale: 'zh', title: '叙事图', description: '探索新闻叙事的发展。', content: '公开项目详情', url: 'https://blog.songhai.site/zh/projects/ttng', image: 'https://blog.songhai.site/images/projects/ttng.jpg' },
      { locale: 'en', title: 'Narrative Graph', description: 'Explore news narratives.', content: 'Public details', url: 'https://blog.songhai.site/projects/ttng', image: 'https://blog.songhai.site/images/projects/ttng.jpg' },
    ] })
    if (calls.filter((call) => call.url.includes('/v1/responses')).length === 1) {
      return Response.json({ output: [{ type: 'function_call', name: 'search_blog', call_id: 'project-call', arguments: '{"query":"projects","browseProjects":true}' }] })
    }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '叙事图展示新闻故事如何展开 [1]。' }] }] })
  }
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' }, body: '{"message":"简单介绍一下这些项目"}',
  }), { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.action, 'show_projects')
  assert.match(data.answer, /展示新闻故事如何展开/)
  assert.equal(data.projects.length, 1)
  assert.equal(data.projects[0].title, '叙事图')
  assert.equal(data.sources[0].url, data.projects[0].url)
  assert.match(JSON.parse(calls.at(-1).options.body).instructions, /Reply only in Simplified Chinese/)
  assert.match(JSON.stringify(JSON.parse(calls.at(-1).options.body).input.at(-1)), /探索新闻叙事的发展/)
  assert.equal(calls.filter((call) => call.url.includes('search-index.json')).length, 0)
})

test('a named project follow-up searches published evidence instead of declining', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('projects.json')) return Response.json({ projects: [
      { locale: 'en', title: 'Time-Track Narrative Graph', description: 'A model for news narratives.', content: 'TTNG tracks narrative themes over time.', url: 'https://blog.songhai.site/projects/ttng', image: 'https://blog.songhai.site/images/projects/ttng.jpg' },
    ] })
    if (url.includes('search-index.json')) return Response.json({ posts: [
      { locale: 'zh', title: 'TTNG研究的三个阶段', url: 'https://blog.songhai.site/zh/blog/posts/ttng', content: 'TTNG research has three stages.', tags: ['TTNG'] },
    ] })
    if (calls.filter((entry) => entry.url.includes('/v1/responses')).length === 1) {
      return Response.json({ output: [{ type: 'function_call', name: 'search_blog', call_id: 'ttng-call', arguments: '{"query":"ttng","browseProjects":false}' }] })
    }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'TTNG maps news narratives over time [1].' }] }] })
  }
  const history = [
    { role: 'user', content: 'Show me your projects' },
    { role: 'assistant', content: 'Shown project cards: Time-Track Narrative Graph (ttng)' },
  ]
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'what do you know about ttng', history }),
  }), { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.match(data.answer, /news narratives/)
  assert.ok(data.sources.some((source) => source.url === 'https://blog.songhai.site/projects/ttng'))
  assert.equal(data.action, 'show_projects')
  assert.deepEqual(data.projects.map((project) => project.title), ['Time-Track Narrative Graph'])
  const modelCalls = calls.filter((entry) => entry.url.includes('/v1/responses'))
  assert.equal(JSON.parse(modelCalls[0].options.body).tool_choice, 'required')
  assert.deepEqual(JSON.parse(modelCalls[0].options.body).input.slice(0, 2), history)
  assert.match(JSON.parse(modelCalls[1].options.body).instructions, /Answer the visitor's latest question directly/)
  assert.doesNotMatch(JSON.parse(modelCalls[1].options.body).instructions, /Choose exactly one tool/)
})

test('a known project name overrides an incorrect unrelated classification', async () => {
  let modelCalls = 0
  globalThis.fetch = async (url, options) => {
    if (url.includes('projects.json')) return Response.json({ projects: [
      { locale: 'en', title: 'Time-Track Narrative Graph', description: 'A news narrative project.', content: 'TTNG tracks stories over time.', url: 'https://blog.songhai.site/projects/ttng', image: 'https://blog.songhai.site/images/projects/ttng.jpg' },
    ] })
    if (url.includes('search-index.json')) return Response.json({ posts: [] })
    modelCalls += 1
    if (modelCalls === 1) return Response.json({ output: [{ type: 'function_call', name: 'decline_unrelated', call_id: 'decline-call', arguments: '{}' }] })
    const request = JSON.parse(options.body)
    assert.equal(request.input.at(-2).name, 'search_blog')
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'TTNG tracks stories over time [1].' }] }] })
  }
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' },
    body: '{"message":"What is TTNG?"}',
  }), { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.action, 'show_projects')
  assert.equal(data.projects.length, 1)
  assert.match(data.answer, /TTNG tracks/)
})

test('chat keeps the latest ten turns with a multi-byte conversation', async () => {
  let modelInput
  globalThis.fetch = async (url, options) => {
    if (url.includes('projects.json')) return Response.json({ projects: [] })
    modelInput = JSON.parse(options.body).input
    return Response.json({ output: [{ type: 'function_call', name: 'decline_unrelated', call_id: 'decline-call', arguments: '{}' }] })
  }
  const history = Array.from({ length: 22 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `turn ${Math.floor(index / 2) + 1} ${'研究'.repeat(150)}`,
  }))
  const body = JSON.stringify({ message: 'What did I ask before?', history })
  assert.ok(Buffer.byteLength(body) > 6500)
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' }, body,
  }), { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  assert.equal(modelInput.length, 21)
  assert.match(modelInput[0].content, /^turn 2 /)
  assert.match(modelInput.at(-2).content, /^turn 11 /)
  assert.equal(modelInput.at(-1).content, 'What did I ask before?')
})

test('public projects endpoint reads the published index', async () => {
  globalThis.fetch = async () => Response.json({ projects: [
    { locale: 'en', title: 'Public project', url: 'https://blog.songhai.site/projects/public', image: 'https://blog.songhai.site/images/projects/public.jpg' },
    { locale: 'en', title: 'Untrusted project', url: 'https://example.com/projects/evil', image: 'https://example.com/evil.jpg' },
  ] })
  const response = await worker.fetch(new Request('https://api.songhai.site/projects?lang=en'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).projects.length, 1)
})

test('contact sends only to the configured address and reports confirmed success', async () => {
  let call
  globalThis.fetch = async (url, options) => {
    call = { url, options }
    return Response.json({ id: 'accepted-email-id' })
  }
  const response = await worker.fetch(new Request('https://api.songhai.site/contact', {
    method: 'POST', headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Visitor', email: 'visitor@example.com', message: 'Hello Songhai', website: '' }),
  }), {
    RESEND_API_KEY: 'test-only',
    CONTACT_RATE_LIMIT: { limit: async () => ({ success: true }) },
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).sent, true)
  assert.equal(call.url, 'https://api.resend.com/emails')
  assert.equal(call.options.headers.Authorization, 'Bearer test-only')
  const sent = JSON.parse(call.options.body)
  assert.equal(sent.from, 'Songhai Fan website <contact@mail.songhai.site>')
  assert.deepEqual(sent.to, ['songhai.fan2022@gmail.com'])
  assert.equal(sent.reply_to, 'visitor@example.com')
  assert.match(sent.text, /Hello Songhai/)
})

test('contact rejects invalid messages and does not claim success on delivery failure', async () => {
  const headers = { Origin: 'https://songhai.site', 'Content-Type': 'application/json' }
  const invalid = await worker.fetch(new Request('https://api.songhai.site/contact', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Visitor', email: 'invalid', message: 'Hello' }),
  }), {})
  assert.equal(invalid.status, 400)
  globalThis.fetch = async () => Response.json({ name: 'validation_error' }, { status: 422 })
  const failed = await worker.fetch(new Request('https://api.songhai.site/contact', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Visitor', email: 'visitor@example.com', message: 'Hello' }),
  }), {
    RESEND_API_KEY: 'test-only',
    CONTACT_RATE_LIMIT: { limit: async () => ({ success: true }) },
  })
  assert.equal(failed.status, 502)
  assert.equal((await failed.json()).sent, undefined)
  globalThis.fetch = async () => Response.json({})
  const unconfirmed = await worker.fetch(new Request('https://api.songhai.site/contact', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Visitor', email: 'visitor@example.com', message: 'Hello' }),
  }), {
    RESEND_API_KEY: 'test-only',
    CONTACT_RATE_LIMIT: { limit: async () => ({ success: true }) },
  })
  assert.equal(unconfirmed.status, 502)
  assert.equal((await unconfirmed.json()).sent, undefined)
})

test('chat refuses other origins before using the API key', async () => {
  const response = await worker.fetch(new Request('https://api.songhai.site/chat', {
    method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{"message":"hello"}',
  }), {})
  assert.equal(response.status, 403)
})

test('existing search endpoint stays public and GET based', async () => {
  globalThis.fetch = async () => Response.json({ posts: [{ title: 'Causal Graphs', url: 'https://blog.songhai.site/post', content: 'causal graphs', tags: [] }] })
  const response = await worker.fetch(new Request('https://api.songhai.site/search?q=causal'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).total, 1)
})

test('an answer cut off by the reasoning budget is retried with more room, not returned half-finished', async () => {
  const budgets = []
  globalThis.fetch = async (url, options) => {
    if (url.includes('projects.json')) return Response.json({ projects: [] })
    if (url.includes('search-index.json')) return Response.json({ posts: [
      { title: 'Causal Graphs', url: 'https://blog.songhai.site/en/blog/posts/causal-graphs', content: 'I use causal graphs to understand data.', tags: [] },
    ] })
    const body = JSON.parse(options.body)
    budgets.push(body.max_output_tokens)
    if (budgets.length === 1) return Response.json({ output: [{ type: 'function_call', name: 'search_blog', call_id: 'c', arguments: '{"query":"causal graphs","browseProjects":false}' }] })
    if (budgets.length === 2) return Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Frank writes' }] }] })
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Frank writes about causal graphs [1].' }] }] })
  }
  const request = new Request('https://api.songhai.site/chat', {
    method: 'POST',
    headers: { Origin: 'https://songhai.site', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What did Frank write about causal graphs?' }),
  })
  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-only', CHAT_RATE_LIMIT: { limit: async () => ({ success: true }) } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).answer, 'Frank writes about causal graphs [1].')
  assert.equal(budgets[2], budgets[1] * 2)
})
