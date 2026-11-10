// Show where a migrated page's rendering differs from the original markup.
import fs from "node:fs";
import { canon } from "./lib/dom.mjs";
import { renderPage } from "../public/js/render.js";
const id = process.argv[2];
const orig = JSON.parse(fs.readFileSync("migration/orig.json", "utf8"));
const load = (i) => { try { return JSON.parse(fs.readFileSync(`content/pages/${i}.json`, "utf8")); } catch { return null; } };
const a = canon(orig.pages[id]), b = canon(renderPage(load(id), load));
let i = 0; while (i < a.length && a[i] === b[i]) i++;
console.log(a === b ? "MATCH" : `differs at ${i}\nORIG: ${a.slice(Math.max(0, i - 150), i + 250)}\nNEW:  ${b.slice(Math.max(0, i - 150), i + 250)}`);
