import { reactive } from "vue";

// Shared between ArticlePull.vue (which owns the gesture) and Layout.vue (whose
// page header shows the "继续上滑 · 上一篇" hint above the title). Wording and
// layout of both hints live in PullHint.vue.
export const pullState = reactive({
  prevTitle: "",
  prevLink: "",
  nextTitle: "",
  side: null,   // "prev" | "next" while a pull is under way
  ready: false, // past the threshold: letting go will go
  progress: 0,  // pull / threshold, 0..1 (drawn by PullMark)
});

