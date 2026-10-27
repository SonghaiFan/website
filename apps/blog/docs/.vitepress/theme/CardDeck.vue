<script setup>
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref } from "vue";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { ArrowLeft, ArrowRight, FolderDown, ImageDown } from "@lucide/vue";
import { ICON_STROKE } from "./icons.js";
import { layoutNextLineRange, prepareWithSegments } from "@chenglou/pretext";

const props = defineProps({ src: { type: String, required: true }, locale: { type: String, default: "en" } });
const emit = defineEmits(["exit"]);
const isZh = computed(() => props.locale.toLowerCase().startsWith("zh"));
const data = ref(null);
const pages = ref([]);
const current = ref(0);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const status = ref("");
const measureBody = ref(null);
const scale = ref(0.5);
// The card's box inside the stage: scaled to fit both ways, centred.
const box = ref({ w: 0, h: 0, left: 0, top: 0 });
const stage = ref(null);
const held = ref(false);
const obsidianColumnWidth = 640;
const IMAGE_LOAD_TIMEOUT_MS = 20_000;
let resizeObserver;
let gesture;
let suppressNextClick = false;

const slideCount = computed(() => pages.value.length + 2);
const coverImage = computed(() => {
  if (typeof document === "undefined") return null;
  for (const block of data.value?.blocks || []) {
    if (!block.html.includes("<img")) continue;
    const content = document.createElement("div");
    content.innerHTML = block.html;
    const image = content.querySelector('img[src^="/assets/"]');
    if (image) return image.getAttribute("src");
  }
  return null;
});
const filenameBase = computed(() => {
  if (!data.value?.sourceUrl) return "frank-cards";
  const last = new URL(data.value.sourceUrl).pathname.split("/").filter(Boolean).at(-1) || "frank-cards";
  return decodeURIComponent(last).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "frank-cards";
});

function pillarLabel() {
  const value = data.value?.pillar;
  if (value === "study") return "FRANK STUDY";
  if (value === "tools") return "FRANKLIN TOOLS";
  if (value === "play") return "FRANKIE PLAY";
  return "FRANK / JOURNAL";
}

function pillarIcon() {
  const icons = { study: "frank.svg", tools: "franklin.svg", play: "frankie.svg" };
  return `/assets/2026-09-22/${icons[data.value?.pillar] || "frank.svg"}`;
}

function formatCardDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(
    isZh.value ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric" },
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function measuredOverflow(html) {
  const body = measureBody.value;
  if (!body) return false;
  body.innerHTML = html;
  return body.scrollHeight > body.clientHeight + 1;
}

async function classifyImageBlock(block) {
  if (block.type !== "image" && block.type !== "image-row") return block;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = block.html;
  const dimensions = await Promise.all([...wrapper.querySelectorAll(".card-image-frame")].map(async (frame) => {
    const imageNode = frame.querySelector("img");
    const src = imageNode?.getAttribute("src");
    if (!src) return null;
    const requestedWidth = Number(imageNode.getAttribute("width")) || null;
    const requestedHeight = Number(imageNode.getAttribute("height")) || null;
    const image = new Image();
    image.src = new URL(src, document.baseURI).href;
    try { await image.decode(); } catch { return null; }
    const maxWidth = measureBody.value.clientWidth;
    const maxHeight = measureBody.value.clientHeight - 24;
    // Obsidian shows images within a 640px writing column. Keep the same
    // proportion when that column becomes the card's content width.
    const editorWidth = Math.min(requestedWidth || obsidianColumnWidth, image.naturalWidth, obsidianColumnWidth);
    const cardScale = maxWidth / obsidianColumnWidth;
    const width = editorWidth * cardScale;
    const height = width * image.naturalHeight / image.naturalWidth;
    const shrink = Math.min(1, maxHeight / height, requestedHeight ? requestedHeight * cardScale / height : 1);
    const frameWidth = Math.max(1, Math.round(width * shrink));
    const frameHeight = Math.max(1, Math.round(height * shrink));
    frame.style.width = `${frameWidth}px`;
    frame.style.height = `${frameHeight}px`;
    frame.style.marginInline = "auto";
    return { width: frameWidth, height: frameHeight, alt: imageNode.alt };
  }));
  const first = dimensions[0];
  return { ...block, html: wrapper.innerHTML,
    imageAlt: first?.alt || block.text || "",
    imageWidth: first?.width,
    imageHeight: first?.height,
  };
}

function wrappedTextLines(text, imageWidth, imageHeight) {
  const style = getComputedStyle(measureBody.value);
  const lineHeight = Number.parseFloat(style.lineHeight) || 50;
  const font = `${style.fontSize} ${style.fontFamily}`;
  const prepared = prepareWithSegments(text, font);
  const fullWidth = measureBody.value.clientWidth;
  const sideWidth = fullWidth - imageWidth - 24;
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let sideLines = 0;
  for (let line = 0; line < 1000; line++) {
    const besideImage = line * lineHeight < imageHeight + 12;
    const range = layoutNextLineRange(prepared, cursor, besideImage ? sideWidth : fullWidth);
    if (!range) break;
    if (besideImage) sideLines++;
    cursor = range.end;
  }
  return sideLines;
}

function wrapSmallImages(blocks) {
  const result = [];
  const canWrap = (image, paragraph) => image?.type === "image"
    && image.flowGroup === paragraph?.flowGroup
    && image.imageWidth + 24 <= measureBody.value.clientWidth * 0.5
    && paragraph?.type === "paragraph"
    && !/<img\b/i.test(paragraph.html)
    && paragraph.text?.trim();
  const combined = (image, paragraph) => {
    if (!canWrap(image, paragraph)) return null;
    if (wrappedTextLines(paragraph.text, image.imageWidth, image.imageHeight) < 1) return null;
    const block = {
      type: "image-text",
      html: `<div class="card-image-text">${image.html}${paragraph.html}</div>`,
      text: `${paragraph.text}\n${image.imageAlt}`,
      imageCount: 1,
      imageHeight: image.imageHeight,
    };
    const html = `<div class="card-block card-block-image-text">${block.html}</div>`;
    return measuredOverflow(html) ? null : block;
  };
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const following = combined(block, blocks[i + 1]);
    if (following) {
      result.push(following);
      i++;
      continue;
    }
    result.push(block);
  }
  return result;
}

