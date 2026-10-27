<script setup>
import DefaultTheme from "vitepress/theme";
import { useData, useRoute, inBrowser } from "vitepress";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import CardDeck from "./CardDeck.vue";
import SiteControls from "./SiteControls.vue";
import SidebarMarker from "./SidebarMarker.vue";
import PostHeader from "./PostHeader.vue";
import ArticlePull from "./ArticlePull.vue";
import { pullState } from "./pull-state.js";

const { Layout } = DefaultTheme;
const { frontmatter, lang } = useData();
const route = useRoute();
const cardView = ref(false);
const mobileNavHidden = ref(false);
const chinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
let lastScrollY = 0;
let scrollTravel = 0;

function updateMobileNav() {
  const y = Math.max(0, window.scrollY);
  const delta = y - lastScrollY;
  lastScrollY = y;
  if (window.innerWidth > 767 || cardView.value || y < 80 ||
      document.querySelector('.VPNavBarHamburger[aria-expanded="true"], .VPLocalSearchBox')) {
    mobileNavHidden.value = false;
    scrollTravel = 0;
    return;
  }
  // Ignore tiny layout shifts and toolbar changes. A deliberate change of
  // direction, rather than every scroll event, controls the header.
  if (Math.abs(delta) < 2) return;
  if (Math.sign(delta) !== Math.sign(scrollTravel)) scrollTravel = 0;
  scrollTravel += delta;
  if (!mobileNavHidden.value && scrollTravel > 32) {
    mobileNavHidden.value = true;
    scrollTravel = 0;
  } else if (mobileNavHidden.value && scrollTravel < -18) {
    mobileNavHidden.value = false;
    scrollTravel = 0;
  }
}

function onMobileNavTap(event) {
  if (window.innerWidth > 767 || cardView.value || mobileNavHidden.value || window.scrollY <= 1 || event.button !== 0) return;
  if (!event.target.closest?.(".VPNavBar") ||
      event.target.closest("a, button, input, select, textarea, label, [role='button'], [tabindex]")) return;
  if (document.querySelector('.VPNavBarHamburger[aria-expanded="true"], .VPLocalSearchBox')) return;
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}
function syncCardView() {
  cardView.value = inBrowser && new URLSearchParams(window.location.search).get("view") === "cards";
}

function applyCardView(enabled) {
  const url = new URL(window.location.href);
  if (enabled) url.searchParams.set("view", "cards");
  else url.searchParams.delete("view");
  window.history.pushState({}, "", url);
  syncCardView();
}

// Text ⇄ cards: what is on screen leaves, then the other view arrives — the
// side panels slide out to their own edges and back from them, the article and
// the deck fade. Plain CSS animations on the real elements (see custom.css), not a
// view transition: a view transition draws the panels' snapshots above the whole
// page, nav included, so the sidebar's top strip covered the nav while it slid.
const viewPhase = ref(""); // "leaving-text" | "leaving-cards" | "entering-text" | "entering-cards"
let switching = false;
const LEAVE_MS = 220;
const ENTER_MS = 480;
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function toggleCardView(enabled) {
  if (!inBrowser || switching) return;
  if (enabled === cardView.value) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return applyCardView(enabled);
  switching = true;
  try {
    viewPhase.value = enabled ? "leaving-text" : "leaving-cards";
    await wait(LEAVE_MS);
    applyCardView(enabled);
    viewPhase.value = enabled ? "entering-cards" : "entering-text";
    await nextTick();
    if (!enabled) window.scrollTo(0, 0);
    await wait(ENTER_MS);
  } finally {
    viewPhase.value = "";
    switching = false;
  }
}

