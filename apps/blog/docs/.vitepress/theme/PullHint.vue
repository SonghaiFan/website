<script setup>
import { computed } from "vue";
import PullMark from "./PullMark.vue";

// The hint that lives just past an article's edge — "[F] 继续上滑" under its end,
// "[F] 继续下滑" over its top, named for the finger's direction. It only comes into
// view when a pull reveals it (ArticlePull.vue); which article it leads to is
// already said by the link inside the page (PullLink). Past the threshold the
// verb becomes 松开阅读; both verbs share one cell, so the centred line never shifts.
const props = defineProps({
  direction: { type: String, required: true }, // "prev" | "next"
  chinese: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  ready: { type: Boolean, default: false },
});

const words = computed(() => {
  const next = props.direction === "next";
  return props.chinese
    ? { pull: next ? "继续上滑" : "继续下滑", go: "松开阅读" }
    : { pull: next ? "Swipe up" : "Swipe down", go: "Let go" };
});
</script>

<template>
  <p class="pull-hint" :class="{ 'is-ready': ready }" aria-hidden="true">
    <PullMark class="pull-hint-mark" :progress="progress" :ready="ready" />
    <span class="pull-hint-verb">
      <span class="pull-hint-pull">{{ words.pull }}</span>
      <span class="pull-hint-go">{{ words.go }}</span>
    </span>
  </p>
</template>

<style scoped>
.pull-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .5rem;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  color: var(--vp-c-text-3);
  font-size: .75rem;
  letter-spacing: .04em;
  line-height: 1.4;
  white-space: nowrap;
}
.pull-hint-mark { margin-right: .15rem; }

/* Both verbs in one cell: the line is as wide as the longer one, always. */
.pull-hint-verb { display: inline-grid; }
.pull-hint-pull,
.pull-hint-go {
  grid-area: 1 / 1;
  text-align: center;
  transition: opacity var(--songhai-motion-base) ease, color var(--songhai-motion-base) ease;
}
.pull-hint-go { opacity: 0; color: var(--vp-c-text-1); }
.pull-hint.is-ready .pull-hint-pull { opacity: 0; }
.pull-hint.is-ready .pull-hint-go { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .pull-hint-pull, .pull-hint-go { transition: none; }
}
</style>
