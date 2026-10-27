<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useData } from "vitepress";

const { lang } = useData();
const chinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
const choices = computed(() => chinese.value
  ? [{ value: "all", label: "全部" }, { value: "note", label: "随笔" }, { value: "project", label: "项目" }]
  : [{ value: "all", label: "All" }, { value: "note", label: "Notes" }, { value: "project", label: "Projects" }]);
const selected = ref("all");
const valid = new Set(["note", "project"]);

function applyFromUrl() {
  const value = new URLSearchParams(window.location.search).get("type");
  selected.value = value === "daily" ? "note" : valid.has(value) ? value : "all";
  if (value === "daily") {
    const url = new URL(window.location.href);
    url.searchParams.set("type", "note");
    window.history.replaceState(window.history.state, "", url);
  }
  for (const entry of document.querySelectorAll(".journal-index .journal-entry[data-type]")) {
    entry.hidden = selected.value !== "all" && entry.dataset.type !== selected.value;
  }
  window.dispatchEvent(new CustomEvent("blog-type-change", { detail: selected.value }));
}

function choose(value) {
  if (selected.value === value) return;
  const url = new URL(window.location.href);
  if (value === "all") url.searchParams.delete("type");
  else url.searchParams.set("type", value);
  window.history.pushState(window.history.state, "", url);
  applyFromUrl();
}

onMounted(() => {
  applyFromUrl();
  window.addEventListener("popstate", applyFromUrl);
});
onUnmounted(() => window.removeEventListener("popstate", applyFromUrl));
</script>

<template>
  <nav class="blog-filter" :aria-label="chinese ? '博客分类' : 'Blog categories'">
    <button
      v-for="choice in choices"
      :key="choice.value"
      type="button"
      :class="{ 'is-active': selected === choice.value }"
      :aria-current="selected === choice.value ? 'page' : undefined"
      @click="choose(choice.value)"
    >{{ choice.label }}</button>
  </nav>
</template>
