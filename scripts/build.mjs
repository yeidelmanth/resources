// Build the static site into dist/ (or the folder given as the first argument).
//
//   npm run build                         -> dist/
//   node scripts/build.mjs /var/www/html/resources
//
// The output is plain files, so it works in /resources/ on the current server or
// on any static host (set "legacyBase" in Settings so old file paths resolve).
//
// Only the site's own entries are written: index.html, css/, js/, content/ and
// uploads/. Anything else already in the target folder (the old PDF folders,
// the calendar app, PHP endpoints...) is left alone.
import fs from "node:fs";
import path from "node:path";
import { buildSite } from "./lib/site.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function swapIn(tmp, dest) {
  if (fs.existsSync(dest)) {
    const old = `${dest}.old-${Date.now()}`;
    fs.renameSync(dest, old);
    fs.renameSync(tmp, dest);
    fs.rmSync(old, { recursive: true, force: true });
  } else fs.renameSync(tmp, dest);
}

export function build(outDir = path.join(ROOT, "dist")) {
  const { site, pages } = buildSite(path.join(ROOT, "content"));
  // per-deployment overrides, e.g. for a test copy on GitHub Pages:
  //   SITE_LEGACY_BASE=https://mashpia.com/resources/ SITE_REQUIRE_LOGIN=false npm run build
  if (process.env.SITE_LEGACY_BASE != null) site.settings.legacyBase = process.env.SITE_LEGACY_BASE;
  if (process.env.SITE_REQUIRE_LOGIN != null) site.settings.requireLogin = process.env.SITE_REQUIRE_LOGIN === "true";
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = Date.now();

  // content/: write fresh, then swap so visitors never see a half-written set
  const ctmp = path.join(outDir, `.content-${stamp}`);
  fs.mkdirSync(path.join(ctmp, "pages"), { recursive: true });
  fs.writeFileSync(path.join(ctmp, "site.json"), JSON.stringify(site));
  let n = 0;
  for (const p of Object.values(pages)) {
    if (p.draft) continue;
    fs.writeFileSync(path.join(ctmp, "pages", `${p.id}.json`), JSON.stringify(p));
    n++;
  }
  swapIn(ctmp, path.join(outDir, "content"));

  // code and styles
  for (const name of ["css", "js"]) {
    const t = path.join(outDir, `.${name}-${stamp}`);
    fs.cpSync(path.join(ROOT, "public", name), t, { recursive: true });
    swapIn(t, path.join(outDir, name));
  }
  fs.copyFileSync(path.join(ROOT, "public/index.html"), path.join(outDir, "index.html"));

  // uploads/: add or update files, never delete (old pages may still link to them)
  const up = path.join(ROOT, "uploads");
  if (fs.existsSync(up)) fs.cpSync(up, path.join(outDir, "uploads"), { recursive: true });
  return { outDir, pages: n };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const r = build(out);
  console.log(`Built ${r.pages} pages into ${r.outDir}`);
}
