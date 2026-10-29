const stage = document.querySelector('#stage');
const conversation = document.querySelector('#conversation');
const opening = document.querySelector('.opening');
const form = document.querySelector('#composer');
const input = document.querySelector('#message');
const resetButton = document.querySelector('#reset');
const startButton = document.querySelector('#start-conversation');
const emailButton = document.querySelector('#start-email');
const chooseSonghai = document.querySelector('#choose-songhai');
const letterDialog = document.querySelector('#letter');
const letterForm = document.querySelector('#letter-form');
const letterMessage = document.querySelector('#letter-message');
const letterStatus = document.querySelector('#letter-status');
const letterSend = letterForm.querySelector('.letter-send');
let letterNote = letterStatus.textContent;
const emailName = document.querySelector('#email-name');
const emailAddress = document.querySelector('#email-address');
const emailWebsite = document.querySelector('#email-website');
const composerStatus = document.querySelector('#composer-status');
const sendButton = form.querySelector('.send-button');
const suggestionButtons = document.querySelectorAll('.suggestions button');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const introVideo = document.querySelector('.opening-video');
const cvUrl = '/assets/Songhai_Fan_Resume_2026.pdf';
const blogOrigin = document.querySelector('meta[name="songhai-blog-origin"]')?.content || 'https://blog.songhai.site';
const blogUrl = (url) => url.replace(/^https:\/\/blog\.songhai\.site(?=\/|$)/, blogOrigin);

const chatUrl = 'https://api.songhai.site/chat';
const contactUrl = 'https://api.songhai.site/contact';
const maxAiHistoryMessages = 20;
let aiHistory = [];
let pending = false;
let activeRequest;
let letterSending = false;
let language = 'en';
const languageToggle = document.querySelector('#language-toggle');
const localReplies = new Map();
const translatedNodes = [...document.querySelectorAll('[data-zh]')].map((node) => [node, node.innerHTML]);
const translatedAttributes = ['aria-label', 'placeholder', 'prompt'].flatMap((attribute) =>
  [...document.querySelectorAll(`[data-zh-${attribute}]`)].map((node) => [node, attribute === 'prompt' ? 'data-prompt' : attribute, node.getAttribute(attribute === 'prompt' ? 'data-prompt' : attribute), node.getAttribute(`data-zh-${attribute}`)]));
const uiText = (english, chinese) => language === 'zh' ? chinese : english;

function applyLanguage(next, remember = false) {
  if (remember) finishIntro();
  language = next === 'zh' ? 'zh' : 'en';
  const chinese = language === 'zh';
  document.documentElement.lang = chinese ? 'zh-CN' : 'en';
  document.dispatchEvent(new CustomEvent('songhai:language'));
  document.title = chinese ? '范松海 · 聊聊作品与想法' : 'Songhai Fan · A conversation';
  // These fragments are trusted static markup from index.html, never user input.
  translatedNodes.forEach(([node, english]) => { node.innerHTML = chinese ? node.dataset.zh : english; });
  translatedAttributes.forEach(([node, attribute, english, zh]) => node.setAttribute(attribute, chinese ? zh : english));
  document.querySelector('.journal-link').href = chinese ? `${blogOrigin}/zh/` : `${blogOrigin}/`;
  document.querySelector('.wordmark').href = chinese ? '/?lang=zh' : '/?lang=en';
  languageToggle.textContent = chinese ? 'English' : '中文';
  languageToggle.lang = chinese ? 'en' : 'zh-CN';
  languageToggle.setAttribute('aria-label', chinese ? 'Switch to English' : '切换到中文');
  letterNote = uiText('Your email address is used only so I can reply.', '你的邮箱只用于回复这封信。');
  if (!letterSending && !letterStatus.classList.contains('is-error')) letterStatus.textContent = letterNote;
  letterSend.textContent = letterSending ? uiText('Posting…', '正在寄出…') : uiText('Post letter', '寄出');
  document.querySelectorAll('.assistant-label').forEach((node) => { node.textContent = uiText('f · AI FRIEND', 'f · AI 朋友'); });
  setBusy(form.dataset.busy || false);
  for (const [container, topic] of localReplies) {
    const body = el('div', 'localized-reply');
    container.replaceChildren(body);
    localRenderers[topic](body, chinese, true);
  }
  if (remember) {
    try { localStorage.setItem('frank-language', language); } catch {}
    const url = new URL(location.href);
    url.searchParams.set('lang', language);
    history.replaceState(null, '', url);
  }
}


function playIntroVideo() {
  if (!introVideo || reduceMotion.matches || stage.classList.contains('has-conversation')) return;
  introVideo.closest('.opening-media')?.classList.remove('is-hidden');
  if (introVideo.ended) introVideo.currentTime = 0;
  introVideo.play().catch(stopIntroVideo);
}

