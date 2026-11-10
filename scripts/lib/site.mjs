// Assemble site.json (everything the public runtime needs up front) from content/.
import fs from "node:fs";
import path from "node:path";
import { stripTags, resolvePage } from "../../public/js/render.js";

export const DATA_FILES = {
  settings: "settings", nav: "nav", types: "types", images: "images", handwriting: "handwriting",
  calendar: "calendar", schedule: "schedule", olderPdfs: "older-pdfs", biurTefillah: "biur-tefillah", markingTools: "marking-tools",
};

export const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

export function loadPages(contentDir) {
  const dir = path.join(contentDir, "pages");
  const pages = {};
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) {
    const p = readJson(path.join(dir, f));
    pages[p.id] = p;
  }
  return pages;
}

const plain = (s) => stripTags(s).replace(/\s+/g, " ").trim();

function searchText(p) {
  if (p.template === "article") return plain([...(p.article.chips || []), p.article.body || ""].join(" ")).slice(0, 400);
  const bits = [];
  const walk = (blocks) => (blocks || []).forEach((b) => {
    if (b.type === "heading") bits.push(b.text || "");
    (b.items || []).forEach((it) => bits.push(it.title || it.heading || it.ribbon || ""));
  });
  walk(p.blocks);
  (p.sections || []).forEach((s) => walk(s.blocks));
  return plain(bits.join(" ")).slice(0, 400);
}

export function indexEntry(p, types) {
  const r = resolvePage(p, types);
  return {
    title: p.title, crumbLabel: p.crumbLabel, parent: p.parent, altParent: p.altParent, altBranch: p.altBranch,
    branch: p.branch, type: p.type, draft: p.draft || undefined,
    t: plain(p.title || p.crumbLabel || p.id),
    k: r.template === "article" ? plain([r.article.kick, ...(r.article.chips || [])].filter(Boolean).join(" · ")) : plain(r.branch ? r.branch[0].toUpperCase() + r.branch.slice(1) : ""),
    x: searchText(r),
  };
}

export function buildSite(contentDir, { includeDrafts = false } = {}) {
  const site = {};
  for (const [k, f] of Object.entries(DATA_FILES)) site[k] = readJson(path.join(contentDir, "data", f + ".json"));
  const pages = loadPages(contentDir);
  site.index = {};
  for (const p of Object.values(pages)) if (includeDrafts || !p.draft) site.index[p.id] = indexEntry(p, site.types);
  return { site, pages };
}
