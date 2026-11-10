// One-time migration: original compiled site -> editable JSON content.
//
//   node scripts/migrate.mjs path/to/orig.json
//
// orig.json is produced by scripts/extract-original.cjs from the original
// bundles. Every page is parsed into structured fields where the markup follows
// a known pattern; anything that does not is kept verbatim as an "html" block,
// so nothing is lost. Each page is then re-rendered and compared with the
// original markup; the report lists any page that does not match.
import fs from "node:fs";
import path from "node:path";
import { fragment, canon } from "./lib/dom.mjs";
import { renderPage, renderBlock, renderCard, resolvePage, stripTags } from "../public/js/render.js";

const SRC = process.argv[2] || "migration/orig.json";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const orig = JSON.parse(fs.readFileSync(SRC, "utf8"));

const inner = (el) => (el ? el.innerHTML : undefined);
const kids = (el) => [...el.children];
const one = (el, sel) => el.querySelector(`:scope > ${sel}`);
const classesOf = (el) => [...el.classList];
const colorOf = (el) => (classesOf(el).find((c) => /^c-/.test(c)) || "").slice(2);
const otherAttrs = (el, skip) => {
  const o = {};
  for (const a of el.attributes) if (!skip.includes(a.name)) o[a.name] = a.value;
  return Object.keys(o).length ? o : undefined;
};
const styleVar = (el, name) => {
  const m = (el.getAttribute("style") || "").match(new RegExp(`--${name}:\\s*(?:var\\(--([a-z]+)\\)|([^;]+))`));
  return m ? m[1] || m[2].trim() : undefined;
};
const prune = (o) => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
};
const same = (a, b) => canon(a) === canon(b);

// ---------- crumbs ----------
function parseCrumbWrap(wrap) {
  if (!wrap || !wrap.children.length) return null;
  const back = wrap.querySelector("button.back");
  const bn = back?.querySelector(".bn");
  const trail = [];
  let current;
  for (const c of kids(wrap)) {
    if (c.matches("button[data-go]") && c.getAttribute("data-go") !== "home") trail.push({ id: c.getAttribute("data-go"), label: c.innerHTML });
    else if (c.tagName === "SPAN" && !c.classList.length) current = c.innerHTML;
  }
  return {
    back: back?.getAttribute("data-back"),
    backLabel: bn ? bn.innerHTML.replace(/^ to /, "") : undefined,
    trail,
    current,
  };
}

// ---------- cards ----------
function parseCard(el) {
  if (el.matches("div.card.empty-card")) {
    const [rw, inn] = kids(el);
    const r = rw?.querySelector(".ribbon");
    const [kick, h4, p, foot] = inn ? kids(inn) : [];
    const [pill, go] = foot ? kids(foot) : [];
    return prune({
      variant: "empty",
      extraClass: classesOf(el).filter((c) => !["card", "empty-card"].includes(c)).join(" ") || undefined,
      attrs: otherAttrs(el, ["class"]),
      ribbon: inner(r), ribbonColor: r && colorOf(r),
      kick: inner(kick), heading: inner(h4), text: inner(p), textStyle: p?.getAttribute("style") || undefined, pill: inner(pill), go: inner(go), goStyle: go?.getAttribute("style") || undefined,
    });
  }
  if (!el.matches("button.card")) return null;
  const img = one(el, "img.cardimg");
  const inn = one(el, "div.in");
  if (!inn) return null;
  const r = inn.querySelector(".rw .ribbon");
  const emb = inn.querySelector(".msn-emb > *");
  const body = inn.querySelector(".msn-body");
  const b = body?.querySelector(":scope > b");
  let mission;
  if (body) {
    const clone = body.cloneNode(true);
    clone.querySelector(":scope > b")?.remove();
    mission = clone.innerHTML;
  }
  const go = inn.querySelector(".foot .go");
  const color = styleVar(el, "cc");
  const restStyle = (el.getAttribute("style") || "").replace(/--cc:[^;]+;?/, "").trim();
  return prune({
    page: el.getAttribute("data-go") || undefined,
    extraClass: classesOf(el).filter((c) => c !== "card").join(" ") || undefined,
    attrs: otherAttrs(el, ["class", "data-go", ...(restStyle ? [] : ["style"])]),
    color,
    img: img?.getAttribute("data-img") || undefined,
    imgZoom: img ? img.classList.contains("zoom") : undefined,
    kick: inner(inn.querySelector(".kick")),
    ribbon: inner(r), ribbonColor: r && colorOf(r),
    icon: emb && emb.tagName === "IMG" ? emb.getAttribute("src") : undefined,
    missionLabel: b && b.innerHTML !== "Mission" ? b.innerHTML : undefined,
    mission,
    go: go && go.innerHTML !== "Open →" ? go.innerHTML : undefined,
    goStyle: go?.getAttribute("style") || undefined,
  });
}