function splitText(text, size = 320) {
  const segments = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(isZh.value ? "zh" : "en", { granularity: "sentence" }).segment(text)].map((part) => part.segment)
    : text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text];
  const chunks = [];
  let chunk = "";
  for (const segment of segments) {
    if (chunk && [...(chunk + segment)].length > size) {
      chunks.push(chunk.trim());
      chunk = "";
    }
    if ([...segment].length > size) {
      let rest = segment;
      while ([...rest].length > size) {
        const part = [...rest].slice(0, size).join("");
        chunks.push(part.trim());
        rest = [...rest].slice(size).join("");
      }
      chunk += rest;
    } else chunk += segment;
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks.length ? chunks : [text];
}

function splitOversized(block) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(block.html, "text/html");
  const root = parsed.body.firstElementChild;
  if (block.type === "code" && root) {
    const code = root.querySelector("code")?.textContent ?? root.textContent;
    const lines = code.split("\n").flatMap((line) => {
      const chars = [...line];
      if (chars.length <= 76) return [line];
      const parts = [];
      for (let i = 0; i < chars.length; i += 76) parts.push(chars.slice(i, i + 76).join(""));
      return parts;
    });
    const parts = [];
    for (let i = 0; i < lines.length; i += 14) {
      const source = lines.slice(i, i + 14).join("\n");
      parts.push({ type: "code", html: `<pre><code>${escapeHtml(source)}</code></pre>`, text: source });
    }
    return parts;
  }
  if (block.type === "table" && root?.tagName === "TABLE") {
    const rows = [...root.querySelectorAll("tbody tr")];
    const head = root.querySelector("thead")?.outerHTML || "";
    if (rows.length > 1) {
      const parts = [];
      for (let i = 0; i < rows.length; i += 5) {
        const rowHtml = rows.slice(i, i + 5).map((row) => row.outerHTML).join("");
        parts.push({ type: "table", html: `<table>${head}<tbody>${rowHtml}</tbody></table>`, text: rows.slice(i, i + 5).map((r) => r.innerText).join("\n") });
      }
      return parts;
    }
  }
  if (root && ["UL", "OL"].includes(root.tagName)) {
    const items = [...root.children].filter((child) => child.tagName === "LI");
    if (items.length > 1) {
      const tag = root.tagName.toLowerCase();
      const parts = [];
      for (let i = 0; i < items.length; i += 5) {
        const itemHtml = items.slice(i, i + 5).map((item) => item.outerHTML).join("");
        parts.push({ type: "list", html: `<${tag}>${itemHtml}</${tag}>`, text: items.slice(i, i + 5).map((item) => item.innerText).join("\n") });
      }
      return parts;
    }
  }
  return splitText(block.text || root?.textContent || "", block.type === "code" ? 280 : 320)
    .map((text) => ({ type: "paragraph", html: `<p>${escapeHtml(text)}</p>`, text }));
}

