// Pull every page string and data table out of the original compiled bundles.
//
//   node migration/extract-original.cjs <main.js> <date-chunk.js> <campaign-chunk.js> [out.json]
//
// The chunks must be valid UTF-8 (run fix-encoding.py first if they show â€º-style garbage).
const fs = require("fs"), vm = require("vm"), path = require("path");
const { JSDOM } = require("jsdom");
const [MAIN, DATE, CAMPAIGN, OUT = "migration/orig.json"] = process.argv.slice(2);
const dom = new JSDOM(`<!doctype html><div id="root"></div>`, { url: "https://example.org/resources/", runScripts: "outside-only" });
const ctx = dom.getInternalVMContext();
let main = fs.readFileSync(MAIN, "utf8");
const cut = main.indexOf('location.hash && !location.hash.startsWith("#/")');
main = main.slice(0, cut) + `
globalThis.__D = { OV, YV, jb, Xm, SL, TL, F6, Z6, X6, Q6, Im, fb, Rb, Pb, Kb, ay, iy, hy, OL, UL, Sm, _b, lc, lP, nP };`;
vm.runInContext(main, ctx);
const D = dom.window.__D;
function loadChunk(f) {
  let s = fs.readFileSync(f, "utf8");
  s = s.replace(/export\s*\{([^}]*)\};?\s*$/, (_, list) =>
    "globalThis.__C={" + list.split(",").map(p => { const [a, b] = p.trim().split(/\s+as\s+/); return (b && b[0]=='"' ? b : JSON.stringify(b || a)) + ":" + a; }).join(",") + "};");
  const c = vm.createContext({});
  vm.runInContext(s, c);
  return c.__C.default;
}
const date = loadChunk(DATE), campaign = loadChunk(CAMPAIGN);
const pages = {};
for (const [br, m] of Object.entries(D.lc)) for (const [id, h] of Object.entries(m)) pages[id] = h;
for (const [id, h] of Object.entries(date)) pages[id] = h;
for (const [id, h] of Object.entries(campaign)) pages[id] = h;
const out = { ...JSON.parse(JSON.stringify({ ...D, lc: undefined })), pages };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log("pages", Object.keys(pages).length, "branch ids", Object.keys(D.OV).length,
  "missing html", Object.keys(D.OV).filter(k => !pages[k]).join(" "),
  "\nimg", Object.keys(D.Xm).length, "hw", Object.keys(D.SL).length, "np", Object.keys(D.TL).length,
  "days", Object.keys(D.F6).length, "events", D.Kb.length, "search", D.jb.length);
