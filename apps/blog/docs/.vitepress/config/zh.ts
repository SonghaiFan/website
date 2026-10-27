import { defineConfig } from "vitepress";
import { zhBlogIndex, zhProjectIndex } from "../../../scripts/blogIndex";

export const zh = defineConfig({
  lang: "zh",
  title: "博客",
  description: "随笔与项目。关于数据、交互和 AI 的观察与实践。",

  themeConfig: {
    logo: { src: "/images/signature.svg", alt: "博客首页" },
    logoLink: "/zh/",
    siteTitle: false,
    lastUpdatedText: "更新时间",
    docFooter: { prev: "上一篇", next: "下一篇" },

    nav: [],

    outline: { level: [2, 3], label: "本页目录" },

    sidebar: {
      "/zh/blog/": zhBlogIndex,
      "/zh/projects/": zhProjectIndex,
    },

    footer: {
      message: "Study things. Build tools. Play with ideas.",
    },
  },
});