// Pausing alone leaves a frozen frame on screen, so stopping always hides it too.
function stopIntroVideo() {
  if (!introVideo) return;
  introVideo.pause();
  introVideo.closest('.opening-media')?.classList.remove('is-playing');
  introVideo.closest('.opening-media')?.classList.add('is-hidden');
}

let introTimer;
function finishIntro() {
  clearTimeout(introTimer);
  document.documentElement.classList.remove('intro-active');
  stopIntroVideo();
}

function startFirstIntro(replay = false) {
  let seen = false;
  try { seen = localStorage.getItem('frank-intro-seen') === '1'; } catch {}
  if ((!replay && seen) || reduceMotion.matches) return;
  finishIntro();
  if (introVideo) introVideo.currentTime = 0;
  // Commit the cleared animation state before replaying the introduction.
  void opening.offsetWidth;
  try { localStorage.setItem('frank-intro-seen', '1'); } catch {}
  document.documentElement.classList.add('intro-active');
  introTimer = setTimeout(playIntroVideo, 120);
}
introVideo?.addEventListener('playing', () => {
  introVideo.closest('.opening-media')?.classList.add('is-playing');
});
introVideo?.addEventListener('ended', finishIntro);
reduceMotion.addEventListener('change', (event) => { if (event.matches) finishIntro(); });

// ── halftone ──
// The portrait is drawn as a halftone instead of shown as video: each frame
// is shrunk to a coarse grid, and every cell becomes one ink dot whose size
// follows how dark that part of the frame is. Rows are offset by half a cell,
// as in printed halftone. The near-white studio background falls below the
// threshold and drops out, so the dots sit straight on the page's paper.
// Technique after Louis Hoebregts' halftone video demo (MIT).
function setupHalftone(video) {
  const media = video?.closest('.opening-media');
  if (!media || reduceMotion.matches) return;
  const canvas = el('canvas', 'opening-halftone');
  canvas.setAttribute('aria-hidden', 'true');
  media.append(canvas);
  const ctx = canvas.getContext('2d');
  const sample = document.createElement('canvas');
  const sctx = sample.getContext('2d', { willReadFrequently: true });
  const cell = 6;
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1b1a18';
  let cols = 0;
  let rows = 0;
  let scale = 1;
  let radii = new Float32Array(0);
  let frame = 0;

  const resize = () => {
    const { width, height } = media.getBoundingClientRect();
    scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    cols = Math.max(1, Math.floor(width / cell));
    rows = Math.max(1, Math.floor(height / cell));
    sample.width = cols;
    sample.height = rows;
    radii = new Float32Array(cols * rows);
  };

  const draw = () => {
    frame = 0;
    if (video.paused || video.ended || !video.videoWidth) return;
    // fit the frame inside the grid the way object-fit: contain + bottom does
    const fit = Math.min(cols / video.videoWidth, rows / video.videoHeight);
    const w = video.videoWidth * fit;
    const h = video.videoHeight * fit;
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, cols, rows);
    sctx.drawImage(video, (cols - w) / 2, rows - h, w, h);
    const data = sctx.getImageData(0, 0, cols, rows).data;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, cols * cell, rows * cell);
    ctx.fillStyle = ink;
    ctx.beginPath();
    for (let y = 0; y < rows; y += 1) {
      const offset = y % 2 ? cell / 2 : 0;
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const lum = (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255;
        // the background sits just under white; anything that light is paper
        const dark = Math.max(0, (1 - lum - 0.1) / 0.9);
        const target = Math.pow(dark, 0.8) * cell * 0.62;
        radii[i] += (target - radii[i]) * 0.35;
        const r = radii[i];
        if (r < 0.25) continue;
        const cx = x * cell + cell / 2 + offset;
        const cy = y * cell + cell / 2;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    media.classList.add('is-halftone');
    frame = requestAnimationFrame(draw);
  };

  const start = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  resize();
  new ResizeObserver(resize).observe(media);
  video.addEventListener('play', start);
  video.addEventListener('playing', start);
  if (!video.paused) start();
}

setupHalftone(introVideo);