// Same-page anchors (footnotes, in-article links) glide instead of jumping. VitePress
// scrolls with window.scrollTo, which follows the root scroll-behavior, so smooth
// scrolling is switched on only for these clicks and never for page navigation.
let smoothScrollTimer;
function smoothSamePageAnchors(event) {
  // VitePress's own capture listener has already called preventDefault(); it scrolls
  // on the next frame, so setting scroll-behavior here still applies.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.("a[href*='#']");
  if (!link || link.target === "_blank") return;
  const url = new URL(link.href, window.location.href);
  if (url.pathname !== window.location.pathname || url.search !== window.location.search || !url.hash) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.style.scrollBehavior = "smooth";
  window.clearTimeout(smoothScrollTimer);
  const reset = () => { root.style.scrollBehavior = ""; window.removeEventListener("scrollend", reset); };
  window.addEventListener("scrollend", reset, { once: true });
  smoothScrollTimer = window.setTimeout(reset, 1200);
}

// Article images fade in as they arrive instead of popping in mid-read.
function fadeInImages() {
  for (const image of document.querySelectorAll(".blog-article-page .vp-doc img")) {
    if (image.complete || image.dataset.fade) continue;
    image.dataset.fade = "";
    image.classList.add("is-loading");
    const done = () => image.classList.remove("is-loading");
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  }
}

onMounted(() => {
  syncCardView();
  lastScrollY = Math.max(0, window.scrollY);
  window.addEventListener("scroll", updateMobileNav, { passive: true });
  window.addEventListener("resize", updateMobileNav, { passive: true });
  window.addEventListener("popstate", syncCardView);
  document.addEventListener("click", onMobileNavTap);
  document.addEventListener("click", smoothSamePageAnchors, true);
  fadeInImages();
});
onUnmounted(() => {
  window.removeEventListener("scroll", updateMobileNav);
  window.removeEventListener("resize", updateMobileNav);
  window.removeEventListener("popstate", syncCardView);
  document.removeEventListener("click", onMobileNavTap);
  document.removeEventListener("click", smoothSamePageAnchors, true);
  window.clearTimeout(smoothScrollTimer);
});
watch(() => frontmatter.value?.cardDataUrl, syncCardView);
watch(() => route.path, () => {
  mobileNavHidden.value = false;
  scrollTravel = 0;
  nextTick(() => { lastScrollY = Math.max(0, window.scrollY); fadeInImages(); });
});
watch(cardView, (cards) => {
  mobileNavHidden.value = false;
  if (!cards) nextTick(fadeInImages);
});

// Handle language persistence
watch(() => lang.value, (value) => {
  if (inBrowser) document.cookie = `nf_lang=${value}; expires=Mon, 1 Jan 2030 00:00:00 UTC; path=/`;
}, { immediate: true });

</script>

<template>
  <Layout :class="[{ 'blog-article-page': frontmatter.blogPost, 'journal-page': frontmatter.journalHome, 'is-card-view': cardView, 'mobile-nav-hidden': mobileNavHidden }, viewPhase && `view-${viewPhase}`]">
    <template #nav-bar-content-after>
      <SiteControls class="nav-site-controls" />
    </template>
    <template #doc-after>
      <ArticlePull v-if="frontmatter.blogPost && !cardView" />
    </template>
    <template #sidebar-nav-before>
      <SidebarMarker />
    </template>
    <template #nav-screen-content-after>
      <SiteControls class="screen-site-controls" />
    </template>
    <template #doc-before>
      <PostHeader
        v-if="frontmatter.blogPost && !cardView"
        :frontmatter="frontmatter"
        :chinese="chinese"
        :card-view="cardView"
        :hint-title="pullState.prevTitle"
        :hint-link="pullState.prevLink"
        @toggle-cards="toggleCardView(!cardView)"
      />
      <!-- Full screen under the nav; it carries its own way back to the text. -->
      <CardDeck v-if="frontmatter.blogPost && cardView" :src="frontmatter.cardDataUrl" :locale="lang" @exit="toggleCardView(false)" />
    </template>
  </Layout>
</template>

<style scoped>
/* The article header's own styles live in PostHeader.vue. */
.is-card-view :deep(.VPDoc .vp-doc) { display: none; }
.is-card-view :deep(.VPDocFooter) { display: none; }
</style>
