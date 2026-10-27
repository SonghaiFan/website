import { defineConfig } from "vitepress";

function tokenizeSearch(text: string) {
  return text.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) || [];
}

function processSearchTerm(term: string) {
  const normalized = term.toLowerCase();
  if (!/[\p{Script=Han}]/u.test(normalized)) return normalized;
  const characters = [...normalized];
  return [normalized, ...characters, ...characters.slice(0, -1).map((character, index) => character + characters[index + 1])];
}

// A standalone image with real alt text gets a caption. Obsidian embeds fall back
// to the file name as alt, which is not worth showing.
function imageCaptions(md: any) {
  const image = md.renderer.rules.image;
  md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const html = image(tokens, idx, options, env, self);
    const alt = tokens[idx].content.trim();
    const standalone = tokens.length === 1;
    const meaningful = alt && !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(alt) && !/^(image|img|pasted image.*)$/i.test(alt);
    return standalone && meaningful ? `${html}<span class="image-caption">${md.utils.escapeHtml(alt)}</span>` : html;
  };
}

export const shared = defineConfig({
  appearance: "dark",
  markdown: {
    config: imageCaptions,
    theme: {
      light: "light-plus",
      dark: "dark-plus",
    },
  },
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg?v=2" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://db.onlinewebfonts.com/c/95cecf452d3208890088a5b4c19c7ecf?family=Helvetica+Neue+ME",
        media: "print",
        onload: "this.media='all'",
      },
    ],
  ],

  rewrites: {
    "en/:rest*": ":rest*",
  },

  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,
  // Public Markdown files are downloadable source artifacts, not HTML pages.
  srcExclude: ["public/**/*.md"],
  sitemap: {
    hostname: "https://blog.songhai.site",
  },

  themeConfig: {
    search: {
      provider: "local",
      options: {
        miniSearch: {
          options: { tokenize: tokenizeSearch, processTerm: processSearchTerm },
        },
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: "搜索",
                buttonAriaLabel: "搜索文章",
              },
              modal: {
                displayDetails: "显示详细列表",
                resetButtonTitle: "清除搜索",
                backButtonTitle: "关闭搜索",
                noResultsText: "没有找到相关文章",
                footer: {
                  selectText: "选择",
                  selectKeyAriaLabel: "回车键",
                  navigateText: "导航",
                  navigateUpKeyAriaLabel: "上箭头",
                  navigateDownKeyAriaLabel: "下箭头",
                  closeText: "关闭",
                  closeKeyAriaLabel: "Esc 键",
                },
              },
            },
          },
        },
      },
    },
  },
});