function rememberAiTurn(message, answer) {
  aiHistory.push(
    { role: 'user', content: message.slice(0, 500) },
    { role: 'assistant', content: answer.slice(0, 800) },
  );
  aiHistory = aiHistory.slice(-maxAiHistoryMessages);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(label, href, className = 'assistant-link') {
  href = blogUrl(href);
  const node = el('a', className, label);
  node.href = href;
  if (href.startsWith('https://') || href.endsWith('.pdf')) {
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}

function copy(target, text, className = 'assistant-copy') {
  target.append(el('p', className, text));
}

function classify(message) {
  const text = message.trim().toLowerCase().replace(/[?？。.！!]$/u, '');
  // Quick asks speak about Songhai in the third person, since the visitor is
  // talking to f; the older second-person phrasings still route the same way.
  const whose = "(?:your|his|songhai(?: fan)?['’]?s)";
  if (new RegExp(`^(show me ${whose} (cv|resume)|cv|resume|résumé|给我看看你的简历|看看你的简历|看看他的简历|范松海的简历|给我简历|简历)$`, 'u').test(text)) return 'cv';
  if (/^(tell me about (yourself|him|songhai( fan)?)|who is songhai( fan)?|about|about you|about songhai( fan)?|介绍一下你自己|介绍一下范松海|关于你|关于范松海|你是谁|范松海是谁)$/u.test(text)) return 'about';
  if (new RegExp(`^(show me ${whose} projects|projects|portfolio|看看范松海的项目|范松海的项目|他的项目|你的项目|项目|作品)$`, 'u').test(text)) return 'projects';
  if (new RegExp(`^(show me ${whose} notes|where can i read ${whose} writing|notes|writing|blog|journal|看看范松海的随笔|范松海的随笔|他的随笔|随笔|文章|博客|你的文章|他的文章)$`, 'u').test(text)) return 'notes';
  if (/^(contact|email|联系方式|联系你)$/u.test(text)) return 'contact';
  if (/^(hi|hello|hey|hi f|hello f|你好|您好|嗨|哈喽)$/u.test(text)) return 'greeting';
  return 'ai';
}

function renderProjects(target, projects) {
  const grid = el('div', 'project-grid');
  projects.forEach((project, index) => {
    const card = link('', project.url, 'project-tile');
    card.style.setProperty('--order', String(index));
    card.setAttribute('aria-label', `${project.title} project details`);
    const image = el('img');
    image.src = blogUrl(project.image);
    image.alt = '';
    image.loading = index < 3 ? 'eager' : 'lazy';
    image.width = 1000;
    image.height = 1000;
    card.append(image, el('span', 'tile-title', project.title));
    grid.append(card);
  });
  target.append(grid);
}

function renderCv(target, chinese, assistant = false) {
  copy(target, assistant
    ? (chinese ? '这是范松海的简历。' : "Here is Songhai Fan's CV.")
    : (chinese ? '这是我的简历。' : 'Here is my CV.'));
  // One sheet of paper and a caption: the page preview already says whose CV
  // it is, so there is no frame around it and no header above it.
  const card = el('figure', 'cv-card');
  const previewLink = link('', cvUrl, 'cv-preview-link');
  previewLink.setAttribute('aria-label', chinese ? '打开完整简历 PDF' : 'Open the full CV PDF');
  const preview = el('img', 'cv-preview');
  preview.src = '/assets/cv-preview.png';
  preview.alt = chinese ? '简历 PDF 的第一页预览' : 'Preview of the first page of the CV PDF';
  preview.width = 840;
  preview.height = 1188;
  previewLink.append(preview);
  const caption = el('figcaption', 'cv-caption');
  const title = el('span', 'cv-title', chinese ? '范松海 · 简历' : 'Songhai Fan · CV');
  title.append(el('small', '', 'PDF · 2026'));
  const actions = el('span', 'cv-links');
  const download = link(chinese ? '下载 ↓' : 'Download ↓', cvUrl, 'cv-link');
  download.removeAttribute('target');
  download.setAttribute('download', 'Songhai_Fan_Resume_2026.pdf');
  actions.append(link(chinese ? '打开' : 'Open', cvUrl, 'cv-link'), download);
  caption.append(title, actions);
  card.append(previewLink, caption);
  target.append(card);
}

// A small profile card in the same quiet register as the CV: the portrait
// as a photo, not a banner, and the facts set out as labelled lines.
function renderAbout(target, chinese) {
  copy(target, chinese ? '范松海是一名 AI 产品研究者，也叫 Frank。' : 'Songhai Fan is an AI product researcher. You can call him Frank.');
  const card = el('figure', 'about-card');
  const image = el('img', 'about-photo');
  image.src = '/assets/profile.png';
  image.alt = chinese ? '范松海的照片' : 'Portrait of Songhai Fan';
  image.width = 570;
  image.height = 570;
  const body = el('figcaption', 'about-body');
  const name = el('p', 'about-name', chinese ? '范松海 ' : 'Songhai Fan ');
  name.append(el('span', '', 'Frank'));
  const facts = el('dl', 'about-facts');
  [
    [chinese ? '方向' : 'Focus', chinese ? '人机交互、数据可视化、AI 原型' : 'Human–AI interaction, visualisation, AI prototyping'],
    [chinese ? '学历' : 'Study', chinese ? '莫纳什大学 以人为本计算 博士' : 'PhD, Human-Centred Computing, Monash'],
  ].forEach(([term, detail]) => facts.append(el('dt', '', term), el('dd', '', detail)));
  const links = el('p', 'cv-links about-links');
  const projectsButton = el('button', 'cv-link', chinese ? '看看项目' : 'See projects');
  projectsButton.type = 'button';
  projectsButton.addEventListener('click', () => ask(chinese ? '看看范松海的项目' : 'Show me Songhai’s projects'));
  const notesButton = el('button', 'cv-link', chinese ? '读他的随笔' : 'Read his notes');
  notesButton.type = 'button';
  notesButton.addEventListener('click', () => ask(chinese ? '看看范松海的随笔' : 'Show me Songhai’s notes'));
  links.append(projectsButton, notesButton);
  body.append(
    name,
    el('p', 'about-role', chinese ? 'AI 产品研究者 · 墨尔本' : 'AI product researcher · Melbourne'),
    el('p', 'about-bio', chinese
      ? '他研究以人为本的 AI、数据可视化与交互设计，喜欢把复杂问题变成可以探索的界面。'
      : 'He works across human-centred AI, data visualisation and interaction design, turning complex questions into interfaces people can explore.'),
    facts,
    links,
  );
  card.append(image, body);
  target.append(card);
}

// The latest notes, read from the blog's own public index so new writing
// shows up here as soon as the blog publishes it. The index holds projects
// too, so only entries typed as notes count; undated drafts are left out.
const postsUrl = `${blogOrigin}/api/search-index.json`;
let recentPostsRequest;

function recentPosts() {
  recentPostsRequest ??= fetch(postsUrl)
    .then((response) => {
      if (!response.ok) throw new Error('Journal index unavailable');
      return response.json();
    })
    .then((index) => {
      const notes = (Array.isArray(index.posts) ? index.posts : [])
        .filter((post) => post.type === 'note' && post.date && post.title && post.url && !/^untitled/i.test(post.title))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      return notes;
    })
    .catch((error) => {
      recentPostsRequest = undefined;
      throw error;
    });
  return recentPostsRequest;
}

// the first line of a post, with the Markdown punctuation taken out
function excerpt(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function renderNotes(target, chinese) {
  copy(target, chinese ? '这些是范松海最近的中文随笔：' : "These are Songhai's recent English notes:");
  const list = el('ol', 'post-list');
  const loading = el('li', 'post-loading', chinese ? '正在读取随笔…' : 'Reading notes…');
  list.append(loading);
  const more = el('p', 'cv-links post-more');
  more.append(link(chinese ? '在博客中查看全部随笔' : 'All notes in the Blog', chinese ? `${blogOrigin}/zh/?type=note` : `${blogOrigin}/?type=note`, 'cv-link'));
  target.append(list, more);
  const dateFormat = new Intl.DateTimeFormat(chinese ? 'zh-CN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  recentPosts().then((allPosts) => {
    const posts = allPosts.filter((post) => post.locale === (chinese ? 'zh' : 'en')).slice(0, 5);
    if (!posts.length) throw new Error('No dated posts');
    list.replaceChildren(...posts.map((post, index) => {
      const item = el('li', 'post-item');
      item.style.setProperty('--order', String(index));
      const row = link('', post.url, 'post-link');
      const date = el('time', 'post-date', dateFormat.format(new Date(post.date)));
      date.dateTime = post.date;
      const title = el('span', 'post-title', post.title);
      title.append(el('small', 'post-lang', post.locale === 'zh' ? '中文' : 'English'));
      row.append(date, title);
      const line = excerpt(post.content);
      if (line) row.append(el('span', 'post-excerpt', line));
      item.append(row);
      return item;
    }));
  }).catch(() => {
    list.remove();
  });
}

// Read the blog index directly so language fallback retains editorial order.
const projectsUrl = `${blogOrigin}/api/projects.json`;
let projectsRequest;

async function publicProjects(locale) {
  projectsRequest ??= fetch(projectsUrl)
    .then((response) => {
      if (!response.ok) throw new Error('Projects unavailable');
      return response.json();
    })
    .then((data) => (Array.isArray(data.projects) ? data.projects : [])
      .filter((project) => ['en', 'zh'].includes(project.locale) && project.title && project.url && project.image))
    .catch((error) => {
      projectsRequest = undefined;
      throw error;
    });
  const projects = await projectsRequest;
  const selected = new Map();
  // Paired project pages share a slug. Prefer the requested translation.
  for (const project of projects) {
    const key = decodeURIComponent(new URL(project.url).pathname).replace(/^\/zh\//, '/').replace(/\/$/, '');
    if (!selected.has(key) || project.locale === locale) selected.set(key, project);
  }
  const order = (project) => project.order != null && String(project.order).trim() !== '' && Number.isFinite(Number(project.order))
    ? Number(project.order) : Infinity;
  return [...selected.values()].sort((a, b) => {
    const aOrder = order(a);
    const bOrder = order(b);
    return aOrder === bOrder ? a.title.localeCompare(b.title, locale) : aOrder - bOrder;
  });
}

function renderProjectList(target, chinese) {
  copy(target, chinese ? '这些是范松海的项目：' : "These are Songhai's projects:");
  const loading = el('p', 'post-loading', chinese ? '正在读取项目…' : 'Fetching the projects…');
  const more = el('p', 'cv-links post-more');
  more.append(link(chinese ? '在博客中查看全部项目' : 'All projects in the Blog', chinese ? `${blogOrigin}/zh/?type=project` : `${blogOrigin}/?type=project`, 'cv-link'));
  target.append(loading, more);
  publicProjects(chinese ? 'zh' : 'en').then((projects) => {
    if (!projects.length) throw new Error('No projects');
    const list = el('ol', 'post-list project-list');
    const items = projects.map((project) => {
      const item = el('li', 'project-list-item');
      const row = link('', project.url, 'project-list-link');
      const image = el('img', 'project-list-image');
      image.alt = '';
      image.width = 160;
      image.height = 120;
      image.loading = 'lazy';
      image.addEventListener('error', () => { image.hidden = true; });
      image.src = blogUrl(project.image);
      const body = el('span', 'project-list-body');
      body.append(el('span', 'project-list-title', project.title));
      if (project.description) body.append(el('span', 'project-list-description', project.description));
      row.append(image, body);
      item.append(row);
      return item;
    });
    const pageSize = 5;
    let page = 0;
    const pager = el('nav', 'project-pagination');
    pager.setAttribute('aria-label', chinese ? '项目分页' : 'Project pages');
    const previous = el('button', '', chinese ? '上一页' : 'Previous');
    const next = el('button', '', chinese ? '下一页' : 'Next');
    previous.type = next.type = 'button';
    const status = el('span', 'project-page-status');
    status.setAttribute('role', 'status');
    const renderPage = () => {
      const start = page * pageSize;
      list.replaceChildren(...items.slice(start, start + pageSize));
      list.start = start + 1;
      status.textContent = `${start + 1}–${Math.min(start + pageSize, items.length)} / ${items.length}`;
      previous.disabled = page === 0;
      next.disabled = start + pageSize >= items.length;
    };
    previous.addEventListener('click', () => { page -= 1; renderPage(); });
    next.addEventListener('click', () => { page += 1; renderPage(); });
    pager.append(status, previous, next);
    renderPage();
    loading.replaceWith(...(items.length > pageSize ? [pager, list] : [list]));
  }).catch(() => {
    loading.textContent = chinese ? '项目暂时无法加载，请通过下方链接查看。' : 'Projects are unavailable right now. You can browse them below.';
  });
}

// f's opening line, answered on the page so the first hello is instant. Same
// words as the worker's small-talk reply, so it reads the same either way.
function renderGreeting(target, chinese) {
  copy(target, chinese
    ? '你好，我是 f。我可以介绍范松海、展示他的项目或简历，也能根据他的文章回答问题，并附上原文链接。'
    : "Hi, I'm f. I can introduce Songhai, show his projects or CV, and answer questions about his writing with links to the original posts.");
}

function renderContact(target, chinese) {
  copy(target, chinese ? '可以在这些地方联系范松海。' : 'You can reach Songhai here.');
  const actions = el('div', 'cv-actions');
  const email = el('button', 'assistant-link', chinese ? '给他发邮件' : 'Email him');
  email.type = 'button';
  email.addEventListener('click', openLetter);
  actions.append(email, link('GitHub', 'https://github.com/SonghaiFan'), link('LinkedIn', 'https://linkedin.com/in/songhaifan'));
  target.append(actions);
}

function renderAiAnswer(target, answer, sources, showSourceCards = true) {
  const bubble = el('p', 'assistant-copy ai-answer');
  const verified = new Map(sources.map((source) => [source.number, source]));
  const marker = /\[(\d+)\]/g;
  let start = 0;
  for (const match of answer.matchAll(marker)) {
    bubble.append(document.createTextNode(answer.slice(start, match.index)));
    const source = verified.get(Number(match[1]));
    bubble.append(source ? link(`[${source.number}]`, source.url, 'citation-link') : document.createTextNode(match[0]));
    start = match.index + match[0].length;
  }
  bubble.append(document.createTextNode(answer.slice(start)));
  target.append(bubble);
  if (showSourceCards && sources.length) {
    const citedSources = sources.filter((source) => answer.includes(`[${source.number}]`));
    const visibleSources = citedSources.length ? citedSources : sources;
    const list = el('div', 'source-list');
    list.append(el('span', 'source-label', 'ORIGINAL PAGES'));
    visibleSources.forEach((source, index) => {
      const card = link('', source.url, 'source-card');
      card.style.setProperty('--order', String(index));
      card.append(el('span', 'source-card-title', `[${source.number}] ${source.title}`));
      if (source.snippet) card.append(el('span', 'source-card-snippet', source.snippet));
      list.append(card);
    });
    target.append(list);
  }
}

// While a reply is coming the composer says so: the send button turns into a
// stop button with a ring, the quick asks rest, and the placeholder explains.
// Typing stays open so a visitor can draft the next question.
function setBusy(state) {
  pending = Boolean(state);
  if (state) form.dataset.busy = state;
  else delete form.dataset.busy;
  sendButton.setAttribute('aria-label', state === 'reply' ? uiText('Stop the reply', '停止回答') : uiText('Send message', '发送消息'));
  languageToggle.disabled = pending || letterSending;
  suggestionButtons.forEach((button) => { button.disabled = pending; });
  input.placeholder = state === 'reply' ? uiText('f is answering… you can type your next question', 'f 正在回答，你可以先输入下一个问题') : uiText('Ask f about Songhai…', '向 f 了解范松海……');
}

// A long wait reads as broken unless the words move on. Each step is what the
// worker is plausibly doing by then, and the last one admits it is slow.
const thinkingSteps = [
  [0, 'Looking through the published work…', '正在查看公开内容…'],
  [2500, 'Reading the most relevant posts…', '正在阅读相关文章…'],
  [7000, 'Putting an answer together…', '正在整理回答…'],
  [15000, 'Still working — this one is taking a little longer.', '还在整理，这个问题需要多一点时间。'],
];
// Above the worker's worst case: two model calls of up to 25s each.
const replyTimeout = 60000;

function showThinking(target, chinese) {
  const bubble = el('div', 'assistant-copy ai-thinking');
  bubble.setAttribute('role', 'status');
  const dots = el('span', 'thinking-dots');
  dots.setAttribute('aria-hidden', 'true');
  dots.append(el('i'), el('i'), el('i'));
  let text = el('span', 'thinking-text', thinkingSteps[0][chinese ? 2 : 1]);
  bubble.append(dots, text);
  target.append(bubble);
  const timers = thinkingSteps.slice(1).map(([delay, en, zh]) => setTimeout(() => {
    const next = el('span', 'thinking-text', chinese ? zh : en);
    text.replaceWith(next);
    text = next;
  }, delay));
  return { bubble, stop: () => timers.forEach(clearTimeout) };
}

function stopReply() {
  if (!activeRequest) return;
  activeRequest.stoppedByUser = true;
  activeRequest.abort();
}

async function renderAi(target, message, chinese) {
  const thinking = showThinking(target, chinese);
  const loading = thinking.bubble;
  const controller = new AbortController();
  activeRequest = controller;
  setBusy('reply');
  const timeout = setTimeout(() => {
    controller.timedOut = true;
    controller.abort();
  }, replyTimeout);
  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: aiHistory.slice(-maxAiHistoryMessages) }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Chat unavailable'), { status: response.status });
    if (controller.signal.aborted) return;
    if (data.action !== 'show_cv' && typeof data.answer !== 'string') throw new Error('Invalid chat response');
    loading.remove();
    if (data.action === 'show_cv') renderCv(target, chinese, true);
    else if (data.action === 'show_projects') {
      if (!Array.isArray(data.projects)) throw new Error('Missing project cards');
      renderAiAnswer(target, data.answer, Array.isArray(data.sources) ? data.sources : [], false);
      renderProjects(target, data.projects);
    }
    else renderAiAnswer(target, data.answer, Array.isArray(data.sources) ? data.sources : []);
    const historyAnswer = data.action === 'show_cv' ? "I showed Songhai Fan's CV."
      : data.action === 'show_projects'
        ? `${data.answer}\nShown project cards: ${data.projects.map((project) => `${project.title} (${project.url.split('/').at(-1)})`).join('; ')}`
        : data.answer;
    rememberAiTurn(message, historyAnswer);
  } catch (error) {
    if (controller.stoppedByUser) {
      loading.className = 'assistant-copy ai-loading';
      loading.textContent = chinese ? '已停止。' : 'Stopped.';
      return;
    }
    if (controller.signal.aborted && !controller.timedOut) return;
    loading.className = 'assistant-copy ai-loading';
    // Say which failure it was: being asked to slow down is not the same as being broken.
    loading.textContent = controller.timedOut
      ? (chinese ? '这次等得太久了，回答没有出来。' : 'That took too long and no answer came back.')
      : error.status === 429
        ? (chinese ? '问得有点快了，请等一分钟再试。' : 'That’s a lot of questions in a minute. Give it a moment, then try again.')
        : (chinese ? '这次没能回答，再试一次通常就好。' : 'Something went wrong on my side. Trying again usually works.');
    const actions = el('div', 'cv-actions ai-retry');
    const retry = el('button', 'assistant-link', chinese ? '再试一次' : 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', () => {
      if (pending) return;
      loading.remove();
      actions.remove();
      renderAi(target, message, chinese);
    });
    actions.append(retry, link(chinese ? '打开博客' : 'Open the journal', chinese ? `${blogOrigin}/zh/` : `${blogOrigin}/`));
    target.append(actions);
    console.error('Chat request failed:', error);
  } finally {
    clearTimeout(timeout);
    thinking.stop();
    composerStatus.hidden = true;
    if (activeRequest === controller) {
      activeRequest = undefined;
      setBusy(false);
    }
  }
}

