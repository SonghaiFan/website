<script setup>
import { computed, createApp, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { dataSymbol, useData, useRouter, withBase } from "vitepress";
import { pathToFile } from "vitepress/dist/client/app/utils.js";
import localSearchIndex from "@localSearchIndex";
import MiniSearch from "minisearch";
import { LayoutList, Search, X } from "@lucide/vue";
import { ICON_STROKE } from "./icons.js";

// Inline search for the home page. The search itself is VitePress's: the same
// prebuilt local index, the same MiniSearch engine and the same options the ⌘K
// modal uses (including our Chinese tokeniser from the config), so the results
// are identical. Only the presentation is ours: results replace the article list
// in place and read like it. The modal is not used on the home page.
const vitePressData = useData();
const { localeIndex, theme, lang } = vitePressData;
const router = useRouter();
const chinese = computed(() => lang.value.toLowerCase().startsWith("zh"));

const input = ref(null);
const query = ref("");
const results = shallowRef([]);
const selected = ref(0);
const engine = shallowRef(null);
const texts = shallowRef(new Map()); // path -> { date, text } from /api/search-index.json
const activeType = ref("all");
let typeChangeListener;
const ready = ref(false);

// The detailed list: each result shows its section as rendered HTML, images and
// all, the way the ⌘K modal does. The setting is shared with the modal (same
// storage key); on the home page it defaults to on.
const DETAILED_KEY = "vitepress:local-search-detailed-list";
const detailed = ref(true);
const sections = shallowRef(new Map()); // page path -> Map(anchor -> section html)
function setDetailed(value) {
  detailed.value = value;
  try { localStorage.setItem(DETAILED_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
}

// Render a page once in a detached app and cut it into sections by heading —
// the modal's own method. The intro before the first heading is section "".
async function loadSections(path) {
  if (sections.value.has(path)) return;
  const file = pathToFile(path);
  let mod = {};
  try { if (file) mod = await import(/* @vite-ignore */ file); } catch { /* no excerpt */ }
  const map = new Map();
  const component = mod.default ?? mod;
  if (component?.render || component?.setup) {
    const app = createApp(component);
    app.config.warnHandler = () => {};
    app.provide(dataSymbol, vitePressData);
    Object.defineProperties(app.config.globalProperties, {
      $frontmatter: { get: () => vitePressData.frontmatter.value },
      $params: { get: () => vitePressData.page.value.params },
    });
    const root = document.createElement("div");
    app.mount(root);
    const cut = (start) => {
      let html = "";
      for (let node = start; node && !/^h[1-6]$/i.test(node.tagName); node = node.nextElementSibling) html += node.outerHTML;
      return html;
    };
    const first = root.querySelector("h1, h2, h3, h4, h5, h6");
    map.set("", cut(first ? first.nextElementSibling : root.firstElementChild));
    for (const heading of root.querySelectorAll("h2, h3, h4, h5, h6")) {
      const anchor = heading.querySelector("a")?.getAttribute("href");
      if (anchor?.startsWith("#") && anchor.length > 1) map.set(decodeURIComponent(anchor.slice(1)), cut(heading.nextElementSibling));
    }
    app.unmount();
  }
  sections.value = new Map(sections.value).set(path, map);
}

// Mark the typed terms inside rendered HTML, text nodes only.
function markHtml(html) {
  const terms = queryTerms();
  if (!html || !terms.length) return html;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!pattern.test(node.data)) continue;
    pattern.lastIndex = 0;
    const span = doc.createElement("span");
    span.innerHTML = escapeHtml(node.data).replace(pattern, "<mark>$1</mark>");
    node.replaceWith(...span.childNodes);
  }
  return doc.body.firstElementChild.innerHTML;
}

async function loadEngine() {
  if (engine.value) return engine.value;
  const options = theme.value.search?.provider === "local" ? theme.value.search.options : {};
  const data = (await localSearchIndex[localeIndex.value]?.())?.default;
  engine.value = MiniSearch.loadJSON(data, {
    fields: ["title", "titles", "text"],
    storeFields: ["title", "titles"],
    searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 }, ...options?.miniSearch?.searchOptions },
    ...options?.miniSearch?.options,
  });
  ready.value = true;
  return engine.value;
}

// Full text and type of public entries; this also bounds home search to Blog/.
let textsPromise;
async function loadTexts() {
  if (texts.value.size) return texts.value;
  if (textsPromise) return textsPromise;
  textsPromise = (async () => {
    const data = await (await fetch(withBase("/api/search-index.json"))).json();
    const map = new Map();
    for (const post of data.posts || []) {
      map.set(decodeURIComponent(new URL(post.url).pathname), {
        type: post.type,
        date: post.type === "project" ? post.period || "" : post.displayDate || post.date?.slice(0, 10) || "",
        text: plain(post.content),
      });
    }
    texts.value = map;
    return map;
  })();
  try { return await textsPromise; }
  catch { textsPromise = undefined; return new Map(); }
}

