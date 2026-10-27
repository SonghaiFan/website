<script setup>
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useData, useRoute, useRouter } from "vitepress";
import { pathToFile } from "vitepress/dist/client/app/utils.js";
import PostHeader from "./PostHeader.vue";
import PullHint from "./PullHint.vue";
import PullLink from "./PullLink.vue";
import { pullState } from "./pull-state.js";

// Bring in the neighbouring article using one shared glide:
//
//  - On phones, touch-pull past either page edge reveals the hint
//    (PullHint): edge, a gap, "[F] 继续上滑", a gap, then the
//    neighbour. At the end, pushing on lifts the column and the hint, then the
//    next article, rise from the bottom; at the top, pulling back lowers the
//    column and the hint, then the previous article's title, come down.
//  - On desktop, wheel input stays native. Clicking either in-page PullLink
//    starts that same glide directly.
//  - Damped: the further you pull, the less it gives (at most 240px).
//  - Let go short of the threshold (75px) and it springs back. Past it, the
//    neighbour glides into place at its start — the next one rising, the
//    previous one coming down as this article slides away below — and the page
//    becomes that article (URL, sidebar, outline) with nothing on screen moving.
//  - A phone touch pull commits on release. Desktop links start the glide at
//    the same threshold without intercepting ordinary wheel scrolling.
//
// Previews are the neighbours' own page modules rendered with the same
// PostHeader, .vp-doc and end-hint markup over the article column, so the
// hand-off frame is identical. Order is the sidebar's.
const { theme, lang, frontmatter } = useData();
const route = useRoute();
const router = useRouter();
const chinese = computed(() => lang.value.toLowerCase().startsWith("zh"));

const REACH = 240;
const GIVE = 0.5;
const COMMIT = 75;
const MOMENTUM_CAP = 0.6;
const SPRING_MS = 420;
const GLIDE_MS = 560;

const neighbours = shallowRef({ prev: null, next: null }); // { link, title, frontmatter, component, prevTitle, nextTitle }
const nextPreview = ref(null);
const prevPreview = ref(null);
const side = ref(null);       // "next" | "prev" during a pull
const pull = ref(0);          // visual px
const armed = ref(false);
const committing = ref(false);
const column = ref({ left: 0, width: 0 });
const viewport = ref(800);
// The previous article's preview is a window onto its top: its title block sits
// on top of this article's column, and the window shows only what is above it.
const zone = ref(80);          // --pull-zone: the band above a title and under the last line
const endSpace = ref(72);      // breathing room after the outgoing article
const resting = ref(120);     // where a title sits on its own page
const prevBlock = ref(0);     // its title block (header + margin below)
const prevTop = ref(-9999);   // its title's top on screen
const prevClip = ref(0);      // how much of it shows below its title's top
// Past the edge: GAP, the hint line (LINE tall), GAP, then the neighbour.
const GAP = 24;
const LINE = 20;

let raw = 0;
let frame = 0;
let touchY = null;
let touchSide = null;
let loadToken = 0;
let nextExitStart = 0;
let nextExitTarget = 0;
let nextExitExtra = 0;

const clean = (path) => decodeURIComponent(String(path || "")).replace(/\.html$/, "").replace(/\/$/, "");
const quartOut = (t) => 1 - (1 - t) ** 4;
const damp = (r) => REACH * (1 - Math.exp(-(GIVE * r) / REACH));
const undamp = (p) => (-REACH * Math.log(1 - Math.min(p, REACH - 0.01) / REACH)) / GIVE;
const ready = computed(() => armed.value && pull.value >= COMMIT);