const localRenderers = { cv: renderCv, about: renderAbout, projects: renderProjectList, notes: renderNotes, contact: renderContact, greeting: renderGreeting };

function ask(message) {
  const value = message.trim();
  if (!value || pending) return;
  const chinese = language === 'zh';
  const topic = classify(value);
  const firstTurn = conversation.childElementCount === 0;
  const turn = el('section', 'turn');
  const user = el('div', 'user-line');
  user.append(el('span', '', value));
  const assistant = el('div', 'assistant-line');
  const identity = el('div', 'assistant-identity');
  const avatar = el('img', 'assistant-avatar');
  avatar.src = '/assets/dialog-avatar.png';
  avatar.alt = '';
  avatar.width = 42;
  avatar.height = 42;
  identity.append(avatar, el('p', 'assistant-label', uiText('f · AI FRIEND', 'f · AI 朋友')));
  assistant.append(identity);
  if (topic === 'ai') renderAi(assistant, value, chinese);
  else {
    const container = el('div', 'localized-reply-container');
    const body = el('div', 'localized-reply');
    container.append(body);
    assistant.append(container);
    localReplies.set(container, topic);
    localRenderers[topic](body, chinese, true);
    const summaries = {
      cv: chinese ? '我展示了范松海的简历 PDF。' : "I showed Songhai Fan's CV PDF.",
      about: chinese ? '范松海是一名 AI 产品研究者，研究以人为本的 AI、数据可视化和交互设计。' : 'Songhai Fan is an AI product researcher working on human-centred AI, data visualization, and interaction design.',
      projects: chinese ? '我展示了范松海的全部项目卡片。' : "I showed cards for all of Songhai Fan's projects.",
      notes: chinese ? '我列出了范松海最近的五篇 Journal 随笔。' : "I listed Songhai Fan's five most recent Journal notes.",
      contact: chinese ? '我展示了联系范松海的方式，包括邮件。' : "I showed ways to contact Songhai Fan, including email.",
      greeting: chinese ? '我打了招呼，并说明了我能做什么。' : 'I said hello and explained what I can do.',
    };
    rememberAiTurn(value, summaries[topic]);
  }
  turn.append(user, assistant);
  conversation.append(turn);
  startConversation();
  if (!firstTurn) requestAnimationFrame(() => turn.scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'start' }));
}

