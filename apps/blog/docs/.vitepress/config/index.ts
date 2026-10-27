import { defineConfig } from "vitepress";
import { shared } from "./shared";
import { en } from "./en";
import { zh } from "./zh";
import { obsidianDevPlugin } from "./obsidian-dev";

export default defineConfig({
  ...shared,
  vite: {
    plugins: [obsidianDevPlugin()],
    server: { host: "127.0.0.1", port: 5173, strictPort: true, cors: { origin: "http://127.0.0.1:4174" }, fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/Daily/**", "**/Notes/**"] } },
  },
  locales: {
    root: { label: "English", link: "/", ...en },
    zh: { label: "简体中文", link: "/zh/", ...zh },
  },
});
