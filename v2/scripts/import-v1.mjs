// One-time import: turns the current site's content (../content) into the
// Weekly Hachayol v2 structure (./content):
//
//   content/features.yml     one entry per feature (series): name, campaign, colour, defaults
//   content/campaigns.yml    the campaign list: campaign → section → entries (grade, year, tag)
//   content/issues/<n>.yml   one file per Hachayol issue: week, date, year, PDF
//   content/spreads/<n>-<feature>.md   one file per spread
//
// Running it again overwrites v2/content, so after you start editing v2 only
// run it with --force if you really mean to start over:
//   node scripts/import-v1.mjs --force
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const V1 = path.resolve(HERE, "../../content");
const OUT = path.resolve(HERE, "../content");
const OLD = "https://mashpia.com"; // where the original files live

if (fs.existsSync(path.join(OUT, "spreads")) && !process.argv.includes("--force")) {
  console.error("v2/content already exists. Re-run with --force to overwrite it.");
  process.exit(1);
}

const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const data = (n) => read(path.join(V1, "data", `${n}.json`));
const types = data("types"), images = data("images"), handwriting = data("handwriting");
const campaignIndex = data("campaign-index");
const pages = {};
for (const f of fs.readdirSync(path.join(V1, "pages"))) if (f.endsWith(".json")) { const p = read(path.join(V1, "pages", f)); pages[p.id] = p; }