function entryFor(id) {
  const [path] = id.split("#");
  return texts.value.get(decodeURIComponent(path).replace(/\.html$/, ""));
}

const visibleResults = computed(() => results.value.filter((result) => {
  const entry = entryFor(result.id);
  return entry && (activeType.value === "all" || entry.type === activeType.value);
}).slice(0, 16));

function plain(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Mark what was typed — each word, and each Han character in it — not the
// engine's matched terms: our tokeniser also indexes whole runs of Han text, and
// fuzzy matching on those would mark half a sentence.
function queryTerms() {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  const chars = words.flatMap((word) => word.match(/\p{Script=Han}/gu) || []);
  return [...new Set([...words, ...chars])].sort((a, b) => b.length - a.length);
}

function highlighter() {
  const terms = queryTerms();
  if (!terms.length) return (text) => escapeHtml(text);
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return (text) => escapeHtml(text).replace(pattern, "<mark>$1</mark>");
}

// An excerpt from the result's own section: start at its heading in the post's
// text, then centre on the first matched term after it.
function excerptFor(result, mark) {
  const [path] = result.id.split("#");
  const entry = entryFor(path);
  if (!entry) return "";
  const lower = entry.text.toLowerCase();
  const heading = result.titles.length ? result.title : "";
  const from = heading ? Math.max(0, lower.indexOf(heading.toLowerCase())) : 0;
  // Prefer the whole word typed; fall back to its single characters.
  let at = from;
  for (const term of queryTerms()) {
    const hit = lower.indexOf(term, from);
    if (hit >= 0) { at = hit; break; }
  }
  const start = Math.max(0, at - 30);
  const slice = entry.text.slice(start, at + 90);
  return (start ? "…" : "") + mark(slice) + (at + 90 < entry.text.length ? "…" : "");
}

const rows = computed(() => visibleResults.value.map((result) => {
  const mark = highlighter();
  const [path] = result.id.split("#");
  const page = result.titles[0] || result.title;
  const section = result.titles.length ? [...result.titles.slice(1), result.title] : [];
  const [, anchor = ""] = result.id.split("#");
  const rich = detailed.value ? sections.value.get(path)?.get(decodeURIComponent(anchor)) : "";
  return {
    id: result.id,
    rich: rich ? markHtml(rich) : "",
    date: entryFor(path)?.date || "",
    type: entryFor(path)?.type || "note",
    page: mark(page),
    section: section.map(mark).join(" <span class=\"home-result-sep\">›</span> "),
    excerpt: excerptFor(result, mark),
  };
}));

let searchToken = 0;
watch(query, async (value) => {
  const token = ++searchToken;
  syncUrl(value);
  setSearching(Boolean(value.trim()));
  if (!value.trim()) { results.value = []; return; }
  const [index] = await Promise.all([loadEngine(), loadTexts()]);
  if (token !== searchToken) return;
  results.value = index.search(value);
  selected.value = 0;
  if (detailed.value) loadVisibleSections(token);
});

async function loadVisibleSections(token = searchToken) {
  await Promise.all(visibleResults.value.map((result) => loadSections(result.id.split("#")[0])));
  if (token !== searchToken) return;
  await nextTick();
  centreExcerpts();
}
watch(detailed, (on) => { if (on && visibleResults.value.length) loadVisibleSections(); });
watch(activeType, () => { selected.value = 0; if (detailed.value && visibleResults.value.length) loadVisibleSections(); });

// Like the modal: scroll each excerpt so its first match sits in the middle.
function centreExcerpts() {
  for (const box of document.querySelectorAll(".home-result-rich")) {
    const hit = box.querySelector("mark");
    // Less than a line of travel isn't worth cutting the first line for.
    const target = hit ? hit.offsetTop - box.clientHeight / 2 : 0;
    box.scrollTop = target < 24 ? 0 : target;
    box.classList.toggle("is-scrolled", box.scrollTop > 0); // fade the cut top line too
  }
}

function setSearching(on) {
  input.value?.closest(".journal-index")?.classList.toggle("is-searching", on);
}

// The query lives in the URL, so Back from a result returns to the same results.
function syncUrl(value) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("q", value);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", url);
}

function open(index = selected.value) {
  const row = rows.value[index];
  if (row) router.go(row.id);
}

function onKeydown(event) {
  if (event.isComposing) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (!rows.value.length) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    selected.value = (selected.value + step + rows.value.length) % rows.value.length;
    nextTick(() => document.querySelector(".home-result.is-selected")?.scrollIntoView({ block: "nearest" }));
  } else if (event.key === "Enter") {
    event.preventDefault();
    open();
  } else if (event.key === "Escape") {
    if (query.value) { event.preventDefault(); query.value = ""; }
    else input.value?.blur();
  }
}

