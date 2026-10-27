import { defineConfig } from "vitepress";
import { enBlogIndex, enProjectIndex } from "../../../scripts/blogIndex";

export const en = defineConfig({
  lang: "en",
  title: "Blog",
  description: "Notes and projects on data, interfaces, and AI.",

  themeConfig: {
    logo: { src: "/images/signature.svg", alt: "Blog home" },
    logoLink: "/",
    siteTitle: false,

    nav: [],

    outline: { level: [2, 3], label: "On this page" },

    sidebar: {
      "/blog/": enBlogIndex,
      "/projects/": enProjectIndex,
    },

    footer: {
      message: "Study things. Build tools. Play with ideas.",
    },
  },
});