// Sidebar order, with plain titles (sidebar text carries date/meta markup).
// Articles only: a group heading may link somewhere too ("全部文章" links home),
// and that is not a neighbour — the newest article has nothing before it.
function sidebarOrder() {
  const sidebar = theme.value.sidebar || {};
  const groups = Array.isArray(sidebar)
    ? sidebar
    : Object.entries(sidebar).filter(([base]) => route.path.startsWith(base)).sort((a, b) => b[0].length - a[0].length)[0]?.[1] || [];
  const items = [];
  const walk = (list) => list.forEach((item) => {
    if (item.link && !item.items) {
      const html = String(item.text || "");
      const title = html.match(/journal-side-title">([^<]*)</)?.[1] || html.replace(/<[^>]+>/g, "");
      items.push({ link: item.link, title: title.trim() });
    }
    if (item.items) walk(item.items);
  });
  walk(groups);
  return items;
}

async function loadOne(order, index) {
  const item = order[index];
  if (!item) return null;
  const mod = await import(/* @vite-ignore */ pathToFile(decodeURI(item.link)));
  return {
    ...item,
    frontmatter: mod.__pageData?.frontmatter || {},
    component: markRaw(mod.default ?? mod),
    prevTitle: order[index - 1]?.title || "",
    prevLink: order[index - 1]?.link || "",
    nextTitle: order[index + 1]?.title || "",
  };
}

async function load() {
  const token = ++loadToken;
  neighbours.value = { prev: null, next: null };
  const order = sidebarOrder();
  const here = order.findIndex((item) => clean(item.link) === clean(route.path));
  pullState.prevTitle = here > 0 ? order[here - 1].title : "";
  pullState.prevLink = here > 0 ? order[here - 1].link : "";
  pullState.nextTitle = here >= 0 ? order[here + 1]?.title || "" : "";
  if (here < 0) return;
  const [prevResult, nextResult] = await Promise.allSettled([
    loadOne(order, here - 1),
    loadOne(order, here + 1),
  ]);
  if (token !== loadToken) return;
  const prev = prevResult.status === "fulfilled" ? prevResult.value : null;
  const next = nextResult.status === "fulfilled" ? nextResult.value : null;
  neighbours.value = { prev, next };
  if (prevResult.status === "rejected") console.error("[ArticlePull] Could not load the previous article preview", prevResult.reason);
  if (nextResult.status === "rejected") console.error("[ArticlePull] Could not load the next article preview", nextResult.reason);
  await nextTick();
  // Duplicate ids would answer this page's anchors and join its outline.
  for (const el of [nextPreview.value, prevPreview.value]) el?.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
}

const columnEl = () => document.querySelector(".VPDoc .content-container");
const ownHeader = () => document.querySelector(".VPDoc .content-container > .blog-post-header");
const scrollRoot = () => document.scrollingElement || document.documentElement;
const atEnd = () => {
  const root = scrollRoot();
  if (root.scrollTop + root.clientHeight >= root.scrollHeight - 8) return true;
  // Mobile browser toolbars can change the visible viewport without the root's
  // scroll dimensions lining up exactly. The next-article link is the actual
  // end of this article, so its visible midpoint is a reliable fallback.
  const endLink = document.querySelector(".VPDoc .post-end-hint");
  if (!endLink) return false;
  const rect = endLink.getBoundingClientRect();
  const visual = window.visualViewport;
  const visibleBottom = visual ? visual.offsetTop + visual.height : window.innerHeight;
  return rect.top + rect.height / 2 <= visibleBottom;
};
const atTop = () => scrollRoot().scrollTop <= 1;

// Measured with the column at rest (pull 0).
function measure() {
  viewport.value = window.innerHeight;
  const el = columnEl();
  if (!el) return;
  const box = el.getBoundingClientRect();
  column.value = { left: box.left, width: box.width };
  resting.value = restingTop();
  const style = getComputedStyle(el);
  zone.value = parseFloat(style.getPropertyValue("--pull-zone")) || 80;
  endSpace.value = parseFloat(style.getPropertyValue("--post-end-space")) || 72;
  const header = prevPreview.value?.querySelector(".blog-post-header");
  if (header) prevBlock.value = header.offsetHeight + parseFloat(getComputedStyle(header).marginBottom || "0");
}
// Where a title sits on its own page (viewport y at scroll 0).
function restingTop() {
  const own = ownHeader();
  if (!own) return 120;
  const lift = side.value === "prev" ? pull.value : -pull.value;
  return own.getBoundingClientRect().top - lift + window.scrollY;
}

// Move the article column with the pull: up for next, down for previous.
function apply(p) {
  pull.value = p;
  const el = columnEl();
  if (el) {
    const exitProgress = nextExitTarget > nextExitStart
      ? Math.max(0, Math.min(1, (p - nextExitStart) / (nextExitTarget - nextExitStart)))
      : 0;
    const offset = side.value === "prev" ? p : -p - nextExitExtra * exitProgress;
    el.style.transform = p ? `translate3d(0, ${offset.toFixed(2)}px, 0)` : "";
  }
  if (side.value === "prev" && !committing.value) {
    // Above this article's top edge: a gap, the hint, a gap, then the previous
    // article's title block.
    const edge = resting.value - zone.value + p;
    prevTop.value = edge - GAP - LINE - GAP - prevBlock.value;
    prevClip.value = prevBlock.value;
  }
  pullState.side = p ? side.value : null;
  pullState.ready = ready.value;
  pullState.progress = Math.min(1, p / COMMIT);
}

function animate(to, ms, done) {
  cancelAnimationFrame(frame);
  const from = pull.value;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || from === to) { apply(to); done?.(); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    apply(from + (to - from) * quartOut(t));
    if (t < 1) frame = requestAnimationFrame(tick);
    else done?.();
  };
  frame = requestAnimationFrame(tick);
}

