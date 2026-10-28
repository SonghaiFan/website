<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { loadCommentTheme, mountComments, updateComments } from '@songhai-engagement';

const { frontmatter, lang, isDark } = useData();
const host = ref(null);
const chinese = computed(() => lang.value.toLowerCase().startsWith('zh'));
const language = () => chinese.value ? 'zh-CN' : 'en';
const theme = () => loadCommentTheme(isDark.value);
let observer;
let cleanup;
let revision = 0;

function observe() {
  const current = ++revision;
  observer?.disconnect();
  cleanup?.();
  cleanup = undefined;
  if (!host.value || !frontmatter.value.commentTerm) return;
  const load = async () => {
    observer?.disconnect();
    try {
      const resolvedTheme = await theme();
      if (current !== revision || !host.value) return;
      cleanup = mountComments(host.value, {
        term: frontmatter.value.commentTerm, lang: language(), theme: resolvedTheme,
      });
    } catch (error) { console.warn('[comments]', error); }
  };
  if (!('IntersectionObserver' in window)) return load();
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) load();
  }, { rootMargin: '240px' });
  observer.observe(host.value);
}
onMounted(observe);
watch(() => frontmatter.value.commentTerm, () => nextTick(observe));
watch([lang, isDark], async () => {
  const dark = isDark.value;
  try {
    const resolvedTheme = await theme();
    if (host.value && dark === isDark.value) updateComments(host.value, { lang: language(), theme: resolvedTheme });
  } catch (error) { console.warn('[comments]', error); }
});
onUnmounted(() => { revision++; observer?.disconnect(); cleanup?.(); });
</script>

<template>
  <section class="article-comments" :aria-label="chinese ? '留言' : 'Comments'">
    <h2>{{ chinese ? '留言' : 'Comments' }}</h2>
    <p>{{ chinese ? '聊聊你的想法。' : 'Join the conversation.' }}</p>
    <div ref="host" class="giscus" />
    <a href="https://github.com/SonghaiFan/website/discussions" target="_blank" rel="noopener noreferrer">{{ chinese ? '在 GitHub 查看讨论 ↗' : 'View discussions on GitHub ↗' }}</a>
  </section>
</template>

<style scoped>
.article-comments { margin-top: 72px; padding-top: 0; }
h2 { font-size: 22px; font-weight: 600; letter-spacing: -.02em; }
p, a { font-size: 14px; color: var(--vp-c-text-2); }
p { margin: 6px 0 28px; }
.giscus { min-height: 180px; }
a { display: inline-block; margin-top: 12px; font-size: 12px; }
</style>
