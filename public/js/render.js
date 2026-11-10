// Shared page renderer: turns a page's JSON into the site's HTML.
// Used by the public site in the browser, by the admin preview, and by the
// build/check scripts in Node. It has no DOM dependency: it only builds strings.
//
// Text fields hold small HTML fragments (so entities, <em>, Hebrew spans etc.
// survive). Attribute values are escaped here.

export const COLORS = ["red", "blue", "cyan", "gold", "green", "orange", "teal", "purple", "navy"];

const att = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const h = (v) => (v == null ? "" : String(v));
const has = (v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
const cssColor = (c) => (!c ? "" : /^[a-z]+$/.test(c) ? `var(--${c})` : c);
const attrs = (o) =>
  Object.entries(o || {})
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${att(v)}"`))
    .join("");
const cls = (...parts) => parts.flat().filter(Boolean).join(" ");

const HISK_SVG =
  '<svg class="emb" viewBox="0 0 40 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5h28v20c0 9-6 15-14 18C12 40 6 34 6 25z"/><path d="M14 24a4 4 0 0 1 4-4h1a4 4 0 0 1 0 8h-1a4 4 0 0 1-4-4z"/><path d="M26 24a4 4 0 0 0-4-4h-1a4 4 0 0 0 0 8h1a4 4 0 0 0 4-4z"/><path d="M9 24H6M34 24h-3"/></svg>';

// ---------- breadcrumbs ----------

/** Walk parents to build the trail. lookup(id) returns {crumbLabel, parent, title}. */
export function trailFor(page, lookup, parentKey = "parent") {
  const trail = [];
  const seen = new Set([page.id]);
  let pid = page[parentKey];
  while (pid && pid !== "home" && !seen.has(pid)) {
    seen.add(pid);
    const p = lookup(pid);
    if (!p) break;
    trail.unshift({ id: pid, label: p.crumbLabel || p.title || pid });
    pid = p.parent;
  }
  return trail;
}

function crumbInner(page, lookup, alt) {
  const parentKey = alt ? "altParent" : "parent";
  const override = alt ? page.altCrumb : page.crumb;
  const parentId = page[parentKey];
  if (!parentId && !override) return "";
  const trail = override?.trail ?? trailFor(page, lookup, parentKey);
  const parent = parentId === "home" ? { crumbLabel: "Resources" } : lookup(parentId) || {};
  const backId = override?.back ?? parentId;
  const backLabel = override?.backLabel ?? (alt ? page.altBackLabel : page.backLabel) ?? parent.crumbLabel ?? parent.title ?? backId;
  const current = override?.current ?? page.crumbLabel ?? page.title;
  let s = `<button class="back" data-back="${att(backId)}">&#8592; Back<span class="bn"> to ${h(backLabel)}</span></button><span class="csep"></span><button data-go="home">Resources</button>`;
  for (const t of trail) s += `<span class="sep">›</span><button data-go="${att(t.id)}">${h(t.label)}</button>`;
  s += `<span class="sep">›</span><span>${h(current)}</span>`;
  return s;
}

// ---------- article (item) pages ----------

function renderArticle(p) {
  const a = p.article || {};
  let s = `<div class="item">`;
  s += `<div class="kick" style="margin-bottom:8px">${h(a.kick)}</div>`;
  s += `<div class="rw"><span class="ribbon c-${att(a.ribbonColor)} big">${h(a.ribbon)}</span></div>`;
  s += `<div class="titlerow">${has(a.hebbig) ? `<div class="hebbig" style="color:var(--muted);font-size:26px">${h(a.hebbig)}</div>` : ""}<h1${a.titleHeb ? ' class="heb"' : ""}>${h(p.title)}</h1>${has(a.subtitle) ? `<div class="sub">${h(a.subtitle)}</div>` : ""}</div>`;
  s += `<div class="metarow"><div class="meta">${(a.chips || []).map((c) => `<span class="chip">${h(c)}</span>`).join("")}</div>`;
  if (has(a.media)) s += `<div class="mediachips">${a.media.map((m) => `<a class="mediachip" href="${att(m.href)}" target="_blank" rel="noopener">${h(m.label)}</a>`).join("")}</div>`;
  s += `</div>`;
  const pages = a.pages || [];
  if (pages.length) {
    s += `<div class="pagerow">${pages
      .map((k, i) => `<figure class="pageimg"><img class="zoom" data-img="${att(k)}" alt="${att(a.altBase ?? stripTags(p.title))} — page ${i + 1}" loading="lazy"></figure>`)
      .join("")}</div>`;
  }
  if (pages.length || has(a.pdf) || has(a.olderPdfs)) {
    s += `<div class="imgbtns">`;
    if (pages.length) s += `<button class="imgbtn" data-full="${att(pages.join(","))}">Full Screen</button>`;
    if (has(a.pdf)) s += `<a class="imgbtn" href="${att(a.pdf)}" target="_blank" rel="noopener">${h(a.pdfLabel ?? "Print PDF")}</a>`;
    if (has(a.olderPdfs)) s += `<button class="imgbtn" data-older="${att(a.olderPdfs)}">Older PDFs</button>`;
    s += `</div>`;
  }
  if (has(a.sichos)) {
    s += `<div class="sichrow"><div class="sichlab">${h(a.sichosLabel ?? "Sichos this piece is built on")}</div><div class="imgbtns">${a.sichos
      .map((x) => `<a class="imgbtn" href="${att(x.href)}" target="_blank" rel="noopener">${h(x.label)}</a>`)
      .join("")}</div></div>`;
  }
  const lead = a.leadColor ?? a.ribbonColor;
  s += `<div class="prose"${lead ? ` style="--lead:${att(cssColor(lead))}"` : ""}>${h(a.body)}</div>`;
  if (a.related) s += renderRelated(a.related);
  s += `<div class="mission2" style="--c:${att(cssColor(a.missionColor ?? a.ribbonColor))}"><div class="m2-head"><span class="m2-emb"><span class="emb-img m2ck"></span></span><div><div class="m2-lab">Mission</div><div class="m2-text">${h(a.mission)}</div></div></div><div class="m2-foot"><span class="m2-hisk">${HISK_SVG}</span><button class="m2-mark" data-go="marking">Mark Missions →</button></div></div>`;
  s += `<div class="srcline${a.sample ? " sample" : ""}">${h(a.source)}</div>`;
  s += `</div>`;
  return s;
}

function renderRelated(r) {
  let s = `<div class="ordersub">`;
  s += r.headingEn != null
    ? `<div class="os-h os-h2"><span class="os-h-heb" dir="rtl" lang="yi">${h(r.headingHeb)}</span><span class="os-h-en">${h(r.headingEn)}</span></div>`
    : `<div class="os-h">${h(r.heading)}</div>`;
  s += `<div class="os-list">${(r.items || [])
    .map((it) => {
      const link = has(it.href) ? `href="${att(it.href)}" target="_blank" rel="noopener"` : `href="#" onclick="return false"`;
      return `<a class="os-item" ${link}><span class="os-ic">${h(it.icon)}</span><span><b>${h(it.title)}</b><span>${h(it.sub)}</span></span></a>`;
    })
    .join("")}</div>`;
  if (has(r.note)) s += `<div class="os-note">${h(r.note)}</div>`;
  return s + `</div>`;
}

export function stripTags(s) {
  return String(s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// ---------- cards ----------

export function renderCard(c) {
  if (c.variant === "empty") {
    return `<div class="${cls("card empty-card", c.extraClass)}"${attrs(c.attrs)}><div class="rw"><span class="ribbon c-${att(c.ribbonColor)}">${h(c.ribbon)}</span></div><div class="in"><div class="kick">${h(c.kick)}</div><h4>${h(c.heading)}</h4><p${has(c.textStyle) ? ` style="${att(c.textStyle)}"` : ""}>${h(c.text)}</p><div class="foot"><span class="pill">${h(c.pill)}</span><span class="go"${has(c.goStyle) ? ` style="${att(c.goStyle)}"` : ""}>${h(c.go)}</span></div></div></div>`;
  }
  const a = {};
  if (has(c.page)) a["data-go"] = c.page;
  Object.assign(a, c.attrs);
  if (has(c.color)) a.style = `--cc:${cssColor(c.color)}`;
  let s = `<button class="${cls("card", c.extraClass)}"${attrs(a)}><div class="ctop"></div>`;
  if (has(c.img)) s += `<img class="${c.imgZoom === false ? "cardimg" : "cardimg zoom"}" data-img="${att(c.img)}" alt="" loading="lazy">`;
  s += `<div class="in"><div class="kick">${h(c.kick)}</div><div class="rw" style="padding-left:0"><span class="ribbon c-${att(c.ribbonColor)}">${h(c.ribbon)}</span></div>`;
  const emb = has(c.icon) ? `<img class="emb-img" alt="" src="${att(c.icon)}">` : `<span class="emb-img m2ck"></span>`;
  s += `<div class="msn"><span class="msn-emb">${emb}</span><span class="msn-body"><b>${h(c.missionLabel ?? "Mission")}</b>${h(c.mission)}</span></div>`;
  s += `<div class="foot"><span class="go"${has(c.goStyle) ? ` style="${att(c.goStyle)}"` : ""}>${h(c.go ?? "Open →")}</span></div></div></button>`;
  return s;
}

// ---------- hub blocks ----------

const blockRenderers = {
  html: (b) => h(b.html),
  heading: (b) =>
    `<div class="sec-h"><div class="eyebrow">${h(b.eyebrow)}</div><h2${b.heb ? ' class="heb-h2"' : ""}>${h(b.title)}</h2>${b.text != null ? `<p>${h(b.text)}</p>` : ""}</div>`,
  label: (b) => `<div class="${cls("sh", b.heb && "heb-sh", b.spaced && "mt")}"${attrs(b.attrs)}>${h(b.text)}</div>`,
  note: (b) => `<div class="note"${attrs(b.attrs)}>${h(b.html)}</div>`,
  hachayolbar: (b) =>
    `<a class="hachayolbar" href="${att(b.href)}" target="_blank" rel="noopener" title="Open the printable Hachayol magazine PDF"><span class="hb-l">${h(b.label ?? "Hachayol")}</span><span class="hb-i">${h(b.info)}</span><span class="hb-a">${h(b.action ?? "Printable PDF &#8599;")}</span></a>`,
  cards: (b) => `<div class="${cls("cards", b.extraClass)}"${attrs(b.attrs)}>${(b.items || []).map(renderCard).join("")}</div>`,
  links: (b) =>
    `<div class="${cls("subgrid", b.rtl && "rtl")}"${attrs(b.attrs)}>${(b.items || [])
      .map((it) => {
        const tag = it.static ? "div" : "button";
        const a = {};
        if (it.page) a["data-go"] = it.page;
        if (it.sched) a["data-sch"] = it.sched;
        Object.assign(a, it.attrs);
        return `<${tag} class="${cls("sc", it.extraClass, it.static && "flat")}"${attrs(a)}>${it.badge ? `<span class="now-badge">${h(it.badge)}</span>` : ""}<b>${h(it.title)}</b><span>${h(it.text)}</span></${tag}>`;
      })
      .join("")}</div>`,
};

blockRenderers.tabs = (b) =>
  `<div class="mvtabs">${(b.items || []).map((t) => `<button class="mvtab${t.on ? " on" : ""}" data-mvtab="${att(t.panel)}">${h(t.label)}</button>`).join("")}</div>`;
blockRenderers.filters = (b) => {
  const key = b.mode === "mv" ? "data-mv" : "data-hk";
  const lab = has(b.label) ? `<span style="align-self:center;font-size:12px;color:var(--muted);margin:0 6px 0 2px">${h(b.label)}</span>` : "";
  return `<div class="mvtogbar">${lab}${(b.items || [])
    .map((t) => `<button class="mvtog${b.mode === "mv" ? "" : " hktog"}" ${key}="${att(t.key)}" aria-pressed="${t.pressed ? "true" : "false"}"><i></i>${h(t.label)}</button>`)
    .join("")}</div>`;
};
blockRenderers.gallery = (b) => {
  const imgs = b.images || [];
  let s = `<div class="${cls("mvgrid", b.hidden && "off")}"${b.panel ? ` id="${att(b.panel)}"` : ""}>`;
  s += `<div class="pagerow">${imgs.map((i) => `<figure class="pageimg"><img class="zoom" data-img="${att(i.img)}" alt="${att(i.alt)}" loading="lazy"></figure>`).join("")}</div>`;
  s += `<div class="imgbtns">${imgs.length ? `<button class="imgbtn" data-full="${att(imgs.map((i) => i.img).join(","))}">Full Screen</button>` : ""}${has(b.pdf) ? `<a class="imgbtn" href="${att(b.pdf)}" target="_blank" rel="noopener">${h(b.pdfLabel ?? "Print PDF")}</a>` : ""}</div>`;
  return s + `</div>`;
};

blockRenderers.tiles = (b) =>
  `<div class="tiles">${(b.items || [])
    .map((t) => `<button class="tile" data-go="${att(t.page)}" style="--c:${att(cssColor(t.color))}"><div class="top"></div><div class="in"><div class="sub">${h(t.kicker)}</div><h3>${h(t.title)}</h3><p>${h(t.text)}</p></div></button>`)
    .join("")}</div>`;
blockRenderers.branches = (b) =>
  `<div class="campgrid">${(b.items || [])
    .map((t) => `<button class="campcard" data-go="${att(t.page)}" style="--c:${att(cssColor(t.color))}"><span class="cc-emb"><img class="emb-img" alt="" src="${att(t.icon)}"></span><span class="cc-body"><span class="cc-name">${h(t.title)}</span><span class="cc-desc">${h(t.text)}</span></span></button>`)
    .join("")}</div>`;
blockRenderers.dates = (b) =>
  `<div class="rgrid">${(b.items || [])
    .map((t) => `<button class="rc${t.suggested ? " sug" : ""}" data-go="${att(t.page)}"><b>${h(t.title)}</b><span>${h(t.text)}</span>${t.suggested ? '<span class="sg">suggested</span>' : ""}</button>`)
    .join("")}</div>`;

export const BLOCK_TYPES = Object.keys(blockRenderers);

export function renderBlock(b) {
  const r = blockRenderers[b.type];
  return r ? r(b) : "";
}

// ---------- page types ----------

/** Fields an article may inherit from its type's defaults. */
export const INHERITED = ["kick", "ribbon", "ribbonColor", "mission"];

/** Fill a page's empty fields from its type's defaults (types = {id: type}). */
export function resolvePage(page, types) {
  const t = types && types[page.type];
  if (!t || page.template !== "article" || !t.defaults) return page;
  const a = { ...(page.article || {}) };
  for (const k of INHERITED) if (a[k] == null && t.defaults[k] != null) a[k] = t.defaults[k];
  return { ...page, article: a };
}

// ---------- whole page ----------

/**
 * page: page JSON. lookup(id): summary of another page (crumbLabel, parent, title).
 * Returns the <section class="page"> HTML the runtime injects.
 */
export function renderPage(page, lookup) {
  const crumb = page.id === "home" ? "" : crumbInner(page, lookup, false);
  let s = `<section class="page" data-page="${att(page.id)}"><div class="crumb"><div class="wrap">${crumb}</div></div>`;
  if (page.template === "article") {
    s += `<div class="sec"><div class="wrap">${renderArticle(page)}</div></div>`;
  } else if (page.sections) {
    // free layout (home): each section is raw HTML or a .sec with blocks
    for (const sec of page.sections) {
      if (sec.html != null) s += sec.html;
      else s += `<div class="${cls("sec", sec.alt && "alt")}"><div class="wrap">${(sec.blocks || []).map(renderBlock).join("")}</div></div>`;
    }
  } else {
    s += `<div class="sec"><div class="wrap">${(page.blocks || []).map(renderBlock).join("")}</div></div>`;
  }
  if (page.altParent) {
    s += `<template class="altcrumb" data-branch="${att(page.altBranch || "campaign")}">${crumbInner(page, lookup, true)}</template>`;
  }
  return s + `</section>`;
}