function begin(which, fresh) {
  side.value = which;
  cancelAnimationFrame(frame);
  measure();
  armed.value = fresh;
}

function setRaw(value) {
  raw = Math.max(0, value);
  if (!armed.value) raw = Math.min(raw, undamp(COMMIT * MOMENTUM_CAP));
  apply(damp(raw));
}

function finish() {
  raw = 0;
  armed.value = false;
  apply(0);
  nextExitExtra = 0;
  nextExitStart = 0;
  nextExitTarget = 0;
  side.value = null;
  pullState.side = null;
  pullState.ready = false;
  pullState.progress = 0;
}

function release() {
  if (!pull.value || committing.value) return;
  if (ready.value) commit();
  else animate(0, SPRING_MS, finish);
}

function onPullLinkClick(event) {
  if (window.matchMedia("(max-width: 767px)").matches || event.button !== 0) return;
  const link = event.target.closest?.(".post-pull-hint button.pull-link-desktop, .post-end-hint button.pull-link-desktop");
  if (!link || blocked() || committing.value) return;
  const href = link.dataset.href;
  if (!href) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    window.open(href, "_blank", "noopener");
    return;
  }
  const which = link.closest(".post-end-hint") ? "next" : "prev";
  const neighbour = neighbours.value[which];
  if (!neighbour || clean(new URL(href, window.location.href).pathname) !== clean(neighbour.link)) {
    // The header link may render before its neighbour's preview finishes loading.
    router.go(href);
    return;
  }

  // A button leaves VitePress's link handler alone until the glide hands off.
  begin(which, true);
  raw = undamp(COMMIT);
  apply(COMMIT);
  commit();
}

function commit() {
  committing.value = true;
  if (side.value === "next") {
    // Until its title stands where a title sits on its own page: below the edge
    // come a gap, the hint, a gap, its pull zone, then its title.
    const target = viewport.value + GAP + LINE + GAP + zone.value - restingTop();
    nextExitStart = pull.value;
    nextExitTarget = target;
    // The preview's title must meet its final position, while the outgoing
    // article's last line needs to clear the viewport before route handoff.
    // Give that last line its own exit distance instead of moving both pages
    // by exactly the same amount.
    const currentBottom = columnEl()?.getBoundingClientRect().bottom ?? 0;
    const finalBottom = currentBottom - (target - pull.value);
    nextExitExtra = endSpace.value + Math.max(0, finalBottom);
    animate(target, GLIDE_MS, handOff);
    return;
  }
  // Previous: this article slides on down and out of view while the previous
  // title glides to where a title sits; the window opens as the column leaves,
  // so at the end the previous article shows from its top, as on its own page.
  cancelAnimationFrame(frame);
  const p0 = pull.value;
  const top0 = prevTop.value;
  // Far enough that the window (which ends a gap, the hint and a gap above
  // this article's edge) reaches the bottom of the screen.
  const away = viewport.value - (resting.value - zone.value) + GAP + LINE + GAP;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  const tick = (now) => {
    const e = reduced ? 1 : quartOut(Math.min(1, (now - start) / GLIDE_MS));
    const c = p0 + (away - p0) * e;
    apply(c);
    prevTop.value = top0 + (resting.value - top0) * e;
    prevClip.value = resting.value - zone.value + c - GAP - LINE - GAP - prevTop.value;
    if (e < 1) frame = requestAnimationFrame(tick);
    else handOff();
  };
  frame = requestAnimationFrame(tick);
}