// On the home page, ⌘K and "/" come here instead of opening the modal.
function onShortcut(event) {
  const target = event.target;
  const editing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  const isK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
  const isSlash = event.key === "/" && !editing && !event.metaKey && !event.ctrlKey && !event.altKey;
  if (!isK && !isSlash) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  input.value?.focus();
  input.value?.select();
}

onMounted(() => {
  activeType.value = new URLSearchParams(window.location.search).get("type") || "all";
  const onTypeChange = (event) => { activeType.value = event.detail; };
  window.addEventListener("blog-type-change", onTypeChange);
  typeChangeListener = onTypeChange;
  try {
    const stored = localStorage.getItem(DETAILED_KEY);
    if (stored !== null) detailed.value = JSON.parse(stored) === true;
  } catch { /* storage blocked */ }
  window.addEventListener("keydown", onShortcut, true);
  const initial = new URLSearchParams(window.location.search).get("q");
  if (initial) query.value = initial;
});
onUnmounted(() => {
  window.removeEventListener("blog-type-change", typeChangeListener);
  window.removeEventListener("keydown", onShortcut, true);
  setSearching(false);
});
</script>

<template>
  <div class="home-search" role="search">
    <Search class="home-search-icon" :size="18" :stroke-width="ICON_STROKE" aria-hidden="true" />
    <input
      ref="input"
      v-model="query"
      class="home-search-input"
      type="search"
      enterkeyhint="go"
      autocomplete="off"
      spellcheck="false"
      role="combobox"
      aria-controls="home-search-results"
      :aria-expanded="Boolean(query)"
      :aria-activedescendant="rows.length ? `home-result-${selected}` : undefined"
      :placeholder="chinese ? '搜索文章、标题或正文' : 'Search titles and text'"
      :aria-label="chinese ? '搜索文章' : 'Search articles'"
      @focus="loadEngine(); loadTexts()"
      @keydown="onKeydown"
    />
    <button
      type="button"
      class="home-search-tool"
      :class="{ 'is-on': detailed }"
      :aria-pressed="detailed"
      :aria-label="chinese ? '显示详细列表' : 'Show detailed list'"
      :title="chinese ? '显示详细列表' : 'Show detailed list'"
      @click="setDetailed(!detailed); input?.focus()"
    >
      <LayoutList :size="16" :stroke-width="ICON_STROKE" aria-hidden="true" />
    </button>
    <button
      v-if="query"
      type="button"
      class="home-search-clear home-search-tool"
      :aria-label="chinese ? '清除搜索' : 'Clear search'"
      @click="query = ''; input?.focus()"
    >
      <X :size="16" :stroke-width="ICON_STROKE" aria-hidden="true" />
    </button>
    <kbd v-else class="home-search-keys" aria-hidden="true">/</kbd>
  </div>

  <div v-if="query" id="home-search-results" class="home-results" role="listbox" :aria-label="chinese ? '搜索结果' : 'Search results'">
    <a
      v-for="(row, index) in rows"
      :id="`home-result-${index}`"
      :key="row.id"
      class="home-result"
      :class="{ 'is-selected': index === selected }"
      role="option"
      :aria-selected="index === selected"
      :href="row.id"
      @mouseenter="selected = index"
    >
      <span class="home-result-date">{{ chinese ? { note: '随笔', project: '项目' }[row.type] : { note: 'Note', project: 'Project' }[row.type] }} <span v-if="row.date">{{ row.date }}</span></span>
      <span class="home-result-body">
        <span class="home-result-title"><span v-html="row.page" /><template v-if="row.section"> <span class="home-result-sep">›</span> <span class="home-result-section" v-html="row.section" /></template></span>
        <span v-if="row.rich" class="home-result-rich vp-doc" inert v-html="row.rich" />
        <span v-else-if="row.excerpt" class="home-result-excerpt" v-html="row.excerpt" />
      </span>
    </a>
    <p v-if="ready && !rows.length" class="home-results-empty">
      {{ chinese ? `没有找到与“${query}”相关的内容` : `Nothing found for “${query}”` }}
    </p>
  </div>
</template>

