import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Plugin } from "vite";

const siteRoot = process.env.SONGHAI_BLOG_ROOT || process.cwd();
const vaultRoot = process.env.VAULT_ROOT;
if (!vaultRoot) throw new Error("Use npm run dev from songhai-web to configure VAULT_ROOT");
const stageRoot = path.join(siteRoot, ".stage");
const refreshRoot = path.join(siteRoot, ".stage-dev-refresh");
const stageScript = path.resolve(siteRoot, "../../scripts/stage-vitepress.mjs");


function filesUnder(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

function syncStage() {
  const nextFiles = filesUnder(refreshRoot);
  const nextPaths = new Set(nextFiles.map((file) => path.relative(refreshRoot, file)));
  for (const source of nextFiles) {
    const destination = path.join(stageRoot, path.relative(refreshRoot, source));
    const changed = !fs.existsSync(destination)
      || !fs.readFileSync(source).equals(fs.readFileSync(destination));
    if (!changed) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  for (const file of filesUnder(stageRoot)) {
    const relative = path.relative(stageRoot, file);
    if (["docs/.vitepress/cache/", "docs/.vitepress/dist/"].some((generated) => relative.startsWith(generated))) continue;
    if (!nextPaths.has(relative)) fs.rmSync(file);
  }
  fs.rmSync(refreshRoot, { recursive: true, force: true });
}

function regenerate(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [stageScript, vaultRoot, refreshRoot, siteRoot], {
      cwd: siteRoot,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Public blog staging failed (${code})`)));
  });
}

export function obsidianDevPlugin(): Plugin {
  return {
    name: "obsidian-blog-live-update",
    apply: "serve",
    async configureServer(server) {
      const { readPublishingConfig, CONFIG_FILE } = await import(pathToFileURL(path.resolve(siteRoot, "../../scripts/publishing-config.mjs")).href);
      let watchedRoots: string[] = [];
      const updateRoots = () => {
        const config = readPublishingConfig(vaultRoot);
        watchedRoots = [...[config.publicFolder, config.assetsFolder, ...config.privateFolders].map((name: string) => path.join(vaultRoot, name)), path.join(vaultRoot, CONFIG_FILE), path.join(siteRoot, "docs")];
        server.watcher.add(watchedRoots);
      };
      updateRoots();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = false;
      let closed = false;
      let pending = false;
      const refresh = async () => {
        if (closed) return;
        if (running) { pending = true; return; }
        running = true;
        do {
          pending = false;
          try {
            await regenerate();
            if (closed) return;
            updateRoots();
            syncStage();
            server.ws.send({ type: "full-reload" });
            console.info("[blog] Obsidian changes are live");
          } catch (error) {
            fs.rmSync(refreshRoot, { recursive: true, force: true });
            console.error("[blog] Could not update public blog:", error);
          }
        } while (pending && !closed);
        running = false;
      };
      const onFile = (event: string, file: string) => {
        if (!["add", "change", "unlink"].includes(event)) return;
        if (!watchedRoots.some((root) => file === root || file.startsWith(`${root}${path.sep}`))) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 150);
      };
      server.watcher.on("all", onFile);
      // Index updates restart VitePress; reconcile edits made while its watcher was offline.
      timer = setTimeout(() => void refresh(), 150);
      server.httpServer?.once("close", () => {
        closed = true;
        if (timer) clearTimeout(timer);
        server.watcher.off("all", onFile);
      });
    },
  };
}
