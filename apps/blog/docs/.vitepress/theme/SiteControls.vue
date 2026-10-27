<script setup>
import { Moon, Sun } from "@lucide/vue";
import { ICON_STROKE } from "./icons.js";
import { computed, inject, onMounted, ref } from "vue";
import { inBrowser, useData, useRoute } from "vitepress";

const { isDark, frontmatter, lang } = useData();
const route = useRoute();
const homeOrigin = import.meta.env.DEV ? "http://127.0.0.1:4174" : "https://songhai.site";
const ready = ref(false);
onMounted(() => { ready.value = true; });
const chinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
const toggleAppearance = inject("toggle-appearance", () => { isDark.value = !isDark.value; });

function switchLanguage() {
  if (!inBrowser) return;
  const targetChinese = !chinese.value;
  const path = route.path.split("?")[0].split("#")[0];
  let target;
  if (frontmatter.value?.blogPost) {
    target = frontmatter.value.translationUrl || (targetChinese ? "/zh/" : "/");
  } else {
    const unprefixed = path.replace(/^\/zh(?=\/|$)/, "") || "/";
    target = targetChinese ? `/zh${unprefixed}` : unprefixed;
  }
  const url = new URL(target, window.location.origin);
  if (frontmatter.value?.journalHome) {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    if (type === "daily") url.searchParams.set("type", "note");
    else if (["note", "project"].includes(type)) url.searchParams.set("type", type);
    if (params.get("q")) url.searchParams.set("q", params.get("q"));
  }
  if (frontmatter.value?.translationUrl && new URLSearchParams(window.location.search).get("view") === "cards") {
    url.searchParams.set("view", "cards");
  }
  window.location.assign(url.href);
}
</script>

<template>
  <div class="site-controls">
    <button
      v-if="ready"
      type="button"
      class="site-control"
      :aria-label="isDark ? (chinese ? '切换到浅色主题' : 'Switch to light theme') : (chinese ? '切换到深色主题' : 'Switch to dark theme')"
      :title="isDark ? (chinese ? '浅色主题' : 'Light theme') : (chinese ? '深色主题' : 'Dark theme')"
      @click="toggleAppearance"
    >
      <Moon v-if="isDark" :size="17" :stroke-width="ICON_STROKE" aria-hidden="true" />
      <Sun v-else :size="17" :stroke-width="ICON_STROKE" aria-hidden="true" />
    </button>
    <button
      v-if="ready"
      type="button"
      class="site-control site-control-text"
      :lang="chinese ? 'en' : 'zh'"
      :aria-label="chinese ? 'Read in English' : '切换到简体中文'"
      :title="chinese ? 'English' : '简体中文'"
      @click="switchLanguage"
    >
      {{ chinese ? "English" : "中文" }}
    </button>
    <a class="site-control site-home-link" :href="`${homeOrigin}/?lang=${chinese ? 'zh' : 'en'}`" :aria-label="chinese ? '返回主页' : 'Back to home'" :title="chinese ? '返回主页' : 'Back to home'">
      <img src="/images/dialog-avatar.png" width="32" height="32" alt="" />
    </a>
  </div>
</template>

<style scoped>
.site-controls { display: flex; align-items: center; gap: var(--site-header-gap); min-height: 40px; }
.site-control {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color var(--songhai-motion-fast) ease, background-color var(--songhai-motion-fast) ease;
}
.site-control:hover { color: var(--vp-c-text-1); background: var(--vp-c-bg-soft); }
.site-control:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
.site-home-link { width: 44px; height: 44px; }
.site-home-link img { display: block; width: 32px; height: 32px; object-fit: contain; }
.site-control-text { width: auto; height: 44px; border-radius: 0; font: 500 14px/1 "Helvetica Neue", Helvetica, Arial, sans-serif; text-decoration: none; }
.site-control-text:hover { background: transparent; color: var(--site-header-accent); }
@media (prefers-reduced-motion: reduce) { .site-control { transition: none; } }
</style>
