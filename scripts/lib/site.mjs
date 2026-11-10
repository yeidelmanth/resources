// Assemble site.json (everything the public runtime needs up front) from content/.
import fs from "node:fs";
import path from "node:path";
import { stripTags, resolvePage } from "../../public/js/render.js";
import { generatePages, indexFeatures, featureName } from "./generated.mjs";

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
    branch: p.branch, type: p.type, draft: p.draft || undefined, generated: p.generated || undefined,
    t: plain(p.title || p.crumbLabel || p.id),
    k: r.template === "article" ? plain([r.article.kick, ...(r.article.chips || [])].filter(Boolean).join(" · ")) : plain(r.branch ? r.branch[0].toUpperCase() + r.branch.slice(1) : ""),
    x: searchText(r),
  };
}

/** content/shells/<type>.html -> {type: html}; _default.html is used by types without one. */
export function loadShells(contentDir) {
  const dir = path.join(contentDir, "shells");
  const shells = {};
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".html")) shells[f.slice(0, -5)] = fs.readFileSync(path.join(dir, f), "utf8");
  return shells;
}

export function buildSite(contentDir, { includeDrafts = false } = {}) {
  const site = {};
  for (const [k, f] of Object.entries(DATA_FILES)) site[k] = readJson(path.join(contentDir, "data", f + ".json"));
  site.shells = loadShells(contentDir);
  const idxFile = path.join(contentDir, "data", "campaign-index.json");
  const campaignIndex = fs.existsSync(idxFile) ? readJson(idxFile) : { campaigns: [] };
  site.featureTitles = Object.fromEntries(Object.values(indexFeatures(campaignIndex)).map((f) => [f.id, featureName(f)]));
  const pages = loadPages(contentDir);
  Object.assign(pages, generatePages(pages, campaignIndex, site.types));
  site.index = {};
  for (const p of Object.values(pages)) if (includeDrafts || !p.draft) site.index[p.id] = indexEntry(p, site.types);
  return { site, pages };
}