// Focus opens the send button in CSS; text keeps it open and fills it.
function syncArmed() {
  form.toggleAttribute('data-armed', Boolean(input.value.trim()));
}

function clearInput() {
  input.value = '';
  input.style.height = '';
  syncArmed();
}

// ── the letter ──
// Chat and email are different acts, so they have different surfaces: the
// bar at the bottom is only ever chat, and writing to Songhai opens a modal
// with an envelope in it. The dialog is native, so Escape, focus trapping and
// returning focus to the button that opened it come for free.
function openLetter() {
  if (letterDialog.open) return;
  letterStatus.textContent = letterNote;
  letterStatus.classList.remove('is-error');
  letterDialog.showModal();
  (emailName.value ? letterMessage : emailName).focus();
}

function closeLetter() {
  if (!letterSending) letterDialog.close();
}

function startConversation() {
  finishIntro();
  stage.classList.add('has-conversation');
  stopIntroVideo();
  opening.inert = true;
  opening.setAttribute('aria-hidden', 'true');
  resetButton.hidden = false;
}

// Posting: the filled-in envelope is lifted out of the modal and goes
// straight up out of the window as the modal closes behind it.
function postLetter() {
  if (reduceMotion.matches) return;
  const rect = letterForm.getBoundingClientRect();
  const copy = letterForm.cloneNode(true);
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  copy.querySelector('.letter-foot')?.remove();
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  Object.assign(copy.style, {
    position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
    margin: '0', zIndex: '20', pointerEvents: 'none',
  });
  document.body.append(copy);
  const dy = -(rect.top + rect.height + 40);
  copy.animate([
    { transform: 'none', easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: 'translateY(8px)', offset: 0.18, easing: 'cubic-bezier(.6,0,.85,.25)' },
    { transform: `translateY(${dy}px)` },
  ], { duration: 800, fill: 'forwards' }).finished.then(() => copy.remove(), () => copy.remove());
}