async function paginate(blocks) {
  await nextTick();
  await document.fonts?.ready;
  blocks = await Promise.all(blocks.map(classifyImageBlock));
  blocks = wrapSmallImages(blocks);
  const result = [];
  let page = [];
  const htmlFor = (items) => items.map((item) => `<div class="card-block card-block-${item.type}">${item.html}</div>`).join("");
  const hasRoom = (items) => !measuredOverflow(htmlFor(items));
  const scaledImage = (block, factor) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = block.html;
    const frame = wrapper.querySelector(".card-image-frame");
    const imageWidth = Math.round(block.imageWidth * factor);
    const imageHeight = Math.round(block.imageHeight * factor);
    frame.style.width = `${imageWidth}px`;
    frame.style.height = `${imageHeight}px`;
    return { ...block, html: wrapper.innerHTML, imageWidth, imageHeight };
  };
  const fitImageOnPage = (block, items) => {
    if (block.type !== "image" || !Number.isFinite(block.imageWidth) || !Number.isFinite(block.imageHeight)
      || block.imageWidth < measureBody.value.clientWidth * 0.6) return null;
    const minimum = 0.75;
    if (!hasRoom([...items, scaledImage(block, minimum)])) return null;
    let low = minimum;
    let high = 1;
    for (let i = 0; i < 7; i++) {
      const middle = (low + high) / 2;
      if (hasRoom([...items, scaledImage(block, middle)])) low = middle;
      else high = middle;
    }
    return scaledImage(block, low);
  };
  const finishPage = () => {
    if (page.length) result.push(page);
    page = [];
  };
  const addBlock = (block, nextBlock) => {
    if (page.length && block.type === "heading" && nextBlock
      && hasRoom([block, nextBlock]) && !hasRoom([...page, block, nextBlock])) {
      finishPage();
    }
    const candidate = [...page, block];
    if (hasRoom(candidate)) {
      page = candidate;
      return;
    }
    const fitted = page.length && fitImageOnPage(block, page);
    if (fitted) {
      page = [...page, fitted];
      return;
    }
    finishPage();
    if (hasRoom([block])) {
      page = [block];
      return;
    }
    for (const part of splitOversized(block)) {
      if (page.length && !hasRoom([...page, part])) finishPage();
      page.push(part);
    }
  };
  for (let i = 0; i < blocks.length; i++) {
    // A Markdown thematic break (`---`) is an explicit card page boundary.
    if (blocks[i].type === "page-break" || blocks[i].type === "divider") {
      finishPage();
      continue;
    }
    addBlock(blocks[i], blocks[i + 1]);
  }
  if (page.length) result.push(page);
  measureBody.value.innerHTML = "";
  pages.value = result;
}

// Fit the 1080×1350 card into the stage both ways (contain), centred, leaving
// room under it for the edge of the card beneath.
function updateScale() {
  if (!stage.value) return;
  const sw = stage.value.clientWidth;
  const sh = stage.value.clientHeight - DROP;
  const s = Math.max(0.1, Math.min(sw / 1080, sh / 1350, 1));
  const w = 1080 * s;
  const h = 1350 * s;
  scale.value = s;
  box.value = { w, h, left: (sw - w) / 2, top: (sh - h) / 2 };
  paint();
}

onMounted(() => {
  document.documentElement.classList.add("cards-open");
  window.addEventListener("keydown", onWindowKey);
});
onMounted(async () => {
  try {
    const response = await fetch(props.src);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    data.value = await response.json();
    loading.value = false;
    await nextTick();
    resizeObserver = new ResizeObserver(updateScale);
    if (stage.value) resizeObserver.observe(stage.value);
    updateScale();
    await paginate(data.value.blocks || []);
  } catch (cause) {
    error.value = `${isZh.value ? "无法载入卡片内容" : "Could not load cards"}: ${cause?.message || cause}`;
  } finally {
    loading.value = false;
  }
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  document.documentElement.classList.remove("cards-open");
  window.removeEventListener("keydown", onWindowKey);
  window.clearTimeout(wheelIdle);
  cancelAnimationFrame(glideFrame);
});

function renderPage(blocks) {
  return (blocks || []).map((block) => `<div class="card-block card-block-${block.type}">${block.html}</div>`).join("");
}

function cardFilename(index) {
  return `${filenameBase.value}-${String(index + 1).padStart(2, "0")}.png`;
}