// ---------- blocks ----------
const codecs = [
  (el) => {
    if (!el.matches("div.sec-h")) return null;
    const [eb, h2, p, ...rest] = kids(el);
    if (rest.length || !eb?.matches(".eyebrow") || h2?.tagName !== "H2") return null;
    return prune({ type: "heading", eyebrow: eb.innerHTML, title: h2.innerHTML, heb: h2.classList.contains("heb-h2") || undefined, text: p ? p.innerHTML : undefined });
  },
  (el) => {
    if (!el.matches("div.sh")) return null;
    return prune({ type: "label", text: el.innerHTML, heb: el.classList.contains("heb-sh") || undefined, spaced: el.classList.contains("mt") || undefined, attrs: otherAttrs(el, ["class"]) });
  },
  (el) => (el.matches("div.note") && el.classList.length === 1 ? prune({ type: "note", html: el.innerHTML, attrs: otherAttrs(el, ["class"]) }) : null),
  (el) => {
    if (!el.matches("a.hachayolbar")) return null;
    const [l, i, a] = kids(el);
    return prune({ type: "hachayolbar", href: el.getAttribute("href"), label: l?.innerHTML === "Hachayol" ? undefined : l?.innerHTML, info: i?.innerHTML, action: a?.innerHTML });
  },
  (el) => {
    if (!el.matches("div.cards")) return null;
    const items = kids(el).map(parseCard);
    if (items.some((x) => !x)) return null;
    return prune({ type: "cards", extraClass: classesOf(el).filter((c) => c !== "cards").join(" ") || undefined, attrs: otherAttrs(el, ["class"]), items });
  },
  (el) => {
    if (!el.matches("div.subgrid")) return null;
    const extra = classesOf(el).filter((c) => !["subgrid", "rtl"].includes(c));
    if (extra.length) return null;
    const items = kids(el).map((c) => {
      if (!c.matches(".sc")) return null;
      const badge = one(c, ".now-badge");
      const b = one(c, "b"), sp = one(c, "span:not(.now-badge)");
      return prune({
        page: c.getAttribute("data-go") || undefined,
        sched: c.getAttribute("data-sch") || undefined,
        static: c.tagName === "DIV" || undefined,
        extraClass: classesOf(c).filter((x) => !["sc", "flat"].includes(x)).join(" ") || undefined,
        attrs: otherAttrs(c, ["class", "data-go", "data-sch"]),
        badge: badge ? badge.innerHTML : undefined,
        title: b?.innerHTML, text: sp?.innerHTML,
      });
    });
    if (items.some((x) => !x)) return null;
    return prune({ type: "links", rtl: el.classList.contains("rtl") || undefined, attrs: otherAttrs(el, ["class"]), items });
  },
];

codecs.push(
  (el) => {
    if (!el.matches("div.mvtabs")) return null;
    return { type: "tabs", items: kids(el).map((t) => prune({ panel: t.getAttribute("data-mvtab"), label: t.innerHTML, on: t.classList.contains("on") || undefined })) };
  },
  (el) => {
    if (!el.matches("div.mvtogbar")) return null;
    const all = kids(el);
    const lab = all[0]?.tagName === "SPAN" ? all.shift() : null;
    const mode = all[0]?.hasAttribute("data-mv") ? "mv" : "hk";
    return prune({
      type: "filters", mode, label: lab ? lab.innerHTML : undefined,
      items: all.map((t) => { const c = t.cloneNode(true); c.querySelector("i")?.remove(); return prune({ key: t.getAttribute(mode === "mv" ? "data-mv" : "data-hk"), label: c.innerHTML, pressed: t.getAttribute("aria-pressed") === "true" || undefined }); }),
    });
  },
  (el) => {
    if (!el.matches("div.mvgrid") || el.matches(".cards")) return null;
    const pr = one(el, ".pagerow"), ib = one(el, ".imgbtns");
    const pdf = ib?.querySelector("a.imgbtn");
    return prune({
      type: "gallery", panel: el.id || undefined, hidden: el.classList.contains("off") || undefined,
      images: [...(pr?.querySelectorAll("img") || [])].map((i) => ({ img: i.getAttribute("data-img"), alt: i.getAttribute("alt") })),
      pdf: pdf?.getAttribute("href"), pdfLabel: pdf && pdf.innerHTML !== "Print PDF" ? pdf.innerHTML : undefined,
    });
  },
);

