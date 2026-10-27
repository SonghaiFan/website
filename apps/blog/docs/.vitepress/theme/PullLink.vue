<script setup>
import { computed } from "vue";
import { useData } from "vitepress";

// The pull zone inside an article: a band above the title and one under the last
// line, the same height (--pull-zone). Phones keep a normal link; desktops use
// a button so VitePress does not navigate before ArticlePull's glide finishes.
const props = defineProps({
  direction: { type: String, required: true }, // "prev" | "next"
  title: { type: String, default: "" },
  href: { type: String, default: "" },
  chinese: { type: Boolean, default: false },
});

const { frontmatter } = useData();
const where = computed(() => {
  const next = props.direction === "next";
  // Projects are not 篇: "上一个 / 下一个" there.
  const unit = frontmatter.value?.project ? "一个" : "一篇";
  return props.chinese ? (next ? `下${unit}` : `上${unit}`) : (next ? "Next" : "Previous");
});
</script>

<template>
  <div class="pull-link-zone">
    <a class="pull-link pull-link-touch" :href="href">
      <span class="pull-link-where">{{ where }}</span>
      <span class="pull-link-title">{{ title }}</span>
    </a>
    <button type="button" class="pull-link pull-link-desktop" :data-href="href">
      <span class="pull-link-where">{{ where }}</span>
      <span class="pull-link-title">{{ title }}</span>
    </button>
  </div>
</template>

<style scoped>
.pull-link-zone {
  display: grid;
  /* The cell is the column's width: a long title truncates, never widens the page. */
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  height: var(--pull-zone, 80px);
}
.pull-link {
  display: flex;
  align-items: baseline;
  gap: .6rem;
  min-width: 0;
  max-width: 100%;
  color: var(--vp-c-text-3);
  font-size: .75rem;
  letter-spacing: .04em;
  line-height: 1.4;
  text-decoration: none;
  white-space: nowrap;
}
.pull-link-desktop {
  display: none;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
@media (min-width: 768px) {
  .pull-link-touch { display: none; }
  .pull-link-desktop { display: flex; }
}
.pull-link-title {
  min-width: 0;
  overflow: hidden;
  color: var(--vp-c-text-2);
  letter-spacing: .01em;
  text-overflow: ellipsis;
  transition: color var(--songhai-motion-base) var(--songhai-ease-out);
}
.pull-link:hover .pull-link-title,
.pull-link:focus-visible .pull-link-title { color: var(--vp-c-text-1); }
.pull-link:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 4px; border-radius: 2px; }
@media (prefers-reduced-motion: reduce) {
  .pull-link-title { transition: none; }
}
</style>
