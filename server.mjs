// Admin server: serves the editor at /admin, a live preview of the site at /,
// and a small JSON API that reads and writes the files in content/.
//
//   ADMIN_PASSWORD=secret npm run admin        (http://localhost:4000/admin)
//
// Environment:
//   PORT            default 4000
//   HOST            default 127.0.0.1 (set 0.0.0.0 to reach it from other machines)
//   ADMIN_PASSWORD  required unless HOST is 127.0.0.1; login is user "admin"
//   PUBLISH_DIR     where "Publish" writes the static site (default: dist/)
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildSite, indexEntry, readJson, DATA_FILES } from "./scripts/lib/site.mjs";
import { build } from "./scripts/build.mjs";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONTENT = path.join(ROOT, "content");
const PAGES = path.join(CONTENT, "pages");
const HISTORY = path.join(CONTENT, ".history");
const UPLOADS = path.join(ROOT, "uploads");
const PORT = +process.env.PORT || 4000;
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const PUBLISH_DIR = path.resolve(process.env.PUBLISH_DIR || path.join(ROOT, "dist"));

if (!PASSWORD && HOST !== "127.0.0.1" && HOST !== "localhost") {
  console.error("Refusing to start: set ADMIN_PASSWORD when HOST is not localhost.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "20mb" }));

// ---------- auth ----------
app.use((req, res, next) => {
  if (!PASSWORD) return next();
  const [, b64] = (req.headers.authorization || "").split(" ");
  const [u, p] = Buffer.from(b64 || "", "base64").toString().split(":");
  const ok = u === "admin" && p && crypto.timingSafeEqual(crypto.createHash("sha256").update(p).digest(), crypto.createHash("sha256").update(PASSWORD).digest());
  if (ok) return next();
  res.set("WWW-Authenticate", 'Basic realm="TH Resources admin"').status(401).send("Login required");
});

// ---------- helpers ----------
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_ -]{0,80}$/;
const pageFile = (id) => path.join(PAGES, `${id}.json`);
const dataFile = (name) => path.join(CONTENT, "data", `${name}.json`);
const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  fs.renameSync(tmp, f);
};
function keepHistory(kind, id, file) {
  if (!fs.existsSync(file)) return;
  const dir = path.join(HISTORY, kind, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(file, path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  const all = fs.readdirSync(dir).sort();
  all.slice(0, Math.max(0, all.length - 30)).forEach((f) => fs.rmSync(path.join(dir, f)));
}
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

function validatePage(p, id) {
  if (!p || typeof p !== "object") return "Page must be an object";
  if (p.id !== id) return "Page id does not match the address";
  if (!ID_RE.test(id)) return "Page id may use letters, numbers, spaces, - and _ only";
  if (!["article", "hub"].includes(p.template)) return "Unknown template";
  if (p.parent && p.parent !== "home" && !fs.existsSync(pageFile(p.parent))) return `Parent page "${p.parent}" does not exist`;
  if (p.altParent && !fs.existsSync(pageFile(p.altParent))) return `Campaign parent "${p.altParent}" does not exist`;
  return null;
}

/** Pages that point at id: as parent, campaign parent, or a link/card target. */
function referencesTo(id) {
  const out = [];
  const needle = [`"page": "${id}"`, `data-go=\\"${id}\\"`, `data-back=\\"${id}\\"`];
  for (const f of fs.readdirSync(PAGES)) {
    const txt = fs.readFileSync(path.join(PAGES, f), "utf8");
    const p = JSON.parse(txt);
    if (p.id === id) continue;
    const why = [];
    if (p.parent === id) why.push("parent");
    if (p.altParent === id) why.push("campaign parent");
    if (needle.some((n) => txt.includes(n))) why.push("link");
    if (why.length) out.push({ id: p.id, title: p.title, why });
  }
  return out;
}

// ---------- API: pages ----------
app.get("/api/index", (req, res) => {
  const { site } = buildSite(CONTENT, { includeDrafts: true });
  res.json(site.index);
});
app.get("/api/pages/:id", (req, res) => {
  const f = pageFile(req.params.id);
  if (!fs.existsSync(f)) return bad(res, "Not found", 404);
  res.json(readJson(f));
});
app.put("/api/pages/:id", (req, res) => {
  const id = req.params.id, p = req.body;
  const err = validatePage(p, id);
  if (err) return bad(res, err);
  if (!fs.existsSync(pageFile(id))) return bad(res, "Page does not exist; create it first", 404);
  keepHistory("pages", id, pageFile(id));
  writeJson(pageFile(id), p);
  const types = readJson(dataFile("types"));
  res.json({ ok: true, index: indexEntry(p, types) });
});
app.post("/api/pages", (req, res) => {
  const p = req.body;
  const err = validatePage(p, p?.id);
  if (err) return bad(res, err);
  if (fs.existsSync(pageFile(p.id)) || ["marking", "calendar"].includes(p.id)) return bad(res, `A page called "${p.id}" already exists`, 409);
  writeJson(pageFile(p.id), p);
  res.json({ ok: true });
});
app.get("/api/pages/:id/references", (req, res) => res.json(referencesTo(req.params.id)));
app.delete("/api/pages/:id", (req, res) => {
  const id = req.params.id, f = pageFile(id);
  if (!fs.existsSync(f)) return bad(res, "Not found", 404);
  if (id === "home") return bad(res, "The home page can't be deleted");
  const refs = referencesTo(id);
  if (refs.length && req.query.force !== "1") return res.status(409).json({ error: "Other pages point to this page", refs });
  keepHistory("pages", id, f);
  fs.rmSync(f);
  res.json({ ok: true });
});
app.get("/api/history/pages/:id", (req, res) => {
  const dir = path.join(HISTORY, "pages", req.params.id);
  res.json(fs.existsSync(dir) ? fs.readdirSync(dir).sort().reverse() : []);
});
app.get("/api/history/pages/:id/:ver", (req, res) => {
  const f = path.join(HISTORY, "pages", req.params.id, path.basename(req.params.ver));
  if (!fs.existsSync(f)) return bad(res, "Not found", 404);
  res.json(readJson(f));
});

// ---------- API: data tables (settings, nav, types, images, schedule...) ----------
const DATA_NAMES = new Set(Object.values(DATA_FILES));
app.get("/api/data/:name", (req, res) => {
  if (!DATA_NAMES.has(req.params.name)) return bad(res, "Unknown data file", 404);
  res.json(readJson(dataFile(req.params.name)));
});
app.put("/api/data/:name", (req, res) => {
  const name = req.params.name;
  if (!DATA_NAMES.has(name)) return bad(res, "Unknown data file", 404);
  if (req.body == null || typeof req.body !== "object") return bad(res, "Expected JSON");
  if (name === "types") {
    for (const [id, t] of Object.entries(req.body)) if (!["article", "hub"].includes(t.template)) return bad(res, `Type "${id}" needs template article or hub`);
  }
  keepHistory("data", name, dataFile(name));
  writeJson(dataFile(name), req.body);
  res.json({ ok: true });
});

// ---------- API: uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const d = new Date();
    const dir = path.join(UPLOADS, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    fs.mkdirSync(dir, { recursive: true });
    req._dir = dir;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    const base = path.basename(file.originalname, path.extname(file.originalname)).normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
    let name = base + ext, i = 1;
    while (fs.existsSync(path.join(req._dir || "", name))) name = `${base}-${i++}${ext}`;
    cb(null, name);
  },
});
const ALLOWED = /\.(pdf|jpe?g|png|gif|webp|svg|mp3|m4a|wav|ogg|mp4|webm|mov|docx?|xlsx?|pptx?|zip)$/i;
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(ALLOWED.test(file.originalname) ? null : new Error("That file type isn't allowed"), true),
});
app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return bad(res, err.message);
    if (!req.file) return bad(res, "No file");
    const rel = path.relative(ROOT, req.file.path).split(path.sep).join("/");
    let key;
    if (req.body.imageKey !== undefined && /\.(jpe?g|png|gif|webp|svg)$/i.test(rel)) {
      // register the picture in images.json so pages and the lightbox can use it by key
      const images = readJson(dataFile("images"));
      key = (req.body.imageKey || path.basename(rel, path.extname(rel))).replace(/[^\w-]/g, "_");
      let k = key, i = 2;
      while (images[k] && images[k] !== rel) k = `${key}_${i++}`;
      images[k] = rel;
      writeJson(dataFile("images"), images);
      key = k;
    }
    res.json({ ok: true, url: rel, key, name: req.file.originalname, size: req.file.size });
  });
});
app.get("/api/uploads", (req, res) => {
  const out = [];
  const walk = (d) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else out.push({ url: path.relative(ROOT, f).split(path.sep).join("/"), size: fs.statSync(f).size, mtime: fs.statSync(f).mtimeMs });
  });
  walk(UPLOADS);
  res.json(out.sort((a, b) => b.mtime - a.mtime));
});

