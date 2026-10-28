<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { mountComments, updateComments } from '@songhai-engagement';

const { frontmatter, lang, isDark } = useData();
const host = ref(null);
const chinese = computed(() => lang.value.toLowerCase().startsWith('zh'));
const language = () => chinese.value ? 'zh-CN' : 'en';
const theme = () => isDark.value ? 'noborder_dark' : 'noborder_light';
let observer;
let cleanup;

function observe() {
  observer?.disconnect();
  cleanup?.();
  cleanup = undefined;
  if (!host.value || !frontmatter.value.commentTerm) return;
  const load = () => {
    observer?.disconnect();
    cleanup = mountComments(host.value, {
      term: frontmatter.value.commentTerm, lang: language(), theme: theme(),
    });
  };
  if (!('IntersectionObserver' in window)) return load();
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) load();
  }, { rootMargin: '240px' });
  observer.observe(host.value);
}
onMounted(observe);
watch(() => frontmatter.value.commentTerm, () => nextTick(observe));
watch([lang, isDark], () => host.value && updateComments(host.value, { lang: language(), theme: theme() }));
onUnmounted(() => { observer?.disconnect(); cleanup?.(); });
</script>

<template>
  <section class="article-comments" :aria-label="chinese ? '留言' : 'Comments'">
    <h2>{{ chinese ? '留言' : 'Comments' }}</h2>
    <p>{{ chinese ? '用 GitHub 登录，留下你的想法。留言会公开显示。' : 'Sign in with GitHub to join the conversation. Comments are public.' }}</p>
    <div ref="host" class="giscus" />
    <a href="https://github.com/SonghaiFan/website/discussions" target="_blank" rel="noopener noreferrer">{{ chinese ? '在 GitHub 查看讨论 ↗' : 'View discussions on GitHub ↗' }}</a>
  </section>
</template>

<style scoped>
.article-comments { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--vp-c-divider); }
h2 { font-size: 20px; font-weight: 500; }
p, a { font-size: 14px; color: var(--vp-c-text-2); }
p { margin: 10px 0 20px; }
.giscus { min-height: 180px; }
a { display: inline-block; margin-top: 12px; }
</style>