async function handOff() {
  const which = side.value;
  const link = neighbours.value[which]?.link;
  if (!link) { committing.value = false; finish(); return; }
  try {
    await router.go(link);
    await nextTick();
    // Both directions land at the top of the article.
    window.scrollTo(0, 0);
    // Keep the arriving preview over the real page until its new DOM and scroll
    // position have reached a paint frame. Otherwise the old article peeks
    // through while VitePress swaps the page and the mobile nav reappears.
    if (which === "next") await new Promise(requestAnimationFrame);
    finish();
  } finally {
    if (which === "next" && pull.value) finish();
    committing.value = false;
    if (which === "next") load();
  }
}

function blocked() {
  return committing.value || Boolean(document.querySelector(".VPLocalSearchBox"));
}

const mobileTouchNavigation = () => window.matchMedia("(max-width: 767px)").matches && navigator.maxTouchPoints > 0;

function onTouchStart(event) {
  if (!mobileTouchNavigation() || event.touches.length !== 1 || blocked()) return;
  touchY = event.touches[0].clientY;
  touchSide = null;
  if (pull.value) {
    // Catch a spring-back mid-flight.
    cancelAnimationFrame(frame);
    raw = undamp(pull.value);
    touchSide = side.value;
    touchY += side.value === "next" ? raw : -raw;
  }
}

function onTouchMove(event) {
  if (!mobileTouchNavigation() || touchY === null || blocked()) return;
  const y = event.touches[0].clientY;
  if (!touchSide) {
    // Start counting from the finger's last position. Dropping the first move
    // makes a fast swipe fail when a mobile browser coalesces touch events.
    const which = y < touchY && atEnd() && neighbours.value.next ? "next" : y > touchY && atTop() && neighbours.value.prev ? "prev" : null;
    if (!which) { touchY = y; return; }
    // Cancel the native gesture on the first directional move. Chrome can
    // claim a top-edge pull for its own overscroll action before a later move
    // gets a chance to cancel it.
    if (event.cancelable) event.preventDefault();
    begin(which, true);
    touchSide = which;
  }
  const value = touchSide === "next" ? touchY - y : y - touchY;
  if (value > 0 && event.cancelable) event.preventDefault();
  setRaw(value);
}

function onTouchEnd() {
  if (touchY === null) return;
  touchY = null;
  touchSide = null;
  if (pull.value) release();
}

function onTouchCancel() {
  if (touchY === null) return;
  touchY = null;
  touchSide = null;
  // Chrome can cancel a touch when the browser or OS takes over the gesture.
  // Cancellation is not the same as the reader lifting their finger: never
  // navigate on it, and let any partial pull return to rest.
  if (pull.value && !committing.value) animate(0, SPRING_MS, finish);
}

function reset() {
  cancelAnimationFrame(frame);
  finish();
}

watch(() => route.path, () => {
  // The next preview is the visible handoff surface. Loading neighbours here
  // would unmount it before the destination article is ready to show.
  if (committing.value && side.value === "next") return;
  if (!committing.value) reset();
  load();
});
watch(ready, (value) => { pullState.ready = value; });
onMounted(() => {
  measure();
  load();
  document.documentElement.classList.add("pull-to-next");
  document.addEventListener("click", onPullLinkClick, true);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchCancel, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
});
onUnmounted(() => {
  reset();
  loadToken += 1;
  pullState.prevTitle = "";
  pullState.prevLink = "";
  pullState.nextTitle = "";
  document.documentElement.classList.remove("pull-to-next");
  document.removeEventListener("click", onPullLinkClick, true);
  window.removeEventListener("touchstart", onTouchStart);
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("touchend", onTouchEnd);
  window.removeEventListener("touchcancel", onTouchCancel);
  window.removeEventListener("resize", measure);
});
</script>