async function sendLetter() {
  const name = emailName.value.trim();
  const email = emailAddress.value.trim();
  const message = letterMessage.value.trim();
  letterSending = true;
  letterForm.dataset.busy = '';
  letterSend.textContent = uiText('Posting…', '正在寄出…');
  languageToggle.disabled = true;
  letterStatus.classList.remove('is-error');
  letterStatus.textContent = uiText('Posting your letter…', '正在寄出你的信…');
  try {
    const response = await fetch(contactUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message, website: emailWebsite.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.sent) throw new Error(data.error || 'Email unavailable');
    postLetter();
    letterSending = false;
    letterDialog.close();
    const turn = el('section', 'turn email-turn');
    const user = el('div', 'user-line');
    user.append(el('span', '', message));
    const receipt = el('div', 'email-receipt');
    const photo = el('img');
    photo.src = '/assets/profile.png';
    photo.alt = '';
    receipt.append(photo, el('p', '', uiText(`Your letter is on its way to me. I'll reply to ${email}.`, `你的信已寄出。我会回复至 ${email}。`)));
    turn.append(user, receipt);
    conversation.append(turn);
    startConversation();
    emailWebsite.value = '';
    letterMessage.value = '';
    requestAnimationFrame(() => turn.scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'start' }));
  } catch (error) {
    letterStatus.classList.add('is-error');
    letterStatus.textContent = uiText('Your letter was not sent. It is still here; please try again.', '信件未能寄出，内容已保留，请再试一次。');
    console.error('Email request failed:', error);
  } finally {
    letterSending = false;
    delete letterForm.dataset.busy;
    letterSend.textContent = uiText('Post letter', '寄出');
    languageToggle.disabled = pending;
  }
}

