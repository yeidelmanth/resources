// Health check for the content: every page renders, and every link, parent and
// image key points at something that exists.
//
//   npm run check
//   node scripts/check.mjs --original migration/orig.json   (also compare with the original site)
import fs from "node:fs";
import path from "node:path";
import { buildSite } from "./lib/site.mjs";
import { renderPage, resolvePage } from "../public/js/render.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { site, pages } = buildSite(path.join(ROOT, "content"), { includeDrafts: true });
const lookup = (id) => site.index[id];
const BUILTIN = new Set(["home", "marking", "calendar"]);
const problems = [];
const html = {};
for (const p of Object.values(pages)) {
  try {
    html[p.id] = renderPage(resolvePage(p, site.types), lookup);
  } catch (e) {
    problems.push(`${p.id}: does not render (${e.message})`);
    continue;
  }
  if (!site.types[p.type]) problems.push(`${p.id}: unknown page type "${p.type}"`);
  for (const [k, v] of [["parent", p.parent], ["campaign parent", p.altParent]]) if (v && !pages[v] && v !== "home") problems.push(`${p.id}: ${k} "${v}" does not exist`);
  for (const m of html[p.id].matchAll(/data-(?:go|back)="([^"]+)"/g)) {
    const id = m[1].split("?")[0];
    if (!pages[id] && !BUILTIN.has(id)) problems.push(`${p.id}: links to missing page "${id}"`);
    else if (pages[id]?.draft && !p.draft) problems.push(`${p.id}: links to draft page "${id}" (hidden until it is published)`);
  }
  for (const m of html[p.id].matchAll(/data-(?:img|full|lb)="([^"]+)"/g))
    for (const k of m[1].split(",")) if (!site.images[k.trim()]) problems.push(`${p.id}: image key "${k}" is not in images.json`);
}
const uniq = [...new Set(problems)];
console.log(`${Object.keys(pages).length} pages checked, ${uniq.length} problem(s).`);
uniq.slice(0, 200).forEach((x) => console.log("  - " + x));

const oi = process.argv.indexOf("--original");
if (oi > 0) {
  const { canon } = await import("./lib/dom.mjs");
  const orig = JSON.parse(fs.readFileSync(process.argv[oi + 1], "utf8"));
  const changed = Object.keys(orig.pages).filter((id) => !html[id] || canon(html[id]) !== canon(orig.pages[id]));
  console.log(`Compared with the original site: ${Object.keys(orig.pages).length - changed.length} identical, ${changed.length} changed${changed.length ? ": " + changed.slice(0, 30).join(" ") : ""}`);
}
process.exitCode = uniq.some((x) => !x.includes("draft")) ? 1 : 0;
