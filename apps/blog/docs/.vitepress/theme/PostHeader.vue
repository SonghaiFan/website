<script setup>
import { computed, onUnmounted, ref } from "vue";
import { Check, GalleryHorizontalEnd, Share2 } from "@lucide/vue";
import { ICON_STROKE } from "./icons.js";
import PullLink from "./PullLink.vue";

// The article header: title, then one quiet line of metadata. One component for
// both the page's own header (Layout.vue) and the neighbouring articles previewed
// by ArticlePull.vue, so they lay out identically — the hand-off depends on it.
const props = defineProps({
  frontmatter: { type: Object, required: true },
  chinese: { type: Boolean, default: false },
  cardView: { type: Boolean, default: false },
  // The previous article: the pull zone above the title links to it
  // ("上一篇  标题"). Out of the flow, so it never moves the title.
  hintTitle: { type: String, default: "" },
  hintLink: { type: String, default: "" },
  shareable: { type: Boolean, default: true },
});
defineEmits(["toggle-cards"]);

const shareFeedback = ref("");
const shareSucceeded = ref(false);
let shareFeedbackTimeout;

function showShareFeedback(message, succeeded = false) {
  shareFeedback.value = message;
  shareSucceeded.value = succeeded;
  clearTimeout(shareFeedbackTimeout);
  shareFeedbackTimeout = setTimeout(() => {
    shareFeedback.value = "";
    shareSucceeded.value = false;
  }, 2400);
}