<template>
  <!-- The end of the article: a link to the next one, else a quiet mark. -->
  <PullLink v-if="neighbours.next" class="post-end-hint" direction="next" :title="neighbours.next.title" :href="neighbours.next.link" :chinese="chinese" />
  <p v-else class="post-end-hint post-end-mark" aria-hidden="true">· · ·</p>

  <Teleport to="body">
    <!-- Next: its top, waiting below the bottom edge. -->
    <div
      v-if="neighbours.next"
      ref="nextPreview"
      class="pull-preview blog-article-page"
      :class="{ 'is-committing': committing && side === 'next' }"
      :style="{
        left: `${column.left}px`,
        width: `${column.width}px`,
        transform: `translate3d(0, ${(viewport - (side === 'next' ? pull : 0) + GAP + LINE + GAP + zone).toFixed(2)}px, 0)`,
        visibility: side === 'next' && pull > 0 ? 'visible' : 'hidden',
      }"
      aria-hidden="true"
    >
      <PostHeader :frontmatter="neighbours.next.frontmatter" :chinese="chinese" :hint-title="neighbours.next.prevTitle" :hint-link="neighbours.next.prevLink" />
      <main class="main"><div class="vp-doc" style="position: relative"><component :is="neighbours.next.component" /></div></main>
    </div>

    <!-- Previous: a window onto its top, its title resting on this article. The
         window starts one zone above the title so its own zone isn't cut off. -->
    <div
      v-if="neighbours.prev"
      ref="prevPreview"
      class="pull-preview pull-preview-prev blog-article-page"
      :class="{ 'is-committing': committing && side === 'prev' }"
      :style="{
        left: `${column.left}px`,
        width: `${column.width}px`,
        height: `${Math.max(0, prevClip + zone).toFixed(2)}px`,
        paddingTop: `${zone}px`,
        transform: `translate3d(0, ${(prevTop - zone).toFixed(2)}px, 0)`,
        visibility: side === 'prev' && pull > 0 ? 'visible' : 'hidden',
      }"
      aria-hidden="true"
    >
      <PostHeader :frontmatter="neighbours.prev.frontmatter" :chinese="chinese" :hint-title="neighbours.prev.prevTitle" :hint-link="neighbours.prev.prevLink" />
      <main class="main"><div class="vp-doc" style="position: relative"><component :is="neighbours.prev.component" /></div></main>
    </div>

    <!-- The hints, just past each edge: revealed by the pull, gone on the glide. -->
    <div
      v-if="neighbours.next"
      class="pull-hint-layer"
      :class="{ 'is-committing': committing && side === 'next' }"
      :style="{
        left: `${column.left}px`,
        width: `${column.width}px`,
        transform: `translate3d(0, ${(viewport - pull + GAP).toFixed(2)}px, 0)`,
        visibility: side === 'next' && pull > 0 ? 'visible' : 'hidden',
      }"
    >
      <PullHint direction="next" :chinese="chinese" :progress="Math.min(1, pull / COMMIT)" :ready="ready" />
    </div>
    <div
      v-if="neighbours.prev"
      class="pull-hint-layer"
      :class="{ 'is-committing': committing && side === 'prev' }"
      :style="{
        left: `${column.left}px`,
        width: `${column.width}px`,
        transform: `translate3d(0, ${(resting - zone + pull - GAP - LINE).toFixed(2)}px, 0)`,
        visibility: side === 'prev' && pull > 0 ? 'visible' : 'hidden',
      }"
    >
      <PullHint direction="prev" :chinese="chinese" :progress="Math.min(1, pull / COMMIT)" :ready="ready" />
    </div>
  </Teleport>
</template>

<style scoped>
/* Reading space after the last line, then the next-post link in the final
   pull zone. Keep the zone at the page edge for the existing gesture. */
.post-end-hint { height: var(--pull-zone, 80px); margin: var(--post-end-space, 56px) 0 0; }
.post-end-mark {
  display: grid;
  place-items: center;
  color: var(--vp-c-text-3);
  font-size: .9rem;
  letter-spacing: .5em;
  line-height: 1;
}

/* The hint line past each edge. It belongs to no page, so it fades as the
   neighbour glides in. */
.pull-hint-layer {
  position: fixed;
  top: 0;
  z-index: 21;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  height: 20px;
  pointer-events: none;
  transition: opacity 300ms ease;
}
.pull-hint-layer.is-committing { opacity: 0; }

/* Neighbours wait just past the edges, over the article column only. */
.pull-preview {
  position: fixed;
  top: 0;
  z-index: 20;
  pointer-events: none;
  background: var(--vp-c-bg);
  will-change: transform;
}
/* The incoming article's previous-link zone sits above its header. Extend its
   surface behind that zone so the outgoing last lines never show through it. */
.pull-preview:not(.pull-preview-prev)::before {
  content: "";
  position: absolute;
  right: 0;
  bottom: 100%;
  left: 0;
  height: var(--pull-zone, 80px);
  background: var(--vp-c-bg);
}
.pull-preview-prev { box-sizing: border-box; overflow: hidden; }
</style>