const colorVar = (el) => styleVar(el, "c");
codecs.push(
  (el) => el.matches("div.tiles") ? { type: "tiles", items: kids(el).map((t) => ({ page: t.getAttribute("data-go"), color: colorVar(t), kicker: inner(t.querySelector(".sub")), title: inner(t.querySelector("h3")), text: inner(t.querySelector("p")) })) } : null,
  (el) => el.matches("div.campgrid") ? { type: "branches", items: kids(el).map((t) => ({ page: t.getAttribute("data-go"), color: colorVar(t), icon: t.querySelector("img")?.getAttribute("src"), title: inner(t.querySelector(".cc-name")), text: inner(t.querySelector(".cc-desc")) })) } : null,
  (el) => el.matches("div.rgrid") ? { type: "dates", items: kids(el).map((t) => prune({ page: t.getAttribute("data-go"), title: inner(one(t, "b")), text: inner(one(t, "span:not(.sg)")), suggested: t.classList.contains("sug") || undefined })) } : null,
);

const stats = { blocks: {}, html: {} };
function parseBlock(el) {
  for (const c of codecs) {
    const b = c(el);
    if (b && same(renderBlock(b), el.outerHTML)) {
      stats.blocks[b.type] = (stats.blocks[b.type] || 0) + 1;
      return b;
    }
  }
  const key = el.tagName.toLowerCase() + "." + classesOf(el).join(".");
  stats.html[key] = (stats.html[key] || 0) + 1;
  return { type: "html", html: el.outerHTML };
}

