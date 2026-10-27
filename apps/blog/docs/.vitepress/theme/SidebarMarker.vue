<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vitepress";

// One bar for the sidebar's current article, instead of a border on whichever
// item is active. VitePress keeps the sidebar mounted between articles, so the
// bar can glide from the old item to the new one and take its height (titles
// wrap to one or two lines). The first placement does not animate.
const route = useRoute();
const bar = ref(null);
const style = ref({ opacity: 0 });
const animate = ref(false);
let nav;
let observer;

function place() {
  if (!nav) return;
  const item = nav.querySelector(".VPSidebarItem.level-1.is-active > .item");
  if (!item) {
    style.value = { ...style.value, opacity: 0 };
    return;
  }
  const navBox = nav.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  style.value = {
    opacity: 1,
    height: `${box.height}px`,
    // Sits 12px left of the item, in the gutter, so the item's own layout is untouched.
    transform: `translate3d(${(box.left - navBox.left - 12).toFixed(1)}px, ${(box.top - navBox.top).toFixed(1)}px, 0)`,
  };
}

onMounted(() => {
  nav = bar.value?.closest("nav");
  place();
  // Turn transitions on only after the first placement has painted.
  requestAnimationFrame(() => requestAnimationFrame(() => { animate.value = true; }));
  observer = new ResizeObserver(place);
  if (nav) observer.observe(nav);
});
onUnmounted(() => observer?.disconnect());
watch(() => route.path, () => nextTick(() => requestAnimationFrame(place)));
</script>

<template>
  <span ref="bar" class="sidebar-marker" :class="{ 'is-animated': animate }" :style="style" aria-hidden="true" />
</template>

<style scoped>
.sidebar-marker {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  width: 2px;
  border-radius: 2px;
  background: var(--vp-c-text-1);
  pointer-events: none;
}
.sidebar-marker.is-animated {
  transition:
    transform var(--songhai-motion-slow) var(--songhai-ease-out),
    height var(--songhai-motion-slow) var(--songhai-ease-out),
    opacity var(--songhai-motion-base) ease;
}
@media (prefers-reduced-motion: reduce) {
  .sidebar-marker.is-animated { transition: none; }
}
</style>