const plain = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const slug = (s) => plain(s).toLowerCase().normalize("NFKD").replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Old relative or /resources/… paths become full addresses on the original server. */
function fileUrl(u) {
  if (!u || /^(https?:|data:|mailto:|tel:|#)/i.test(u)) return u;
  if (u.startsWith("/")) return OLD + u;
  return `${OLD}/resources/${u}`;
}
const imgUrl = (key) => (images[key] ? fileUrl(images[key]) : null);

// ---------------- YAML writer (enough for our data) ----------------
function yScalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (s === "" || /^[\s>|!&*%@`#-]|[:#]\s|:$|^\d|^(true|false|null|yes|no|on|off)$|["'{}\[\],?]|\n|\s$/i.test(s)) return JSON.stringify(s);
  return s;
}
function yaml(v, ind = "") {
  if (Array.isArray(v)) {
    if (!v.length) return " []";
    return v.map((x) => {
      if (x && typeof x === "object" && !Array.isArray(x)) {
        const body = yaml(x, ind + "  ").replace(/^\n/, "").replace(new RegExp(`^${ind}  `), "");
        return `\n${ind}- ${body}`;
      }
      return `\n${ind}- ${yScalar(x)}`;
    }).join("");
  }
  if (v && typeof v === "object") {
    return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) =>
      x && typeof x === "object" ? `\n${ind}${k}:${yaml(x, ind + "  ")}` : `\n${ind}${k}: ${yScalar(x)}`).join("");
  }
  return " " + yScalar(v);
}
const toYaml = (o) => yaml(o).replace(/^\n/, "") + "\n";

// ---------------- body: HTML → Markdown (plain paragraphs) + raw HTML (everything else) ----------------
function escapeMd(s) {
  return s.replace(/\\/g, "\\\\").replace(/([*_`\[\]])/g, "\\$1").replace(/^(\s*)([#>+-])(\s)/, "$1\\$2$3").replace(/^(\s*\d+)([.)])(\s)/, "$1\\$2$3");
}
function fixHtml(h) {
  return h
    .replace(/<img([^>]*?)\sdata-hw="([^"]+)"([^>]*)>/g, (m, a, k, b) => { const u = handwriting[k]; return u ? `<img${a} src="${fileUrl(u)}"${b}>` : ""; })
    .replace(/\s(src|href)="([^"]+)"/g, (m, at, u) => ` ${at}="${fileUrl(u)}"`);
}
function bodyToMarkdown(html) {
  html = fixHtml(String(html || "")).replace(/<div class="nigpanel"[^]*?data-np[^]*?<\/div>\s*<\/div>/g, "");
  const out = [];
  // split into top-level elements
  const re = /<(p|div|figure|h3|ul|img)(\s[^>]*)?>/g;
  let i = 0;
  while (i < html.length) {
    re.lastIndex = i;
    const m = re.exec(html);
    if (!m) { const rest = html.slice(i).trim(); if (rest) out.push(rest); break; }
    const before = html.slice(i, m.index).trim();
    if (before) out.push(before);
    const tag = m[1];
    let end;
    if (tag === "img") end = re.lastIndex;
    else {
      // find the matching close tag, counting nesting of the same tag
      const open = new RegExp(`<${tag}(\\s[^>]*)?>|</${tag}>`, "g");
      open.lastIndex = m.index; let depth = 0, mm;
      while ((mm = open.exec(html))) { depth += mm[0][1] === "/" ? -1 : 1; if (!depth) { end = open.lastIndex; break; } }
      end ??= html.length;
    }
    const chunk = html.slice(m.index, end);
    const inner = tag === "p" && !m[2] ? chunk.slice(3, -4) : null;
    if (inner != null && !/<(?!\/?(em|strong|b|i|span|br)\b)/i.test(inner) && plain(inner)) {
      // a plain paragraph: Markdown text (inline <span>/<em> kept as-is), escaped outside tags
      const md = inner.split(/(<[^>]+>)/).map((part) => (part.startsWith("<") ? part : escapeMd(part.replace(/\n/g, " ")))).join("");
      out.push(md.replace(/<em>([^<]*)<\/em>/g, (x, t) => (t.trim() && !/[*_]/.test(t) ? `*${t}*` : x)));
    } else out.push(chunk.replace(/\n/g, " "));
    i = end;
  }
  return out.join("\n\n").trim() + "\n";
}

// ---------------- grouping data kept on the old hub pages ----------------
const tagsOf = {}; // page id -> Set of tag labels
const addTag = (id, t) => (tagsOf[id] ||= new Set()).add(plain(t));
function hubTags(hubId, filterMode) {
  const hub = pages[hubId]; if (!hub) return;
  const labels = {}, panels = {};
  for (const b of hub.blocks || []) {
    if (b.type === "filters") for (const it of b.items) labels[it.key] = plain(it.label);
    if (b.type === "tabs") for (const it of b.items) panels[it.panel] = plain(it.label);
  }
  for (const b of hub.blocks || []) if (b.type === "cards") for (const c of b.items) {
    if (!c.page) continue;
    const keys = String(c.attrs?.[filterMode] || "").split(/\s+/).filter(Boolean);
    for (const k of keys) if (labels[k]) addTag(c.page, labels[k]);
    const panel = b.attrs?.id && panels[b.attrs.id];
    if (panel) addTag(c.page, panel);
  }
}
hubTags("cNiggunim", "data-hk");
hubTags("cYomTov", "data-mv");
hubTags("cMivtzoim", "data-mv");

// ---------------- features (series) ----------------
const CAMP_OF_HUB = { cNiggunim: "niggunim", cYomTov: "yom-tov", cHiskashrus: "hiskashrus", cMivtzoim: "mivtzoim", cYomaDepagra: "yama-depagra", cCheshbon: "cheshbon-hanefesh", cVeholachta: "vehalachta-bedrachav" };
const SAMPLE_ONLY = new Set(["yd-stories", "yd-niggunim", "mivtzoim", "minhagim", "pirkei-avos"]);
const campOfType = {};
for (const p of Object.values(pages)) if (p.template === "article") campOfType[p.type] ||= CAMP_OF_HUB[p.altParent] || CAMP_OF_HUB[p.parent];
for (const c of campaignIndex.campaigns) for (const s of c.sections) for (const f of s.features) if (f.shell) campOfType[f.shell] ||= c.id;
const campColor = Object.fromEntries(campaignIndex.campaigns.map((c) => [c.id, c.color]));

const features = [];
for (const [id, t] of Object.entries(types)) {
  if (t.template !== "article" || SAMPLE_ONLY.has(id)) continue;
  const d = t.defaults || {};
  features.push({
    id, name: plain(t.label), campaign: campOfType[id] || "hiskashrus",
    color: d.ribbonColor || campColor[campOfType[id]] || "navy",
    kick: d.kick ? plain(d.kick) : undefined, ribbon: d.ribbon ? plain(d.ribbon) : plain(t.label), mission: d.mission ? plain(d.mission) : undefined,
  });
}
features.push({ id: "yd-soul-expression", name: "Soul Expression", campaign: "yama-depagra", color: "gold", kick: "Yama Depagra · YD Niggunim", ribbon: "Soul Expression" });
const featureIds = new Set(features.map((f) => f.id));

// ---------------- campaigns (the Weekly Hachayol list) ----------------
const RULES = {
  "nigunei-hashona": { features: ["niggun-of-the-week"], tag: "Niggunei Hashana" },
  "rebbes-niggunim": { features: ["niggun-of-the-week"], tag: "Niggunim the Rebbe Taught" },
  "niggunim-shonos": { features: ["niggun-of-the-week"], tag: "Niggunim Shonim" },
  "mivtzoim-mania-story-1": { features: ["mivtzoim-mania"], tag: "Mivtzoim Mania - Stories 1" },
  "mivtzoim-mania-story-2": { features: ["mivtzoim-mania"], tag: "Mivtzoim Mania - Stories 2" },
  "mivtzoim-mania-fiction": { features: ["mivtzoim-mania"], tag: "Mivtzoim Mania - Fiction" },
};
for (let i = 1; i <= 6; i++) RULES[`roots-book-${i}`] = { features: ["roots-stories-of-our-lives", "roots"], year: 5784 + i };
for (let y = 5782; y <= 5787; y++) RULES[`rwfaw-${y}`] = { features: ["rebbe-will-find-a-way"], year: y };
for (let y = 5787; y <= 5790; y++) RULES[`chassidishe-frames-${y}`] = { features: ["chassidishe-frames"], year: y };
for (let y = 5784; y <= 5787; y++) RULES[`squad-drills-${y}`] = { features: ["squad-drills"], year: y };

const EXTRA = {
  niggunim: { name: "More Niggunim", entries: [{ id: "niggun-of-the-week", title: "Niggun of the Week", show: { features: ["niggun-of-the-week"] } }] },
  "yom-tov": { name: "More Yom Tov", entries: [{ id: "yom-tov-seasons", title: "Yom Tov Seasons", show: { features: ["yom-tov-seasons"] } }] },
  hiskashrus: { name: "More Hiskashrus", entries: [{ id: "rebbe-story", title: "Rebbe Story", show: { features: ["rebbe-story"] } }] },
};
const defs = {};
for (const c of campaignIndex.campaigns) for (const s of c.sections) for (const f of s.features) if (f.id) defs[f.id] = f;
const campaigns = campaignIndex.campaigns.map((c) => ({
  id: c.id, name: c.name, color: c.color,
  sections: [
    ...c.sections.map((s) => ({
      name: s.name,
      entries: s.features.map((x) => {
        const f = defs[x.id || x.ref];
        const show = RULES[f.id] || { features: [f.shell === "yd-niggunim" ? "yd-soul-expression" : f.shell] };
        for (const id of show.features) if (!featureIds.has(id)) throw new Error(`unknown feature ${id}`);
        return { id: f.id, title: plain(f.title), grade: f.grade, part: f.part, show };
      }),
    })),
    ...(EXTRA[c.id] ? [EXTRA[c.id]] : []),
  ],
}));

// ---------------- spreads ----------------
const issueOfPdf = (u) => { const m = String(u || "").replace(/%20/g, " ").match(/(?<!\d)(\d{3})(?!\d)/); return m ? +m[1] : null; };
// spellings differ between the old PDF folders; use one name per parsha
const SPELL = { Vayeshev: "Vayeishev", Teruma: "Terumah", Metzorah: "Metzora", "Tazria Metzorah": "Tazria Metzora", "Nitzavom Vayelech": "Nitzavim Vayelech", "Nitzavim-Vayelech": "Nitzavim Vayelech", "Ki Setzei": "Ki Seitzei", "Ki Seisei": "Ki Seitzei", Kisisa: "Ki Sisa", Kisavo: "Ki Savo", Mishpotim: "Mishpatim", "Acharei Mos Kedoshim": "Acharei Kedoshim", Bechukosei: "Bechukosai", Vayelech: "Vayeilech" };
const spell = (w) => w && w.replace(/^(Parshas )?(.+)$/, (m, pre, n) => (pre || "") + (SPELL[n] || n));
const weekOfPdf = (u) => { const m = decodeURIComponent(String(u || "")).match(/\d{3}[ -]([^/]+?)(?:pdf)?\.pdf$/i); const w = m ? m[1].replace(/-/g, " ").replace(/\s+\d+$/, "").trim() : null; return w && !/^Spreads?$/i.test(w) ? w : null; };

const spreads = [];
const ART = ["kick", "ribbon", "ribbonColor", "mission", "missionColor", "leadColor", "subtitle", "hebbig", "titleHeb", "chips", "pdfLabel", "olderPdfs", "sichosLabel", "altBase", "source"];
for (const p of Object.values(pages)) {
  if (p.template !== "article") continue;
  const a = p.article || {};
  if (a.sample || SAMPLE_ONLY.has(p.type)) continue;
  const fm = { title: plain(p.title) === p.title ? p.title : p.title, feature: p.type, issue: p.issue ?? issueOfPdf(a.pdf) ?? undefined };
  for (const k of ART) if (a[k] != null && !(Array.isArray(a[k]) && !a[k].length)) fm[k] = k === "chips" ? a[k].map((c) => c) : a[k];
  if (fm.source) fm.source = plain(fm.source);
  const tg = tagsOf[p.id]; if (tg?.size) fm.tags = [...tg];
  fm.pages = (a.pages || []).map(imgUrl).filter(Boolean);
  if (a.pdf) fm.pdf = fileUrl(a.pdf);
  if (a.media?.length) fm.media = a.media.map((m) => ({ label: plain(m.label), href: fileUrl(m.href) }));
  if (a.sichos?.length) fm.sichos = a.sichos.map((m) => ({ label: plain(m.label), href: fileUrl(m.href) }));
  if (a.related) fm.related = { ...a.related, items: (a.related.items || []).map((it) => ({ ...it, href: it.href ? fileUrl(it.href) : undefined })) };
  fm.v1 = p.id;
  spreads.push({ fm, body: bodyToMarkdown(a.body), week: weekOfPdf(a.pdf), src: a.source });
}
// Yoma Depagra timelines lived as galleries on the date pages
for (const p of Object.values(pages)) {
  if (p.type !== "yd-campaign-date") continue;
  const head = p.blocks.find((b) => b.type === "heading") || {};
  const tabs = Object.fromEntries(p.blocks.filter((b) => b.type === "tabs").flatMap((b) => b.items.map((t) => [t.panel, plain(t.label)])));
  for (const g of p.blocks.filter((b) => b.type === "gallery")) {
    if (!/Timeline/.test(tabs[g.panel] || "")) continue; // comics are already spreads of Chassidishe Frames
    spreads.push({
      fm: {
        title: `${plain(head.title)} · ${plain(head.text)}`, feature: "yd-building-blocks", issue: issueOfPdf(g.pdf) ?? undefined,
        chips: [plain(head.title)], pages: g.images.map((i) => imgUrl(i.img)).filter(Boolean), pdf: fileUrl(g.pdf), v1: p.id,
      },
      body: "", week: weekOfPdf(g.pdf),
    });
  }
}

// ---------------- issues ----------------
const YEAR = (n) => (n >= 660 ? 5787 : n >= 620 ? 5786 : n >= 578 ? 5785 : null);
const issues = {};
for (const s of spreads) {
  const n = s.fm.issue; if (n == null) continue;
  const it = (issues[n] ||= { number: n, weeks: {}, dates: [], years: {}, pdf: null });
  const src = plain(s.src || "").replace(/^Source:\s*/, "");
  if (/^Parshas /.test(src)) { const [w0, d] = src.split(" · "); const w = spell(w0); it.weeks[w] = (it.weeks[w] || 0) + 5; if (d && /\d/.test(d)) it.dates.push(d); }
  if (s.week) { const w0 = /^(Rosh|Yom|Sukkos|Shmini Atzeres|Shemini Atzeres|Simchas|Chanukah?|Channukah|Purim|Pesach|Shavuos|Lag|Tu|Chof|Yud|Shevi|Elul|Aseres|Tzom|Asarah|Chamisha|Sefiras)/i.test(s.week) ? s.week : `Parshas ${s.week}`; const w = spell(w0); it.weeks[w] = (it.weeks[w] || 0) + 1; }
  const y = plain([s.src, ...(s.fm.chips || [])].join(" ")).match(/57\d\d/); if (y) it.years[y[0]] = (it.years[y[0]] || 0) + 1;
  if (s.fm.pdf && new RegExp(`/pdfs/${n}\\.pdf$`).test(s.fm.pdf)) it.pdf = s.fm.pdf;
}
const issueFiles = Object.values(issues).sort((a, b) => a.number - b.number).map((it) => {
  const week = Object.entries(it.weeks).sort((a, b) => b[1] - a[1])[0]?.[0];
  const voted = Object.entries(it.years).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { number: it.number, week, date: it.dates[0], year: YEAR(it.number) ?? (voted ? +voted : undefined), pdf: it.pdf || undefined };
});

// ---------------- write ----------------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "spreads"), { recursive: true });
fs.mkdirSync(path.join(OUT, "issues"), { recursive: true });
const header = (t) => `# ${t}\n# Edited by hand or in the browser editor (see v2/README.md).\n`;
fs.writeFileSync(path.join(OUT, "features.yml"), header("Features: each one is a series with its own look. Spreads name their feature by id.") + toYaml(features));
fs.writeFileSync(path.join(OUT, "campaigns.yml"), header("Campaigns: campaign → section → entries. Each entry shows the spreads of its features, optionally only one year or tag.") + toYaml(campaigns));
for (const it of issueFiles) fs.writeFileSync(path.join(OUT, "issues", `${it.number}.yml`), toYaml(it));
const used = new Set();
for (const s of spreads) {
  let name = `${s.fm.issue ?? "x"}-${s.fm.feature}`;
  for (let k = 2; used.has(name); k++) name = `${s.fm.issue ?? "x"}-${s.fm.feature}-${k}`;
  used.add(name);
  fs.writeFileSync(path.join(OUT, "spreads", `${name}.md`), `---\n${toYaml(s.fm)}---\n${s.body ? "\n" + s.body : ""}`);
}
const older = data("older-pdfs");
fs.writeFileSync(path.join(OUT, "older-pdfs.json"), JSON.stringify(Object.fromEntries(Object.entries(older).map(([k, v]) => [k, v.map(([label, href]) => ({ label, href: fileUrl(href) }))])), null, 1));
console.log(`features ${features.length}, campaigns ${campaigns.length}, issues ${issueFiles.length}, spreads ${spreads.length}`);