// ---------- article ----------
const ARTICLE_ORDER = ["kick", "rw", "titlerow", "metarow", "pagerow", "imgbtns", "sichrow", "prose", "ordersub", "mission2", "srcline"];
function parseArticle(item, title) {
  const parts = {};
  for (const c of kids(item)) {
    const k = ARTICLE_ORDER.find((n) => c.classList.contains(n));
    if (!k || parts[k]) return null;
    parts[k] = c;
  }
  const order = kids(item).map((c) => ARTICLE_ORDER.find((n) => c.classList.contains(n)));
  if (order.join() !== ARTICLE_ORDER.filter((k) => parts[k]).join()) return null;
  const a = {};
  a.kick = parts.kick?.innerHTML;
  const rib = parts.rw?.querySelector(".ribbon");
  a.ribbon = inner(rib);
  a.ribbonColor = rib && colorOf(rib);
  const tr = parts.titlerow;
  const h1 = tr?.querySelector("h1");
  a.titleHeb = h1?.classList.contains("heb") || undefined;
  a.hebbig = inner(tr?.querySelector(".hebbig"));
  a.subtitle = inner(tr?.querySelector(".sub"));
  a.chips = [...(parts.metarow?.querySelectorAll(".meta .chip") || [])].map((c) => c.innerHTML);
  const media = [...(parts.metarow?.querySelectorAll(".mediachips a") || [])].map((m) => ({ href: m.getAttribute("href"), label: m.innerHTML }));
  if (media.length) a.media = media;
  a.pages = [...(parts.pagerow?.querySelectorAll("img") || [])].map((i) => i.getAttribute("data-img"));
  const firstAlt = parts.pagerow?.querySelector("img")?.getAttribute("alt");
  if (firstAlt) a.altBase = firstAlt.replace(/ — page 1$/, "");
  const pdf = parts.imgbtns?.querySelector("a.imgbtn");
  a.pdf = pdf?.getAttribute("href");
  if (pdf && pdf.innerHTML !== "Print PDF") a.pdfLabel = pdf.innerHTML;
  a.olderPdfs = parts.imgbtns?.querySelector("[data-older]")?.getAttribute("data-older");
  if (parts.sichrow) {
    const lab = parts.sichrow.querySelector(".sichlab");
    if (lab.innerHTML !== "Sichos this piece is built on") a.sichosLabel = lab.innerHTML;
    a.sichos = [...parts.sichrow.querySelectorAll("a")].map((x) => ({ label: x.innerHTML, href: x.getAttribute("href") }));
  }
  a.leadColor = parts.prose && styleVar(parts.prose, "lead");
  a.body = parts.prose?.innerHTML ?? "";
  if (parts.ordersub) {
    const os = parts.ordersub;
    const hd = os.querySelector(".os-h");
    const r = {};
    if (hd.classList.contains("os-h2")) {
      r.headingHeb = inner(hd.querySelector(".os-h-heb"));
      r.headingEn = inner(hd.querySelector(".os-h-en"));
    } else r.heading = hd.innerHTML;
    r.items = [...os.querySelectorAll(".os-item")].map((x) => {
      const href = x.getAttribute("href");
      const [ic, sp] = kids(x);
      return prune({ href: href === "#" ? undefined : href, icon: ic?.innerHTML, title: inner(sp?.querySelector(":scope > b")), sub: inner(sp?.querySelector(":scope > span")) });
    });
    r.note = inner(os.querySelector(".os-note"));
    a.related = prune(r);
  }
  a.missionColor = parts.mission2 && styleVar(parts.mission2, "c");
  a.mission = inner(parts.mission2?.querySelector(".m2-text"));
  a.source = parts.srcline?.innerHTML;
  a.sample = parts.srcline?.classList.contains("sample") || undefined;
  // drop values equal to their defaults so pages inherit them
  if (a.leadColor === a.ribbonColor) delete a.leadColor;
  if (a.missionColor === a.ribbonColor) delete a.missionColor;
  if (a.altBase === title.replace(/<[^>]*>/g, "")) delete a.altBase;
  if (!a.pages.length) delete a.pages;
  return prune(a);
}

// ---------- page ----------
const pages = {};
for (const [id, html] of Object.entries(orig.pages)) {
  const sec = fragment(html).firstElementChild;
  const page = { id, branch: orig.OV[id] };
  const crumb = parseCrumbWrap(sec.querySelector(":scope > .crumb > .wrap"));
  const alt = sec.querySelector(":scope > template.altcrumb");
  const altCrumb = alt ? parseCrumbWrap(alt.content) : null;
  if (crumb) {
    page.parent = crumb.back;
    page.crumbLabel = crumb.current;
    page._crumb = crumb;
  }
  if (altCrumb) {
    page.altParent = altCrumb.back;
    page.altBranch = alt.getAttribute("data-branch");
    page._altCrumb = altCrumb;
  }
  const body = kids(sec).filter((c) => !c.matches(".crumb, template.altcrumb"));
  const item = body.length === 1 && body[0].matches("div.sec") ? body[0].querySelector(":scope > .wrap > .item") : null;
  const title0 = item?.querySelector(".titlerow h1")?.innerHTML;
  const art = item && item.parentElement.children.length === 1 ? parseArticle(item, title0 || "") : null;
  if (art) {
    page.template = "article";
    page.title = title0;
    page.article = art;
  } else if (body.length === 1 && body[0].matches("div.sec") && body[0].classList.length === 1) {
    page.template = "hub";
    page.blocks = kids(body[0].querySelector(":scope > .wrap")).map(parseBlock);
    const hd = page.blocks.find((b) => b.type === "heading");
    page.title = hd?.title ?? page.crumbLabel ?? id;
  } else {
    page.template = "hub";
    page.sections = body.map((el) => {
      if (el.matches("div.sec") && el.children.length === 1 && el.firstElementChild.matches(".wrap")) {
        return prune({ alt: el.classList.contains("alt") || undefined, blocks: kids(el.firstElementChild).map(parseBlock) });
      }
      return { html: el.outerHTML };
    });
    page.title = id === "home" ? "Resources" : page.crumbLabel ?? id;
  }
  pages[id] = page;
}