// "Chat with f" starts the conversation instead of only focusing the field:
// the visitor says hello and f answers, so the chat has already begun.
startButton.addEventListener('click', () => {
  ask(uiText('Hello', '你好'));
  if (window.innerWidth >= 760) input.focus({ preventScroll: true });
});
emailButton.addEventListener('click', openLetter);
chooseSonghai.addEventListener('click', openLetter);
document.querySelector('#letter-cancel').addEventListener('click', closeLetter);
// A letter is posted by pressing Post letter, never by Enter: Enter in the
// letter is a new line, and Enter in an address line moves on to the next
// line instead of the browser's implicit submit.
letterForm.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.target.tagName !== 'INPUT') return;
  event.preventDefault();
  (event.target === emailName ? emailAddress : letterMessage).focus();
});
letterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!letterSending) sendLetter();
});
// A click on the dimmed page around the envelope puts it down.
letterDialog.addEventListener('click', (event) => {
  if (event.target === letterDialog) closeLetter();
});
letterDialog.addEventListener('cancel', (event) => {
  if (letterSending) event.preventDefault();
});

// Stop has to act on the click itself: the empty textarea is required, so the
// browser's validation would swallow a submit before the handler below runs.
sendButton.addEventListener('click', (event) => {
  if (form.dataset.busy !== 'reply') return;
  event.preventDefault();
  stopReply();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (pending) {
    if (form.dataset.busy === 'reply') stopReply();
    return;
  }
  const value = input.value.trim();
  if (!value) return;
  clearInput();
  ask(value);
  if (window.innerWidth < 760) input.blur();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    // Enter while f is answering must not stop the reply; only the button does.
    if (pending) {
      composerStatus.textContent = uiText('f is still answering. Your question will be ready to send when it finishes.', 'f 还在回答。完成后就可以发送你的下一个问题。');
      composerStatus.hidden = false;
      return;
    }
    form.requestSubmit();
  }
});
input.addEventListener('input', () => {
  syncArmed();
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    ask(button.dataset.prompt);
  });
});

function resetHome() {
  finishIntro();
  activeRequest?.abort();
  activeRequest = undefined;
  setBusy(false);
  aiHistory = [];
  conversation.replaceChildren();
  localReplies.clear();
  stage.classList.remove('has-conversation');
  opening.inert = false;
  opening.removeAttribute('aria-hidden');
  resetButton.hidden = true;
  window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'instant' : 'smooth' });
  clearInput();
}

resetButton.addEventListener('click', resetHome);
document.querySelector('.wordmark').addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  resetHome();
  window.scrollTo({ top: 0, behavior: 'instant' });
  startFirstIntro(true);
});

languageToggle.addEventListener('click', () => applyLanguage(language === 'en' ? 'zh' : 'en', true));
let savedLanguage;
try { savedLanguage = localStorage.getItem('frank-language'); } catch {}
applyLanguage(new URLSearchParams(location.search).get('lang') || savedLanguage || 'en');

startFirstIntro();