<style scoped>
.home-search {
  display: flex;
  align-items: center;
  gap: .85rem;
  height: 3.25rem;
  margin-top: 2.25rem;
  padding: 0 .55rem 0 1.1rem;
  border-radius: var(--songhai-radius);
  background: var(--vp-c-bg-soft);
  transition: background-color var(--songhai-motion-base) var(--songhai-ease-out), box-shadow var(--songhai-motion-base) var(--songhai-ease-out);
}
.home-search:hover { background: var(--vp-c-bg-elv); }
.home-search:focus-within { background: var(--vp-c-bg-elv); box-shadow: 0 0 0 1px var(--vp-c-text-3); }
.home-search-icon { flex: none; width: 18px; height: 18px; color: var(--vp-c-text-2); }
.home-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 1rem;
  outline: none;
}
.home-search-input::placeholder { color: var(--vp-c-text-3); }
.home-search-input::-webkit-search-cancel-button { display: none; }
.home-search-keys {
  flex: none;
  margin-right: .55rem;
  padding: .1rem .5rem;
  border-radius: var(--songhai-radius-sm);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  font: 500 .75rem/1.5 var(--songhai-font);
}
.home-search-tool {
  display: grid;
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: color var(--songhai-motion-fast) ease, background-color var(--songhai-motion-fast) ease;
}
.home-search-tool:hover, .home-search-tool.is-on { color: var(--vp-c-text-1); }
.home-search-tool:hover { background: var(--vp-c-bg-soft); }
.home-search-tool:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
.home-search-tool svg { flex: none; }
.home-search-tool + .home-search-tool { margin-left: -.5rem; }

/* Results take the article list's place and read like it: date column, title,
   then the section and a line of the text where it matched. */
.home-results {
  margin-top: clamp(2.5rem, 5vw, 4rem);
  animation: home-results-in 260ms var(--songhai-ease-out) both;
}
.home-result {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr);
  align-items: baseline;
  gap: 1.5rem;
  margin: 0 -1rem;
  padding: 1.1rem 1rem;
  border-radius: var(--songhai-radius-sm);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: background-color var(--songhai-motion-fast) ease;
}
.home-result.is-selected { background: var(--vp-c-bg-soft); }
.home-result-date { color: var(--vp-c-text-3); font-size: .8rem; font-variant-numeric: tabular-nums; }
.home-result-body { display: grid; gap: .35rem; min-width: 0; }
.home-result-title { font-size: clamp(1.05rem, 2vw, 1.2rem); line-height: 1.45; overflow-wrap: anywhere; }
.home-result-section { color: var(--vp-c-text-2); }
.home-result-sep, :deep(.home-result-sep) { margin: 0 .2em; color: var(--vp-c-text-3); }
.home-result-excerpt { color: var(--vp-c-text-3); font-size: .85rem; line-height: 1.6; overflow-wrap: anywhere; }
/* The section itself, as the article renders it: small, muted, its images kept
   short, fading out at the bottom (a mask, so it works on any surface). */
.home-result-rich {
  display: block;
  max-height: 9.5rem;
  overflow: hidden;
  color: var(--vp-c-text-3);
  -webkit-mask-image: linear-gradient(#000 70%, transparent);
  mask-image: linear-gradient(#000 70%, transparent);
  pointer-events: none;
}
.home-result-rich.is-scrolled {
  -webkit-mask-image: linear-gradient(transparent, #000 18%, #000 70%, transparent);
  mask-image: linear-gradient(transparent, #000 18%, #000 70%, transparent);
}
.home-result-rich :deep(*) { font-size: .85rem !important; line-height: 1.6 !important; }
.home-result-rich :deep(p), .home-result-rich :deep(li) { margin: 0 0 .5rem; color: var(--vp-c-text-3); }
.home-result-rich :deep(h1), .home-result-rich :deep(h2), .home-result-rich :deep(h3) { margin: 0 0 .4rem; padding: 0; border: 0; color: var(--vp-c-text-2); }
.home-result-rich :deep(img) { display: block; max-width: 100%; max-height: 7.5rem; width: auto; height: auto; margin: .4rem 0; border-radius: var(--songhai-radius-sm); }
.home-result-rich :deep(.image-caption) { display: none; }
.home-result-rich :deep(div[class*="language-"]) { margin: .4rem 0; border-radius: var(--songhai-radius-sm); }

/* Highlight the glyphs, not the whole line box: CJK line boxes run tall, so the
   wash covers 27–85% of the box, where the glyphs measured (31–81%). */
.home-result :deep(mark) {
  padding: 0 .08em;
  background: linear-gradient(transparent 27%, color-mix(in srgb, var(--vp-c-text-1) 18%, transparent) 27%, color-mix(in srgb, var(--vp-c-text-1) 18%, transparent) 85%, transparent 85%);
  color: var(--vp-c-text-1);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.home-results-empty { margin: 0; padding: 1.35rem 0; color: var(--vp-c-text-3) !important; }
@keyframes home-results-in { from { opacity: 0; transform: translate3d(0, 6px, 0); } }

@media (max-width: 640px) {
  .home-search { margin-top: 1.75rem; }
  .home-search-keys { display: none; }
  .home-result { grid-template-columns: minmax(0, 1fr); gap: .3rem; }
  .home-result-date:empty { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .home-search, .home-search-clear, .home-result { transition: none; }
  .home-results { animation: none; }
}
</style>