// derive crumbs from the parent chain; keep overrides only where the original differs
const lookup = (id) => pages[id];
function crumbCheck(page, key, ck, labelKey) {
  const c = page[ck];
  if (!c) return;
  const parent = page[key] === "home" ? { crumbLabel: "Resources" } : pages[page[key]] || {};
  if (c.backLabel !== (parent.crumbLabel ?? parent.title)) page[labelKey] = c.backLabel;
}
for (const p of Object.values(pages)) {
  crumbCheck(p, "parent", "_crumb", "backLabel");
  crumbCheck(p, "altParent", "_altCrumb", "altBackLabel");
}
let crumbOverrides = 0;
for (const p of Object.values(pages)) {
  for (const [ck, ov, key] of [["_crumb", "crumb", "parent"], ["_altCrumb", "altCrumb", "altParent"]]) {
    const c = p[ck];
    if (!c) continue;
    const derived = (() => {
      const t = [];
      const seen = new Set([p.id]);
      let pid = p[key];
      while (pid && pid !== "home" && !seen.has(pid)) {
        seen.add(pid);
        const q = pages[pid];
        if (!q) break;
        t.unshift({ id: pid, label: q.crumbLabel || q.title || pid });
        pid = q.parent;
      }
      return t;
    })();
    if (JSON.stringify(derived) !== JSON.stringify(c.trail)) {
      p[ov] = { trail: c.trail };
      crumbOverrides++;
    }
    if (ck === "_altCrumb" && c.current !== p.crumbLabel) p.altCrumb = { ...(p.altCrumb || {}), current: c.current };
  }
}