async function sharePost() {
  const postUrl = new URL(window.location.href);
  postUrl.searchParams.delete("view");
  postUrl.hash = "";
  const shareUrl = postUrl.href;
  shareFeedback.value = "";
  shareSucceeded.value = false;
  try {
    if (navigator.share) {
      try {
        await navigator.share({ title: props.frontmatter.title, url: shareUrl });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(shareUrl);
    showShareFeedback(props.chinese ? "文章链接已复制" : "Post link copied", true);
  } catch (error) {
    if (error?.name === "AbortError") return;
    showShareFeedback(props.chinese ? "分享失败，请检查浏览器权限" : "Could not share this link");
  }
}

onUnmounted(() => clearTimeout(shareFeedbackTimeout));

const viewLinkLabel = computed(() => props.cardView
  ? (props.chinese ? "返回全文" : "Back to text")
  : (props.chinese ? "卡片阅读" : "Read as cards"));

const formatDate = (date) => {
  const [year, month, day] = String(date).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(
    props.chinese ? "zh-CN" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
};
</script>

<template>
  <header class="blog-post-header">
    <PullLink v-if="hintTitle && !cardView" class="post-pull-hint" direction="prev" :title="hintTitle" :href="hintLink" :chinese="chinese" />
    <h1 v-if="frontmatter.title && !cardView" class="post-title">
      {{ frontmatter.title }}
    </h1>
    <div class="post-info">
      <template v-if="!cardView">
        <time v-if="frontmatter.date || frontmatter.displayDate" class="post-time" :datetime="frontmatter.date || frontmatter.displayDate">
          {{ formatDate(frontmatter.date || frontmatter.displayDate) }}
        </time>
        <!-- A project page shows when the work ran where a post shows its date. -->
        <span v-else-if="frontmatter.period" class="post-time">{{ String(frontmatter.period).replace(/\s*-\s*/, "–") }}</span>
        <span v-if="frontmatter.readingMinutes" class="post-reading">
          {{ chinese ? `${frontmatter.readingMinutes} 分钟阅读` : `${frontmatter.readingMinutes} min read` }}
        </span>
        <span v-if="frontmatter.tags?.length" class="post-tags">
          <span v-for="tag in frontmatter.tags" :key="tag" class="tag">{{ tag }}</span>
        </span>
      </template>
      <!-- The actions sit apart at the end of the line, no "·" before them. -->
      <span class="post-actions">
      <span v-if="shareFeedback" class="share-feedback" role="status" aria-live="polite">{{ shareFeedback }}</span>
      <span class="post-view">
        <button
          type="button"
          class="post-view-link"
          :aria-pressed="cardView"
          :aria-label="viewLinkLabel"
          :title="viewLinkLabel"
          @click="$emit('toggle-cards')"
        >
          <!-- Lucide "gallery-horizontal-end": cards stacked sideways, as the deck swipes. -->
          <GalleryHorizontalEnd :size="16" :stroke-width="ICON_STROKE" aria-hidden="true" />
        </button>
      </span>
      <span v-if="shareable && frontmatter.rawMarkdownUrl" class="post-share">
        <button
          type="button"
          class="post-view-link"
          :aria-label="chinese ? '分享文章链接' : 'Share post link'"
          :title="chinese ? '分享文章链接' : 'Share post link'"
          @click="sharePost"
        >
          <Check v-if="shareSucceeded" :size="16" :stroke-width="ICON_STROKE" aria-hidden="true" />
          <Share2 v-else :size="16" :stroke-width="ICON_STROKE" aria-hidden="true" />
        </button>
      </span>
      </span>
    </div>
  </header>
</template>

<style scoped>
/* Title first, one quiet line of metadata, then the writing. No rules or pills. */
.blog-post-header {
  position: relative;
  margin: 0 0 3rem;
}

/* The pull zone above the title: the page's top space, exactly (--pull-zone,
   the same height as the zone under the last line). Out of the flow. */
.post-pull-hint {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  height: var(--pull-zone, 80px);
}

.post-title {
  margin: 0;
  font-size: clamp(2.1rem, 4.2vw, 3rem);
  font-weight: 600;
  letter-spacing: -.03em;
  line-height: 1.12;
  color: var(--vp-c-text-1);
  text-wrap: balance;
}

/* Centred, not baseline-aligned: the line mixes text and icons, and icons have
   no baseline. Every item shares one centre line, at any width. */
.post-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .35rem .6rem;
  margin-top: 1.1rem;
  color: var(--vp-c-text-2);
  font-size: .9rem;
  line-height: 1.5;
}

.post-time,
.post-reading { font-variant-numeric: tabular-nums; }
.post-info > * + *::before {
  content: "·";
  margin-right: .6rem;
  color: var(--vp-c-text-3);
}
/* Tags are one item: "#python  #matplotlib". The "#" sets them apart, so no "·"
   before the group — space alone, and nothing stranded when they wrap. */
.post-info > .post-tags::before { content: none; }
.post-tags { display: inline-flex; flex-wrap: wrap; gap: .1rem .65rem; margin-left: .35rem; }
.tag::before { content: "#"; margin-right: .1em; color: var(--vp-c-text-3); }
/* Card view and share: a small group at the end of the line, set apart by
   space rather than a "·". */
.post-info > .post-actions::before { content: none; }
.post-actions {
  display: inline-flex;
  align-items: center;
  gap: .15rem;
  margin-left: auto;
  margin-right: -.4rem;
  /* The text's visual centre sits 2.5px above its line box's centre (this
     font's metrics); measured the same at every width, so one fixed lift. */
  position: relative;
  top: -2.5px;
}

.post-view-link {
  color: var(--vp-c-text-2);
  font: inherit;
  text-decoration: none;
  transition: color var(--songhai-motion-fast) ease;
}

.post-view-link {
  display: inline-grid;
  place-items: center;
  /* A comfortable target around a small icon, without moving the line. */
  width: 1.75rem;
  height: 1.75rem;
  margin: -.4rem 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  vertical-align: middle;
  transition: color var(--songhai-motion-fast) ease, background-color var(--songhai-motion-fast) ease;
}
.post-view-link svg { width: 16px; height: 16px; }
.post-view-link:hover { background: var(--vp-c-bg-soft); }
.share-feedback {
  color: var(--vp-c-text-2);
  font-size: .8rem;
}
.share-feedback { margin-right: .35rem; }

.post-view-link:hover { color: var(--vp-c-text-1); }
.post-view-link:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }

.is-card-view .blog-post-header {
  width: min(100%, 648px);
  margin: 0 auto .75rem;
}
.is-card-view .post-info { margin-top: 0; }

@media (max-width: 640px) {
  .blog-post-header { margin-bottom: 2.25rem; }
  /* Narrow: date · reading time … actions on the first line, tags on their own. */
  .post-tags { order: 2; flex-basis: 100%; margin-left: 0; }
  .post-title { font-size: clamp(1.9rem, 8vw, 2.4rem); }
}

@media (prefers-reduced-motion: reduce) {
  .post-view-link { transition: none; }
}
</style>
