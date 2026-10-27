import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import HomeSearch from "./HomeSearch.vue";
import BlogFilter from "./BlogFilter.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("HomeSearch", HomeSearch);
    app.component("BlogFilter", BlogFilter);
  },
};