// ---------- page types ----------
const slug = (s) => String(s).toLowerCase().replace(/<[^>]*>/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const mostCommon = (arr) => {
  const m = new Map();
  arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  const [v, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return n >= Math.max(2, arr.length * 0.6) ? v : undefined;
};
const groups = {};
for (const p of Object.values(pages)) {
  if (p.template !== "article") continue;
  const k = `${p.article.ribbon}|${p.article.ribbonColor}`;
  (groups[k] = groups[k] || []).push(p);
}
const types = {};
const ribbonCount = {};
Object.keys(groups).forEach((k) => (ribbonCount[k.split("|")[0]] = (ribbonCount[k.split("|")[0]] || 0) + 1));
for (const [k, list] of Object.entries(groups)) {
  const [ribbon, color] = k.split("|");
  const kick = mostCommon(list.map((p) => p.article.kick));
  let id = slug(ribbon);
  if (ribbonCount[ribbon] > 1) id += "-" + slug(kick ? kick.split("·").pop() : color);
  id = ({ "rebbe-story-rebbe-story": "rebbe-story", "roots-roots": "roots", "rebbe-story-the-rebbe-will-find-a-way": "rebbe-will-find-a-way", "roots-roots-stories-of-our-lives": "roots-stories-of-our-lives", "parsha-podcast-the-parsha-podcast-1": "parsha-podcast-1", "parsha-podcast-the-parsha-podcast-2": "parsha-podcast-2" })[id] || id;
  const parentDefault = mostCommon(list.map((p) => p.parent));
  const altDefault = mostCommon(list.map((p) => p.altParent));
  types[id] = prune({
    label: ribbonCount[ribbon] > 1 && !(kick || "").includes(stripTags(ribbon)) ? `${stripTags(ribbon)} (${stripTags(kick ? kick.split("·").pop().trim() : color)})` : ribbonCount[ribbon] > 1 ? stripTags(kick.split("·").pop().trim()) : stripTags(ribbon),
    template: "article",
    group: "Articles",
    defaults: prune({ kick, ribbon, ribbonColor: color, mission: mostCommon(list.map((p) => p.article.mission)) }),
    newPage: prune({ branch: list[0].branch, parent: parentDefault, altParent: altDefault }),
    count: list.length,
  });
  for (const p of list) {
    p.type = id;
    for (const f of ["kick", "ribbon", "ribbonColor", "mission"]) if (p.article[f] === types[id].defaults[f]) delete p.article[f];
  }
}
const HUB_TYPES = [
  [/^home$/, "home", "Home page"],
  [/^dp[A-Z]/, "parsha-week", "Parsha week"],
  [/^dm[A-Z]/, "month", "Hebrew month"],
  [/^(dyd|dYD)\d/, "yd-date", "Yoma Depagra date (Date branch)"],
  [/^(dyt|dYTC)/, "yt-date", "Yom Tov (Date branch)"],
  [/^cyd_/, "yd-campaign-date", "Yoma Depagra date (Campaign)"],
  [/^hkT\d/, "series", "Story series"],
];
for (const p of Object.values(pages)) {
  if (p.template === "article") continue;
  const m = HUB_TYPES.find(([re]) => re.test(p.id));
  p.type = m ? m[1] : "hub";
}
for (const [, id, label] of HUB_TYPES) types[id] = { label, template: "hub", group: "Section pages" };
types.hub = { label: "Section page (general)", template: "hub", group: "Section pages" };
for (const [id, t] of Object.entries(types)) {
  if (t.template !== "hub") continue;
  const sample = Object.values(pages).filter((p) => p.type === id);
  t.count = sample.length;
  if (sample.length && id !== "home") {
    // new pages of this type start with the block layout of the first existing one, emptied of items
    const first = sample[0];
    t.newPage = prune({ branch: first.branch, parent: mostCommon(sample.map((p) => p.parent)) || first.parent });
    t.blocks = (first.blocks || []).map((b) => (b.type === "heading" ? { ...b, title: "" } : b.items ? { ...b, items: [] } : b.type === "html" ? { type: "html", html: "" } : { type: b.type }));
  }
}

// verify every page round-trips
const bad = [];
for (const p of Object.values(pages)) {
  const { _crumb, _altCrumb, ...clean } = p;
  pages[p.id] = clean;
}
for (const p of Object.values(pages)) {
  if (!same(renderPage(resolvePage(p, types), lookup), orig.pages[p.id])) bad.push(p.id);
}

// write content
const outDir = path.join(ROOT, "content/pages");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const p of Object.values(pages)) fs.writeFileSync(path.join(outDir, `${p.id}.json`), JSON.stringify(p, null, 2) + "\n");

fs.mkdirSync(path.join(ROOT, "content/data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "content/data/types.json"), JSON.stringify(types, null, 2) + "\n");
writeData();

const tmpl = {};
for (const p of Object.values(pages)) tmpl[p.template] = (tmpl[p.template] || 0) + 1;
console.log("pages", Object.keys(pages).length, tmpl, "crumb overrides", crumbOverrides);
console.log("structured blocks", stats.blocks);
console.log("html blocks", stats.html);
console.log("round-trip mismatches", bad.length, bad.slice(0, 20).join(" "));
fs.writeFileSync(path.join(ROOT, "migration-report.json"), JSON.stringify({ bad, stats }, null, 2));

// ---------- data tables ----------
function writeData() {
  const D = (name, v) => fs.writeFileSync(path.join(ROOT, "content/data", name + ".json"), JSON.stringify(v, null, 2) + "\n");
  D("settings", {
    siteName: "Tzivos Hashem",
    tagline: "Commander’s Resources",
    legacyBase: "",
    previewLegacyBase: "",
    apiBase: "/resources/",
    requireLogin: true,
    loginRedirect: "/",
    defaultUser: { name: "R' Mendel Katz", role: "Field Marshal", initials: "MK" },
    calendarUrl: "/resources/calendar/dist/",
    newsFeedUrl: "/mobile/news/ajax/getPosts.php",
    newsPageUrl: "/mobile/news/",
  });
  D("nav", orig._b);
  D("images", orig.Xm);
  D("handwriting", orig.SL);
  const days = {};
  for (const [d, v] of Object.entries(orig.F6)) days[d] = { ...v, hd: orig.Z6[d], month: orig.X6[d] };
  D("calendar", { days, yomTov: orig.Q6, monthHeb: orig.Im, yomTovHeb: orig.fb });
  D("schedule", { weekly: orig.Rb, mivtzaOfMonth: orig.Pb, monthOrder: ["Tishrei", "Cheshvan", "Kislev", "Teves", "Shevat", "Adar I", "Adar II", "Nissan", "Iyar", "Sivan", "Tammuz", "Av", "Elul"], categories: orig.ay, categoryIcons: orig.iy, events: orig.Kb });
  D("older-pdfs", orig.hy);
  D("biur-tefillah", { pdfs: orig.OL, pageCounts: orig.UL });
  D("marking-tools", orig.Sm);
}