async function waitForImage(image) {
  const source = image.currentSrc || image.src;
  const label = image.alt || (source?.startsWith("data:")
    ? (isZh.value ? "内嵌图片" : "embedded image")
    : source || (isZh.value ? "未命名图片" : "unnamed image"));
  // Cards outside the visible carousel slots may still be lazy. Export must
  // start their requests explicitly and wait for decoding before rasterizing.
  image.loading = "eager";
  image.fetchPriority = "high";
  let timeout;
  try {
    await Promise.race([
      image.decode(),
      new Promise((_, reject) => {
        timeout = window.setTimeout(
          () => reject(new Error(isZh.value ? "等待图片超时（20 秒）" : "Image load timed out (20 seconds)")),
          IMAGE_LOAD_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (cause) {
    throw new Error(`${isZh.value ? "图片载入失败" : "Image failed to load"}: ${label} (${cause?.message || cause})`);
  } finally {
    window.clearTimeout(timeout);
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error(`${isZh.value ? "图片没有有效尺寸" : "Image has no usable dimensions"}: ${label}`);
  }
}

function imageDataUrl(image) {
  if (image.currentSrc.startsWith("data:")) return image.currentSrc;
  const maxDimension = 2160;
  const ratio = Math.min(1, maxDimension / image.naturalWidth, maxDimension / image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建图片导出画布");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/png");
  } catch (cause) {
    const label = image.alt || image.currentSrc || "未命名图片";
    throw new Error(`无法将图片嵌入 PNG：${label}（${cause?.message || cause}）`);
  }
}

async function capture(index) {
  await nextTick();
  const node = slotNodes.get(Math.round(pos))?.querySelector(".social-card");
  if (!node) throw new Error(isZh.value ? "卡片尚未渲染" : "Card is not ready");
  await document.fonts?.ready;
  const sourceImages = [...node.querySelectorAll("img")];
  await Promise.all(sourceImages.map(waitForImage));
  const exportNode = node.cloneNode(true);
  const exportImages = [...exportNode.querySelectorAll("img")];
  const imageData = new Map();
  for (let i = 0; i < sourceImages.length; i++) {
    const source = sourceImages[i];
    const image = exportImages[i];
    if (!source.naturalWidth) {
      throw new Error(`${isZh.value ? "图片尚未载入" : "Image is not ready"}: ${source.alt || source.currentSrc || source.src}`);
    }
    const key = source.currentSrc || source.src;
    if (!imageData.has(key)) imageData.set(key, imageDataUrl(source));
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.src = imageData.get(key);
  }
  // The original images are ready, but assigning their data URLs to the clone
  // starts a second image decode. Wait for that too before html-to-image clones
  // and rasterizes this node; otherwise exports can lose SVG logos and photos.
  await Promise.all(exportImages.map(waitForImage));
  Object.assign(exportNode.style, {
    transform: "none", transformOrigin: "top left", position: "relative",
    left: "0px", top: "0px", marginLeft: "0px", zIndex: "auto", pointerEvents: "none",
  });
  document.body.appendChild(exportNode);
  try {
    const dataUrl = await toPng(exportNode, {
      width: 1080,
      height: 1350,
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: true,
    });
    return await (await fetch(dataUrl)).blob();
  } finally {
    exportNode.remove();
  }
}

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function downloadCurrent() {
  busy.value = true;
  error.value = "";
  try {
    jumpTo(target);
    await nextTick();
    const blob = await capture(current.value);
    downloadBlob(blob, cardFilename(current.value));
    status.value = isZh.value ? "PNG 已下载" : "PNG downloaded";
  } catch (cause) {
    error.value = `${isZh.value ? "导出失败" : "Export failed"}: ${cause?.message || cause}`;
  } finally { busy.value = false; }
}

async function downloadDeck() {
  busy.value = true;
  error.value = "";
  status.value = "";
  const previous = current.value;
  try {
    const zip = new JSZip();
    for (let i = 0; i < slideCount.value; i++) {
      jumpTo(i);
      status.value = `${isZh.value ? "正在生成" : "Creating"} ${i + 1}/${slideCount.value}`;
      await nextTick();
      const blob = await capture(i);
      zip.file(cardFilename(i), blob);
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    downloadBlob(blob, `${filenameBase.value}-cards.zip`);
    status.value = isZh.value ? "卡片组 ZIP 已下载" : "Card deck ZIP downloaded";
  } catch (cause) {
    error.value = `${isZh.value ? "整组导出失败" : "Deck export failed"}: ${cause?.message || cause}`;
  } finally {
    busy.value = false;
    jumpTo(previous);
  }
}

// ── One position for the whole deck ──────────────────────────────────────────
// `pos` is a continuous place in the deck in card-steps: 2 shows the third card,
// 2.3 is 30% of the way to the fourth. Dragging, the glide after release, the
// arrow buttons and the keyboard all only change this one number, and `place()`
// is the only thing that turns it into where a card sits. There is no hand-off
// between a drag and a transition because there is only one motion.
//
// It is never wrapped: wrapping would send a card the long way round when it
// crossed the end of the deck. Only the page *shown* in a slot is wrapped.
//
// The deck is a stack of paper. The top card is pulled off to the left and
// uncovers the one beneath, which rises from slightly lower and smaller. Going
// back, the card returns from the left onto the top. Cards never change opacity
// while they are on the stack — size, a little drop and paint order say which
// is on top; only a card that has left the stack fades as it goes.
let pos = 0;
let target = 0;
let glideFrame = 0;
const base = ref(0);
const frontN = ref(0);
const slotNodes = new Map();
const TOSS = 300;      // ms of travel a release looks ahead (a card is ~500px, so a short flick needs this much)
const GLIDE_MS = 560;  // quart-out settle to a whole card
const AWAY = 1.04;     // how far (in card widths) a pulled card travels: just clear of the one beneath
const DROP = 28;       // px a card beneath sits lower, so its edge shows

const wrap = (n) => ((n % slideCount.value) + slideCount.value) % slideCount.value;
const quartOut = (t) => 1 - (1 - t) ** 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Four slots: the card that may be leaving, the top card, the one beneath, and one
// more under that so nothing appears when the stack advances. Keyed by unwrapped n.
const slots = computed(() => [-1, 0, 1, 2].map((k) => {
  const n = base.value + k;
  return { n, page: slideCount.value ? wrap(n) : 0 };
}));

function setSlotNode(n, node) {
  if (node) slotNodes.set(n, node);
  else slotNodes.delete(n);
}

function cardWidth() {
  return box.value.w || stage.value?.clientWidth || 648;
}

function place(rel) {
  if (rel < 0) {
    const t = Math.min(1, -rel);
    // Opaque the whole time it overlaps the card beneath — a half-transparent card
    // over another is two pages of text at once. It fades only in the last few
    // percent, once it has all but cleared it.
    const fade = t < .92 ? 1 : 1 - (t - .92) / .08;
    return { x: -t * cardWidth() * AWAY, y: 0, s: 1, o: fade, z: Math.round(100 - rel * 20) };
  }
  // Beyond one card down, a card sits exactly behind the one above it, unseen.
  const u = Math.min(1, rel);
  return { x: 0, y: u * DROP, s: 1 - u * .05, o: 1, z: Math.round(100 - rel * 20) };
}

function paint() {
  const nextBase = Math.floor(pos);
  if (nextBase !== base.value) base.value = nextBase; // new slots are painted in onUpdated
  if (Math.round(pos) !== frontN.value) frontN.value = Math.round(pos);
  const shown = slideCount.value ? wrap(Math.round(pos)) : 0;
  if (shown !== current.value) current.value = shown;
  for (const [n, node] of slotNodes) {
    const p = place(n - pos);
    node.style.transform = `translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,0) scale(${p.s.toFixed(4)})`;
    node.style.opacity = p.o.toFixed(3);
    node.style.zIndex = String(p.z);
    node.style.visibility = n - pos <= -1 ? "hidden" : "";
  }
}
onUpdated(paint);

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function jumpTo(index) {
  cancelAnimationFrame(glideFrame);
  pos = target = index;
  paint();
}

// Quart-out from wherever the deck is right now, so a second swipe or click
// during a glide carries on instead of snapping back.
function glide(to) {
  cancelAnimationFrame(glideFrame);
  target = to;
  const from = pos;
  if (from === to || busy.value || prefersReducedMotion()) {
    pos = to;
    paint();
    return;
  }
  const started = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - started) / GLIDE_MS);
    pos = from + (to - from) * quartOut(t);
    paint();
    if (t < 1) glideFrame = requestAnimationFrame(tick);
  };
  glideFrame = requestAnimationFrame(tick);
}

function move(delta) {
  status.value = "";
  glide(target + delta);
}

function startDrag(event) {
  if (busy.value || event.button !== 0) return;
  cancelAnimationFrame(glideFrame); // catch the deck where it is
  gesture = {
    pointerId: event.pointerId,
    downX: event.clientX,
    startPos: pos,
    lastX: event.clientX,
    lastTime: event.timeStamp,
    velocity: 0,
    moved: false,
  };
  held.value = true;
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer is no longer active. */ }
}

function updateDrag(event) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - gesture.downX;
  if (Math.abs(dx) > 3) gesture.moved = true;
  // px per ms, from the last reading and smoothed, so one jittery frame cannot fake a flick.
  const elapsed = Math.max(1, event.timeStamp - gesture.lastTime);
  gesture.velocity = (gesture.velocity + (event.clientX - gesture.lastX) / elapsed) / 2;
  gesture.lastX = event.clientX;
  gesture.lastTime = event.timeStamp;
  // One to one with the finger: the pulled card stays under it. No rubber band —
  // the deck loops, so there is no end for it to signal.
  pos = gesture.startPos - dx / (cardWidth() * AWAY);
  paint();
}

function finishDrag(event, cancelled = false) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const completed = gesture;
  gesture = null;
  held.value = false;
  if (completed.moved) suppressNextClick = true;
  // Where it would come to rest if it kept going, at most one card past the drag.
  const carry = cancelled ? 0 : clamp((-completed.velocity * TOSS) / (cardWidth() * AWAY), -1, 1);
  const to = Math.round(pos + carry);
  glide(clamp(to, Math.floor(completed.startPos) - 1, Math.ceil(completed.startPos) + 1));
}

