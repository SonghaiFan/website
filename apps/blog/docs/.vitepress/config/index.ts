import { defineConfig } from "vitepress";
import { shared } from "./shared";
import { en } from "./en";
import { zh } from "./zh";
import { obsidianDevPlugin } from "./obsidian-dev";
import path from "node:path";

export default defineConfig({
  ...shared,
  vite: {
    resolve: { alias: { '@songhai-engagement': path.resolve(process.env.SONGHAI_BLOG_ROOT || process.cwd(), '../home/engagement.js') } },
    plugins: [obsidianDevPlugin()],
    server: { host: "127.0.0.1", port: 5173, strictPort: true, cors: { origin: ["http://127.0.0.1:4174", "https://giscus.app"] }, fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/Daily/**", "**/Notes/**"] } },
  },
  locales: {
    root: { label: "English", link: "/", ...en },
    zh: { label: "简体中文", link: "/zh/", ...zh },
  },
});