// ---------- API: publish ----------
app.post("/api/publish", (req, res) => {
  try {
    const r = build(PUBLISH_DIR);
    res.json({ ok: true, ...r, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/status", (req, res) => res.json({ publishDir: PUBLISH_DIR, auth: !!PASSWORD }));

// ---------- live preview of the site (unpublished content, drafts included) ----------
app.get("/content/site.json", (req, res) => {
  const { site } = buildSite(CONTENT, { includeDrafts: true });
  // the preview runs on this machine: no PHP login here, and old files come from the live server
  site.settings = { ...site.settings, requireLogin: false, legacyBase: site.settings.previewLegacyBase || site.settings.legacyBase };
  res.json(site);
});
app.get("/content/pages/:file", (req, res) => {
  const f = path.join(PAGES, path.basename(req.params.file));
  fs.existsSync(f) ? res.sendFile(f) : bad(res, "Not found", 404);
});
app.use("/uploads", express.static(UPLOADS));
app.use("/admin", express.static(path.join(ROOT, "admin")));
app.use("/", express.static(path.join(ROOT, "public")));

app.listen(PORT, HOST, () => {
  console.log(`Admin:   http://${HOST}:${PORT}/admin/`);
  console.log(`Preview: http://${HOST}:${PORT}/`);
  console.log(`Publish target: ${PUBLISH_DIR}`);
});