function handleStageClick(event) {
  if (!suppressNextClick) return;
  suppressNextClick = false;
  event.preventDefault();
  event.stopPropagation();
}

// Full-screen deck: the page underneath can't scroll, so the only gesture left
// is sideways. A two-finger horizontal swipe turns one card per swipe; ←/→ work
// without focusing the card; Esc goes back to the text.
let wheelSum = 0;
let wheelIdle = 0;
let wheelSpent = false;
function onDeckWheel(event) {
  event.preventDefault();
  if (busy.value || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
  window.clearTimeout(wheelIdle);
  wheelIdle = window.setTimeout(() => { wheelSum = 0; wheelSpent = false; }, 180);
  if (wheelSpent) return;
  wheelSum += event.deltaX;
  if (Math.abs(wheelSum) > 60) {
    wheelSpent = true;
    move(wheelSum > 0 ? 1 : -1);
  }
}
function onWindowKey(event) {
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  if (event.key === "Escape") { emit("exit"); return; }
  if (target === stage.value) return; // the stage handles its own arrows
  handleStageKey(event);
}

function handleStageKey(event) {
  const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  move(delta);
}
</script>

<template>
  <section class="card-deck" :aria-label="isZh ? '文章卡片' : 'Article cards'" @wheel="onDeckWheel">
    <div class="card-bar card-bar-top">
      <button type="button" class="card-back" @click="emit('exit')">
        <ArrowLeft :size="16" :stroke-width="ICON_STROKE" aria-hidden="true" /> {{ isZh ? "返回全文" : "Back to text" }}
      </button>
      <p v-if="status" class="card-status" aria-live="polite">{{ status }}</p>
      <div v-if="data" class="card-downloads" role="group" :aria-label="isZh ? '下载卡片' : 'Download cards'">
        <button
          type="button"
          :disabled="busy"
          :aria-label="isZh ? '下载这张 PNG' : 'Download this card (PNG)'"
          :title="isZh ? '下载这张 PNG' : 'Download this card (PNG)'"
          @click="downloadCurrent"
        >
          <ImageDown :size="18" :stroke-width="ICON_STROKE" aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="busy"
          :aria-label="isZh ? '下载整组 ZIP' : 'Download all cards (ZIP)'"
          :title="isZh ? '下载整组 ZIP' : 'Download all cards (ZIP)'"
          @click="downloadDeck"
        >
          <FolderDown :size="18" :stroke-width="ICON_STROKE" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p v-if="error && data" class="card-error" role="alert">{{ error }}</p>
    <div v-if="loading" class="card-message">{{ isZh ? "正在排版卡片…" : "Laying out cards…" }}</div>
    <div v-else-if="error && !data" class="card-message card-error" role="alert">{{ error }}</div>
    <div
      v-if="data"
      ref="stage"
      class="card-stage card-deck-ready"
      :class="{ 'is-held': held }"
      role="group"
      :aria-label="isZh ? '文章卡片轮播' : 'Article card carousel'"
      aria-roledescription="carousel"
      tabindex="0"
      @keydown="handleStageKey"
      @pointerdown="startDrag"
      @pointermove="updateDrag"
      @pointerup="finishDrag"
      @pointercancel="(event) => finishDrag(event, true)"
      @click.capture="handleStageClick"
    >
      <div
        v-for="slot in slots"
        :key="slot.n"
        :ref="(node) => setSlotNode(slot.n, node)"
        class="card-slot"
        :style="{ left: `${box.left}px`, top: `${box.top}px`, width: `${box.w}px`, height: `${box.h}px` }"
        :aria-hidden="slot.n !== frontN"
        :inert="slot.n !== frontN"
      >
          <article
            v-if="slot.page === 0"
            class="social-card card-cover"
            :class="{ 'card-cover-with-image': coverImage }"
            :style="{ transform: `scale(${scale})` }"
          >
            <div v-if="coverImage" class="cover-art" aria-hidden="true">
              <img class="cover-art-blur" :src="coverImage" alt="" />
              <img class="cover-art-clear" :src="coverImage" alt="" />
            </div>
            <header class="social-card-head"><span class="cover-brand"><img :src="pillarIcon()" alt="" aria-hidden="true" /><span>{{ pillarLabel() }}</span></span><span>VISUALISATION · AI · INTERACTION</span></header>
            <main class="cover-main">
              <h1>{{ data.title }}</h1>
              <p v-if="data.date" class="cover-date">{{ formatCardDate(data.date) }}</p>
            </main>
            <footer class="social-card-foot"><span>Study things. Build tools. Play with ideas.</span></footer>
          </article>
          <article
            v-else-if="slot.page === slideCount - 1"
            class="social-card card-ending"
            :style="{ transform: `scale(${scale})` }"
          >
            <img class="ending-watermark" src="/images/f-icon.svg" alt="" aria-hidden="true" />
            <header class="social-card-head"><span>{{ pillarLabel() }}</span><span>FRANK</span></header>
            <main class="ending-main">
              <p class="ending-wordmark">范不着 / Frank</p>
              <h2>{{ isZh ? "研究一些东西，做一些工具，玩一些想法。" : "Study things. Build tools. Play with ideas." }}</h2>
              <a :href="data.sourceUrl" target="_blank" rel="noreferrer">{{ data.sourceUrl }}</a>
            </main>
            <footer class="social-card-foot"><span>blog.songhai.site</span><span>{{ slideCount }} / {{ slideCount }}</span></footer>
          </article>
          <article
            v-else
            class="social-card card-content"
            :style="{ transform: `scale(${scale})` }"
          >
            <header class="social-card-head"><span>{{ pillarLabel() }}</span><span>{{ String(slot.page).padStart(2, "0") }} / {{ String(slideCount - 1).padStart(2, "0") }}</span></header>
            <main class="card-body" v-html="renderPage(pages[slot.page - 1])" />
            <footer class="social-card-foot"><span>Study · Build · Play</span><span>{{ data.sourceUrl }}</span></footer>
          </article>
      </div>
    </div>
    <div class="card-bar card-bar-bottom">
      <button class="card-nav card-nav-previous" type="button" :disabled="busy || !data" :aria-label="isZh ? '上一张' : 'Previous card'" @click="move(-1)"><ArrowLeft :size="18" :stroke-width="ICON_STROKE" aria-hidden="true" /></button>
      <span class="card-position" aria-live="polite">{{ current + 1 }} / {{ slideCount }}</span>
      <button class="card-nav card-nav-next" type="button" :disabled="busy || !data" :aria-label="isZh ? '下一张' : 'Next card'" @click="move(1)"><ArrowRight :size="18" :stroke-width="ICON_STROKE" aria-hidden="true" /></button>
    </div>
    <div ref="measureBody" class="card-body card-measure-body" aria-hidden="true" />
  </section>
</template>

<style>
/* Card view fills everything under the nav: no page to scroll, so a swipe can
   only mean sideways. The page underneath is locked while it is open. */
html.cards-open, html.cards-open body { overflow:hidden; overscroll-behavior:none; }
.card-deck { position:fixed; inset:var(--vp-nav-height, 64px) 0 0 0; z-index:28; display:flex; flex-direction:column; overflow:hidden; background:var(--vp-c-bg); touch-action:none; }
.card-bar { position:relative; display:flex; flex:none; align-items:center; width:min(100% - 2rem, 760px); margin:0 auto; }
.card-bar-top { height:3.25rem; justify-content:space-between; }
.card-bar-bottom { height:4rem; justify-content:center; gap:1rem; }
.card-back { display:inline-flex; align-items:center; gap:.4rem; padding:.3rem 0; border:0; background:none; color:var(--vp-c-text-2); font:inherit; font-size:.85rem; cursor:pointer; transition:color var(--songhai-motion-fast) ease; }
.card-back:hover,.card-back:focus-visible { color:var(--vp-c-text-1); }
.card-back:focus-visible { outline:2px solid var(--vp-c-brand-1); outline-offset:3px; border-radius:2px; }
.card-downloads { display:flex; align-items:center; }
.card-nav,.card-downloads button { color:var(--vp-c-text-2); background:transparent; border:0; border-radius:var(--songhai-radius-pill); padding:.45rem .6rem; cursor:pointer; font:inherit; transition:background var(--songhai-motion-fast) ease,color var(--songhai-motion-fast) ease,transform var(--songhai-motion-fast) ease; }
.card-nav { display:inline-grid; place-items:center; min-width:2.5rem; min-height:2.5rem; }
.card-nav:hover,.card-nav:focus-visible { color:var(--vp-c-text-1); background:var(--vp-c-bg-soft); }
.card-nav-previous:hover,.card-nav-previous:focus-visible { transform:translateX(-2px); }
.card-nav-next:hover,.card-nav-next:focus-visible { transform:translateX(2px); }
.card-nav:active,.card-downloads button:active { transform:scale(.96); }
/* Two icon buttons, the same quiet round targets as the arrows below. */
.card-downloads { gap:.15rem; margin-right:-.5rem; }
.card-downloads button { display:inline-grid; place-items:center; width:2.25rem; height:2.25rem; padding:0; border-radius:var(--songhai-radius-pill); }
.card-downloads button:hover,.card-downloads button:focus-visible { color:var(--vp-c-text-1); background:var(--vp-c-bg-soft); }
.card-downloads button:focus-visible { outline:2px solid var(--vp-c-brand-1); outline-offset:2px; }
.card-nav:disabled,.card-downloads button:disabled { opacity:.5; cursor:wait; }
.card-status { position:absolute; left:50%; margin:0; color:var(--vp-c-text-2); font-size:.8rem; transform:translateX(-50%); white-space:nowrap; }
.card-error { width:min(100% - 2rem, 760px); margin:0 auto .5rem; padding:.6rem .9rem; border-radius:var(--songhai-radius); background:color-mix(in srgb, #b84b4b 18%, transparent); color:#ffbcbc; font-size:.85rem; }
.card-message { display:grid; flex:1; place-items:center; color:var(--vp-c-text-2); }
/* Above the desktop sidebar (25) and below the nav (30): a card pulled off the deck
   passes over the sidebar instead of being cut by its edge. */
/* The stage takes the rest of the height; the card's box inside it is computed
   (fit both ways, centred) in updateScale. */
.card-stage { position:relative; flex:1; min-height:0; width:min(100% - 2rem, 1080px); margin:0 auto; cursor:grab; touch-action:none; user-select:none; -webkit-user-select:none; outline:none; }
.card-stage img { -webkit-user-drag:none; }
.card-position { min-width:3.5rem; color:var(--vp-c-text-3); font-size:.8rem; font-variant-numeric:tabular-nums; text-align:center; }
.card-stage.is-held { cursor:grabbing; }
.card-stage:focus-visible .card-slot:not([inert]) { outline:1px solid var(--vp-c-text-2); outline-offset:7px; }
.card-slot { position:absolute; transform-origin:50% 50%; will-change:transform; border-radius:var(--songhai-radius); }
/* One shadow, and it never changes: it says the card is off the page, nothing more.
   On the slot, not the card, so PNG exports stay clean. */
.card-slot { box-shadow:0 18px 40px -22px rgba(0,0,0,.55); }
/* backwards, not both: a filled transform would keep a stacking context and trap the stage below the sidebar */
.card-deck-ready { animation:card-deck-in 560ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
.card-message { animation:card-message-in 300ms ease 240ms both; }
@keyframes card-deck-in { from { opacity:0; transform:translate3d(0,10px,0); } to { opacity:1; transform:none; } }
@keyframes card-message-in { from { opacity:0; } to { opacity:1; } }
.social-card { box-sizing:border-box; position:absolute; top:0; left:0; width:1080px; height:1350px; padding:68px 72px; overflow:hidden; display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:34px; border-radius:20px; background:#f5f4ef; color:#111; font-family:Arial,"Helvetica Neue",Helvetica,"PingFang SC","Microsoft YaHei",sans-serif; transform-origin:top left; }
.social-card-head,.social-card-foot { display:flex; justify-content:space-between; align-items:center; gap:2rem; border-top:2px solid #777; padding-top:22px; color:#414141; font-size:20px; letter-spacing:.16em; line-height:1.35; text-transform:uppercase; }
.cover-brand { display:flex; min-width:0; align-items:center; gap:22px; }
.cover-brand img { display:block; width:188px; max-height:68px; object-fit:contain; object-position:left center; }
.social-card-foot { border-top:2px solid #777; padding-top:19px; letter-spacing:.06em; text-transform:none; }
.card-cover .social-card-head,.card-cover .cover-main,.card-cover .social-card-foot { position:relative; z-index:1; }
.card-ending .social-card-head,.card-ending .ending-main,.card-ending .social-card-foot { position:relative; z-index:1; }
.cover-art { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; }
.cover-art img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:cover; object-position:center; }
.cover-art-blur { opacity:.11; filter:blur(32px); transform:scale(1.08); mask-image:linear-gradient(to bottom, transparent 4%, #000 70%); }
.cover-art-clear { opacity:.20; mask-image:linear-gradient(to bottom, transparent 35%, #000 100%); }
.ending-watermark { position:absolute; z-index:0; top:290px; left:130px; width:1160px; height:auto; max-width:none; opacity:.09; pointer-events:none; }
.cover-main,.ending-main { align-self:center; width:100%; }
.card-cover-with-image .cover-main { transform:translateY(-150px); }
.cover-main h1 { margin:0; max-width:930px; color:#111; font-size:86px; font-weight:650; letter-spacing:-.055em; line-height:1.08; overflow-wrap:anywhere; }
.cover-date { margin:40px 0 0; color:#777; font-size:25px; }
.ending-main { display:flex; flex-direction:column; align-items:flex-start; gap:28px; }
.ending-wordmark { margin:0; font-size:30px; letter-spacing:.05em; }
.ending-main h2 { max-width:820px; margin:0; font-size:62px; font-weight:500; letter-spacing:-.04em; line-height:1.15; }
.ending-main a { max-width:100%; color:#444; font-size:24px; overflow-wrap:anywhere; }
.card-body { box-sizing:border-box; width:100%; height:100%; overflow:hidden; color:#151515; font-size:34px; line-height:1.48; overflow-wrap:anywhere; }
.card-block { margin:0 0 20px; }
.card-block:last-child { margin-bottom:0; }
.card-body h1,.card-body h2,.card-body h3,.card-body h4 { margin:.08em 0 .36em; color:#111; font-weight:600; letter-spacing:-.04em; line-height:1.12; }
.card-body h1 { font-size:1.55em; }.card-body h2 { font-size:1.32em; }.card-body h3,.card-body h4 { font-size:1.12em; }
.card-body p { margin:0 0 .55em; }
.card-body ul,.card-body ol { margin:.15em 0 .55em; padding-left:1.35em; }
.card-body ul { list-style:disc; }
.card-body ol { list-style:decimal; }
.card-body li { margin:.12em 0; padding-left:.12em; }
.card-body blockquote { margin:.3em 0; padding:.05em 0 .05em .65em; border-left:4px solid #999; color:#454545; }
.card-body pre { max-width:100%; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere; background:#e8e7e1; padding:.48em .6em; border-radius:8px; font: .67em/1.4 "SFMono-Regular",Consolas,monospace; }
.card-body table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:.73em; line-height:1.35; }
.card-body th,.card-body td { border:1px solid #999; padding:.24em .28em; text-align:left; overflow-wrap:anywhere; }
.card-body :not(pre) > code { border-radius:4px; padding:.08em .22em; background:#e8e7e1; color:#242424; font: .82em/1.35 "SFMono-Regular",Consolas,monospace; }
.card-image-frame { position:relative; box-sizing:border-box; width:100%; height:450px; overflow:hidden; border-radius:16px; }
.card-image-row { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:center; gap:24px; }
.card-image-row .card-image-frame { flex:0 0 auto; margin-inline:0 !important; }
.card-image-frame img { position:absolute; top:50%; left:0; display:block; width:100%; height:auto; max-width:none; margin:0; transform:translateY(-50%); }
.card-image-text { display:flow-root; }
.card-image-text .card-image-frame { margin:0 24px 12px 0 !important; float:left; }
.card-image-text p { margin:0; }
.card-body img { display:block; width:100%; height:auto; max-width:100%; margin:.2em auto; }
.card-body a { color:#222; text-decoration:underline; text-underline-offset:.12em; }
.card-body hr { border:0; border-top:2px solid #aaa; }
.card-image-placeholder { box-sizing:border-box; display:grid; width:100%; height:100%; place-items:center; padding:1em; border:1px dashed #888; color:#555; text-align:center; font-size:.72em; }
.card-measure-body { position:fixed; left:-20000px; top:0; width:936px; height:1047px; overflow:hidden; visibility:hidden; box-sizing:border-box; color:#151515; font:34px/1.48 Arial,"Helvetica Neue",Helvetica,"PingFang SC","Microsoft YaHei",sans-serif; overflow-wrap:anywhere; }
.card-measure-body .card-block { margin:0 0 20px; }
@media(max-width:720px) {
  .card-bar-top { height:3rem; }
  .card-bar-bottom { height:3.5rem; }
}
@media(prefers-reduced-motion:reduce) {
  .card-nav,.card-downloads button { transition:none; }
  .card-deck-ready,.card-message { animation:none; }
}
</style>
