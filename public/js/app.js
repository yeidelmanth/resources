// Tzivos Hashem Commander's Resources: public site runtime.
// Loads content/site.json once and fetches each page's JSON when it is opened,
// renders it with render.js, and wires up the interactive pieces (lightbox,
// tabs and filters, schedule pop-ups, search, live embeds, promotions, Chitas).
import { renderPage, resolvePage } from "./render.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CONTENT = window.TH_CONTENT_BASE || "content/";
let SITE = null; // site.json
let USER = null;
const pageCache = new Map();
let fromBranch = null; // branch of the page the user navigated from (drives the alternate breadcrumb)

// ---------- URLs ----------
// Mixed file storage: new uploads live under uploads/ next to the site; everything
// else is a legacy path on the original server. If settings.legacyBase is set
// (site hosted elsewhere), legacy paths are pointed back at the original server.
function assetUrl(u) {
  if (!u || /^(https?:|data:|blob:|mailto:|tel:|#|javascript:)/i.test(u) || /^uploads\//.test(u)) return u;
  const base = SITE.settings.legacyBase;
  if (!base) return u;
  const origin = new URL(base, location.href).origin;
  return u.startsWith("/") ? origin + u : new URL(u, base).href;
}
const api = (p) => assetUrl(SITE.settings.apiBase.replace(/\/?$/, "/") + p.replace(/^\//, ""));
const img = (key) => {
  const u = SITE.images[key];
  return u ? assetUrl(u) : null;
};

function rewriteLinks(root) {
  $$("a[href]", root).forEach((a) => {
    const h = a.getAttribute("href");
    const n = assetUrl(h);
    if (n !== h) a.setAttribute("href", n);
  });
  $$("img[src]", root).forEach((i) => {
    const s = i.getAttribute("src");
    const n = assetUrl(s);
    if (n !== s) i.setAttribute("src", n);
  });
}

// ---------- calendar helpers (week, month, yom tov) ----------
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekInfo() {
  const cal = SITE.calendar;
  const now = new Date();
  const sat = new Date(now);
  sat.setDate(sat.getDate() + ((6 - now.getDay() + 7) % 7));
  const today = cal.days[iso(now)];
  const week = cal.days[iso(sat)] || today;
  let yomTov = null;
  const d = new Date(now);
  for (let i = 0; i <= 7; i++) {
    const y = cal.yomTov[iso(d)];
    if (y) {
      yomTov = { nm: y.nm, sl: y.sl, heb: cal.yomTovHeb[y.nm] ?? y.nm };
      break;
    }
    d.setDate(d.getDate() + 1);
  }
  return { today, week, pe: week?.pe ?? "", ph: week?.ph ?? "", sl: week?.sl ?? "dParsha", hdheb: today?.hdheb ?? "", yomTov };
}
function monthNow() {
  const m = SITE.calendar.days[iso(new Date())]?.month;
  return m ? { key: m, heb: SITE.calendar.monthHeb[m] ?? m } : null;
}

function applyWeek(root) {
  const w = weekInfo();
  const name = w.yomTov ? w.yomTov.nm : w.pe;
  const heb = w.yomTov ? "" : w.ph;
  const slug = w.yomTov ? w.yomTov.sl : w.sl;
  const wkHeb = $("#wkHeb", root), wkParsha = $("#wkParsha", root), wkDate = $("#wkDateHeb", root), wkBtn = $("#wkBtn", root);
  if (wkHeb) w.yomTov ? (wkHeb.textContent = w.yomTov.heb || name) : heb && (wkHeb.textContent = `פָּרָשַׁת ${heb}`);
  if (name && wkParsha) wkParsha.textContent = w.yomTov ? name : `Parshas ${name}`;
  if (w.hdheb && wkDate) wkDate.textContent = w.hdheb;
  if (slug) [wkParsha, wkBtn].forEach((b) => b && b.setAttribute("data-go", slug));
  const ch = $("#chChumash", root);
  if (ch) ch.textContent = `${name || "This week"} — the day’s aliyah`;
  const m = monthNow();
  if (m) {
    const pm = $("#promoMonth", root);
    if (pm) pm.textContent = `This month · ${m.heb}`;
    markNow(root, '[data-page="dMonth"]', `[data-nk="${m.key}"]`, "This month");
  }
  if (slug && slug.startsWith("dp") && slug !== "dParsha") markNow(root, '[data-page="dParsha"]', `[data-go="${slug}"]`, "This week");
  const hd = SITE.calendar.days[iso(new Date())]?.hd;
  if (hd) {
    $$(".cal .d.today", root).forEach((d) => {
      d.classList.remove("today");
      $(".today-badge", d)?.remove();
    });
    $$(`.cal [data-hd="${hd}"]`, root).forEach((d) => {
      d.classList.add("today");
      d.insertAdjacentHTML("afterbegin", '<span class="today-badge">Today</span>');
    });
  }
}
function markNow(root, pageSel, itemSel, label) {
  const p = $(pageSel, root);
  if (!p) return;
  $$(".now-badge", p).forEach((b) => {
    b.closest(".sc")?.classList.remove("hasnow");
    b.remove();
  });
  const it = $(itemSel, p);
  if (it) {
    it.classList.add("hasnow");
    it.insertAdjacentHTML("afterbegin", `<span class="now-badge">${label}</span>`);
  }
}

// ---------- header, search, branch bar ----------
function initials(n) {
  return (n || "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function renderHeader() {
  const s = SITE.settings;
  const u = USER || s.defaultUser || {};
  const w = weekInfo();
  $("#hdr").innerHTML = `
<div class="topbar"><div class="wrap"><span class="r">${w.pe ? `Parshas ${esc(w.pe)}` : ""}</span></div></div>
<header class="mast"><div class="wrap">
  <button class="brand" data-nav="home"><span class="logo"></span><span><b>${esc(s.siteName)}</b><span>${esc(s.tagline)}</span></span></button>
  <div class="search" id="siteSearch"><span>⚲</span><input type="search" placeholder="Search the library…" aria-label="Search the library" autocomplete="off"><div class="srchpanel" id="srchPanel"></div></div>
  <span class="spacer"></span>
  <button class="me" data-nav="marking"><span class="av">${esc(u.initials || initials(u.name) || "MK")}</span><span><b>${esc(u.name || "")}</b><span>${esc(u.role || "")}</span></span></button>
</div></header>
<nav class="branchbar" aria-label="Branches"><div class="wrap">${SITE.nav.map((b) => `<button class="bl" data-branch="${esc(b.id)}" data-nav="${esc(b.id)}">${esc(b.label)}</button>`).join("")}</div></nav>`;
  initSearch();
}
function setActiveBranch(b) {
  $$(".branchbar .bl").forEach((x) => (x.getAttribute("data-branch") === b ? x.setAttribute("aria-current", "true") : x.removeAttribute("aria-current")));
}

// search: same normalisation and fuzzy matching as the original site
const norm = (s) =>
  String(s).toLowerCase().replace(/[֑-ׇ]/g, "").replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ").replace(/[^a-z0-9א-ת ]+/g, " ").replace(/\s+/g, " ").trim();
function lev(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = [...Array(b.length + 1).keys()], cur = [];
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
const fuzzy = (w, words) => {
  const tol = w.length <= 4 ? 1 : 2;
  return words.some((x) => x.indexOf(w) === 0 || (Math.abs(x.length - w.length) <= tol && lev(w, x) <= tol));
};
let searchIndex = null;
function searchEntries() {
  if (!searchIndex)
    searchIndex = Object.entries(SITE.index)
      .filter(([id, p]) => id !== "home" && p.t)
      .map(([id, p]) => {
        const t = norm(p.t), all = norm(`${p.t} ${p.k || ""} ${p.x || ""}`);
        return { id, title: p.t, kicker: p.k, t, all, tt: t.split(" ").filter(Boolean), at: all.split(" ").filter(Boolean) };
      });
  return searchIndex;
}
function search(q) {
  const n = norm(q);
  if (n.length < 2) return [];
  const words = n.split(" ").filter(Boolean);
  const hits = [];
  for (const e of searchEntries()) {
    let s = -1;
    if (e.t.indexOf(n) === 0) s = 0;
    else if (e.t.indexOf(n) > -1) s = 1;
    else if (e.all.indexOf(n) > -1) s = 2;
    else if (words.every((w) => fuzzy(w, e.tt))) s = 3;
    else if (words.every((w) => fuzzy(w, e.at))) s = 4;
    if (s > -1) hits.push([s, e.title.length, e]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 20).map((x) => x[2]);
}
function initSearch() {
  const box = $("#siteSearch"), input = $("input", box), panel = $("#srchPanel");
  const close = () => panel.classList.remove("open");
  const update = () => {
    const q = input.value;
    if (norm(q).length < 2) return close();
    const r = search(q);
    panel.innerHTML = r.length
      ? r.map((e) => `<button class="sr" data-go="${esc(e.id)}"><b>${esc(e.title)}</b><span>${esc(e.kicker || "")}</span></button>`).join("")
      : `<div class="sr-none">No matches</div>`;
    panel.classList.add("open");
  };
  input.addEventListener("input", update);
  input.addEventListener("focus", update);
  input.addEventListener("keydown", (e) => e.key === "Escape" && close());
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    input.value = "";
    close();
    navigate(b.getAttribute("data-go"), { fromNav: true });
  });
  document.addEventListener("click", (e) => !box.contains(e.target) && close());
}

// ---------- routing ----------
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, "")) || "home";
  const [id, qs] = raw.split("?");
  return { id: id || "home", query: new URLSearchParams(qs || "") };
}
let navIdx = history.state?.idx ?? 0;
function navigate(target, { replace = false, fromNav = false } = {}) {
  if (fromNav) fromBranch = null;
  const url = `#/${target}`;
  if (replace) history.replaceState({ idx: navIdx }, "", url);
  else history.pushState({ idx: ++navIdx }, "", url);
  route();
}
function navigateBack(target) {
  if ((history.state?.idx ?? 0) > 0) history.back();
  else navigate(target, { replace: true });
}
window.addEventListener("popstate", (e) => {
  navIdx = e.state?.idx ?? 0;
  route();
});

const BUILTIN = { marking: renderMarking, calendar: renderCalendar };

async function loadPage(id) {
  if (pageCache.has(id)) return pageCache.get(id);
  const r = await fetch(`${CONTENT}pages/${encodeURIComponent(id)}.json`, { cache: "no-cache" });
  if (!r.ok) return null;
  const p = await r.json();
  pageCache.set(id, p);
  return p;
}
const lookup = (id) => SITE.index[id];

async function route() {
  const { id, query } = parseHash();
  const app = $("#app");
  window.scrollTo(0, 0);
  if (BUILTIN[id]) {
    setActiveBranch(id);
    BUILTIN[id](app, query);
    document.title = `${SITE.settings.siteName} · ${id === "marking" ? "Mission Marking" : "Calendar"}`;
    return;
  }
  if (!SITE.index[id]) return navigate("home", { replace: true });
  const meta = SITE.index[id];
  const alt = meta.altParent && fromBranch === meta.altBranch;
  setActiveBranch(alt ? meta.altBranch : meta.branch);
  app.innerHTML = `<section class="page on"><div class="sec"><div class="wrap"><p class="loading-note" role="status" aria-live="polite">Loading…</p></div></div></section>`;
  const page = await loadPage(id);
  if (parseHash().id !== id) return; // user moved on
  if (!page) {
    app.innerHTML = `<section class="page on"><div class="sec"><div class="wrap"><div class="empty"><h3>Page not found</h3><p>This page could not be loaded.</p></div></div></div></section>`;
    return;
  }
  app.innerHTML = renderPage(resolvePage(page, SITE.types), lookup).replace('class="page"', 'class="page on"');
  const root = app.firstElementChild;
  fillImages(root);
  applyWeek(root);
  if (alt) {
    const t = $("template.altcrumb", root), w = $(".crumb .wrap", root);
    if (t && w) w.innerHTML = t.innerHTML + ($(".pdfbtn", w)?.outerHTML || "");
  }
  hideUnpublishedLinks(root);
  rewriteLinks(root);
  if (id === "promotions") mountLive(root, ["#promoMonth", "table.tbl"], renderPromotions);
  if (id === "chitas") mountLive(root, ["#chFeed"], renderChitas);
  const hd = $("h1,h2", root);
  document.title = `${SITE.settings.siteName} · ${hd ? hd.textContent.trim() : "Resources"}`;
}

// a card or link to a page that isn't published (a draft) is left out
function hideUnpublishedLinks(root) {
  $$("[data-go]", root).forEach((el) => {
    const id = el.getAttribute("data-go").split("?")[0];
    if (SITE.index[id] || BUILTIN[id] || id === "home") return;
    if (el.matches(".card, .sc, .tile, .campcard, .rc")) el.remove();
  });
}

function fillImages(root) {
  $$("[data-img]", root).forEach((el) => {
    if (el.tagName !== "IMG") return;
    const u = img(el.getAttribute("data-img"));
    u ? (el.src = u) : el.remove();
  });
  $$("[data-hw]", root).forEach((el) => {
    const u = SITE.handwriting[el.getAttribute("data-hw")];
    u ? (el.src = assetUrl(u)) : el.closest(".handimg")?.remove();
  });
  $$("[data-np]", root).forEach((el) => el.closest(".nigpanel")?.remove());
}

function mountLive(root, sels, fn) {
  const els = sels.map((s) => $(s, root)).filter(Boolean);
  if (!els.length) return;
  const box = document.createElement("div");
  box.className = "live-region";
  els[0].parentNode.insertBefore(box, els[0]);
  els.forEach((e) => e.remove());
  fn(box);
}

// ---------- clicks inside pages ----------
const notIn = (list, key) => key !== "*" && (list || "").split(" ").indexOf(key) < 0;
function onPageClick(e) {
  const t = e.target;
  const app = $("#app");
  const scope = (el) => el.closest(".wrap") || app;
  let el;
  if ((el = t.closest(".schbtn")) && el.getAttribute("data-sch")) return e.preventDefault(), openSched(el.getAttribute("data-sch"));
  if ((el = t.closest("[data-older]"))) return e.preventDefault(), openOlder(el.getAttribute("data-older"));
  if ((el = t.closest(".cattog"))) {
    e.preventDefault();
    const c = el.getAttribute("data-cat");
    if (c) {
      const on = document.documentElement.classList.toggle(`on-${c}`);
      $$(`.cattog[data-cat="${c}"]`).forEach((b) => b.setAttribute("aria-pressed", on ? "true" : "false"));
    }
    return;
  }
  if ((el = t.closest(".hktog"))) {
    e.preventDefault();
    const w = scope(el), key = el.getAttribute("data-hk") || "";
    $$(".hktog", w).forEach((b) => b.setAttribute("aria-pressed", b === el ? "true" : "false"));
    $$(".hkcard", w).forEach((c) => c.classList.toggle("mvhide", notIn(c.getAttribute("data-hk"), key)));
    return;
  }
  if ((el = t.closest(".mvtab"))) {
    e.preventDefault();
    const w = scope(el);
    $$(".mvtog", w).forEach((b) => b.setAttribute("aria-pressed", "false"));
    $$(".mvcard", w).forEach((c) => c.classList.remove("mvhide"));
    $$(".mvtab", w).forEach((b) => b.classList.toggle("on", b === el));
    const id = el.getAttribute("data-mvtab");
    $$(".mvgrid", w).forEach((g) => g.classList.toggle("off", g.id !== id));
    return;
  }
  if ((el = t.closest(".mvtog"))) {
    e.preventDefault();
    const w = scope(el), was = el.getAttribute("aria-pressed") === "true";
    $$(".mvtog", w).forEach((b) => b.setAttribute("aria-pressed", "false"));
    if (was) {
      $$(".mvcard", w).forEach((c) => c.classList.remove("mvhide"));
      const on = $(".mvtab.on", w)?.getAttribute("data-mvtab") ?? null;
      $$(".mvgrid", w).forEach((g) => g.classList.toggle("off", on !== null && g.id !== on));
    } else {
      el.setAttribute("aria-pressed", "true");
      const k = el.getAttribute("data-mv");
      $$(".mvgrid", w).forEach((g) => g.classList.remove("off"));
      $$(".mvcard", w).forEach((c) => c.classList.toggle("mvhide", c.getAttribute("data-mv") !== k));
    }
    return;
  }
  if ((el = t.closest(".yjbtn,.chumjump"))) {
    const id = el.getAttribute("data-jump") ?? el.getAttribute("data-cj");
    const target = id ? document.getElementById(id) : null;
    if (target) e.preventDefault(), target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if ((el = t.closest("img.zoom"))) {
    e.preventDefault();
    e.stopPropagation();
    const row = el.closest(".pagerow");
    return openLightbox(row ? $$("img.zoom", row).map((i) => i.getAttribute("data-img")).filter(Boolean).join(",") : el.getAttribute("data-img"));
  }
  if ((el = t.closest("[data-full]"))) return e.preventDefault(), e.stopPropagation(), openLightbox(el.getAttribute("data-full"));
  if ((el = t.closest("[data-tefview]"))) {
    e.preventDefault();
    const k = el.getAttribute("data-tefview"), n = SITE.biurTefillah.pageCounts[k] || 0;
    const ids = [];
    for (let i = 1; i <= n; i++) ids.push(`tefp_${k}_${pad(i)}`);
    return ids.length && openLightbox(ids.join(","));
  }
  if ((el = t.closest("[data-tefpdf]"))) {
    e.preventDefault();
    const u = SITE.biurTefillah.pdfs[el.getAttribute("data-tefpdf")];
    return u && window.open(assetUrl(u), "_blank", "noopener");
  }
  if ((el = t.closest("[data-back]"))) return e.preventDefault(), navigateBack(el.getAttribute("data-back"));
  if ((el = t.closest(".tp-lb"))) return e.preventDefault(), openLightbox(el.getAttribute("data-lb"));
  if ((el = t.closest("[data-go]"))) {
    e.preventDefault();
    const cur = parseHash().id;
    fromBranch = SITE.index[cur]?.branch ?? cur;
    return navigate(el.getAttribute("data-go"));
  }
}

// ---------- lightbox ----------
let lbIds = [];
function openLightbox(list) {
  const ids = String(list || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.some((k) => SITE.images[k])) return;
  lbIds = ids;
  const lb = $("#lb"), sp = $("#lbspread");
  sp.className = ids.length > 2 ? "lbspread many" : ids.length > 1 ? "lbspread two" : "lbspread";
  sp.innerHTML = ids.map((k) => (img(k) ? `<img src="${esc(img(k))}" alt="">` : "")).join("");
  lb.classList.add("on");
  sp.scrollTop = 0;
  lb.requestFullscreen?.().catch(() => {});
}
function closeLightbox() {
  $("#lb").classList.remove("on");
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
function toast(msg) {
  const t = $("#lbtoast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 6000);
}
function download(files) {
  files.forEach((f) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1500);
  });
}
function copyImage(src) {
  if (!src || !(navigator.clipboard && window.ClipboardItem && navigator.clipboard.write)) return Promise.reject(new Error("noclip"));
  const png = new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      c.getContext("2d").drawImage(im, 0, 0);
      c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/png");
    };
    im.onerror = () => rej(new Error("img"));
    im.src = src;
  });
  return navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
async function shareWhatsApp() {
  const ids = lbIds;
  const issue = (/^i(\d+)sect/.exec(ids[0] || "") || [])[1] || "";
  const urls = ids.map(img).filter(Boolean);
  if (!urls.length) return;
  let files;
  try {
    files = await Promise.all(
      urls.map(async (u, i) => {
        const b = await (await fetch(u)).blob();
        return new File([b], `Hachayol-${issue || "page"}-p${i + 1}.jpg`, { type: b.type || "image/jpeg" });
      })
    );
  } catch {
    return;
  }
  const fallback = async () => {
    const key = navigator.platform && navigator.platform.indexOf("Mac") >= 0 ? "⌘" : "Ctrl";
    window.open("https://web.whatsapp.com/", "_blank", "noopener");
    try {
      await copyImage(urls[0]);
      toast(`Picture copied — in WhatsApp, open your chat and press ${key}+V to paste it` + (files.length > 1 ? " (page 1; use the other pages from your downloads)" : "") + ".");
      if (files.length > 1) download(files.slice(1));
    } catch {
      download(files);
      toast("Picture saved to your downloads — drag it into your WhatsApp chat.");
    }
  };
  if (navigator.share) {
    try {
      await navigator.share({ files, title: issue ? `Hachayol #${issue}` : "Hachayol" });
    } catch (err) {
      if (err?.name !== "AbortError") await fallback();
    }
    return;
  }
  await fallback();
}

// ---------- schedule / older-PDF pop-up ----------
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function openSched(kind) {
  const S = SITE.schedule;
  let title, rows;
  if (kind === "weekly") {
    title = "Weekly Workflow";
    rows = S.weekly.map(([a, c]) => ({ a, c }));
  } else if (kind === "mivtza") {
    title = "Mivtza of the Month";
    rows = S.monthOrder.filter((m) => S.mivtzaOfMonth[m]).map((m) => ({ a: SITE.calendar.monthHeb[m] || m, c: S.mivtzaOfMonth[m] }));
  } else {
    title = S.categories[kind] || kind;
    rows = S.events
      .filter((e) => e.cat === kind)
      .sort((x, y) => (x.iso < y.iso ? -1 : 1))
      .map((e) => {
        const [Y, M, D] = e.iso.split("-").map(Number);
        const i = e.hd.lastIndexOf("-");
        return { a: `${DAY[new Date(Y, M - 1, D).getDay()]} ${MON[M - 1]} ${D}, ${Y}`, b: `${e.hd.slice(i + 1)} ${e.hd.slice(0, i)}`, c: e.label };
      });
  }
  const emb = kind !== "weekly" && kind !== "mivtza" ? S.categoryIcons[kind] : null;
  $("#schtitle").innerHTML = (emb ? `<img class="schemb" src="${esc(assetUrl(emb))}" alt="">` : "") + esc(title);
  $("#schlist").innerHTML = rows.length
    ? rows.map((r) => `<div class="schrow"><div class="schd"><b>${esc(r.a)}</b>${r.b ? `<span>${esc(r.b)}</span>` : ""}</div><div class="schc">${esc(r.c)}</div></div>`).join("")
    : `<p class="schempty">Nothing scheduled.</p>`;
  showModal();
}
function openOlder(issue) {
  const rows = SITE.olderPdfs[issue] || [];
  $("#schtitle").textContent = "Older-Year PDFs";
  $("#schlist").innerHTML = rows.length
    ? rows.map(([label, href]) => `<div class="schrow"><a class="schc" href="${esc(assetUrl(href))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a></div>`).join("")
    : `<p class="schempty">None.</p>`;
  showModal();
}
function showModal() {
  $("#schmodal").classList.add("on");
  $("#schlist").scrollTop = 0;
}
const hideModal = () => $("#schmodal").classList.remove("on");

// ---------- promotions & chitas (live data from the original server) ----------
async function renderPromotions(box) {
  let rows = null, msg = null, month = "This month", sortKey = null, dir = 1;
  const draw = () => {
    const sorted = rows && sortKey
      ? rows.slice().sort((a, b) => {
          const p = a[sortKey], q = b[sortKey];
          const c = typeof p == "number" || typeof q == "number" ? (Number(p) || 0) - (Number(q) || 0) : String(p || "").localeCompare(String(q || ""));
          return (c || String(a.name || "").localeCompare(String(b.name || ""))) * dir;
        })
      : rows || [];
    const th = (k, l) => `<th data-sort="${k}" scope="col"${sortKey === k ? ` aria-sort="${dir > 0 ? "ascending" : "descending"}"` : ""}>${l}<span class="so">${sortKey === k ? (dir > 0 ? "▲" : "▼") : ""}</span></th>`;
    box.innerHTML = `<div class="sh" id="promoMonth">${esc(month)}</div><table class="tbl"><thead><tr>${th("sort_name", "Soldier")}${th("was_ord", "Was")}${th("now_ord", "Now")}${th("when_jd", "When")}</tr></thead><tbody id="promoRows">${
      rows === null ? `<tr><td colspan="4">Loading this month’s promotions…</td></tr>`
      : msg && !rows.length ? `<tr><td colspan="4">${esc(msg)}</td></tr>`
      : sorted.map((r) => `<tr><td>${esc(r.name)}</td><td class="rk">${esc(r.was || "—")}</td><td class="rk">${esc(r.now)}</td><td>${esc(r.when)}</td></tr>`).join("")
    }</tbody></table>`;
  };
  box.addEventListener("click", (e) => {
    const k = e.target.closest("th[data-sort]")?.getAttribute("data-sort");
    if (!k) return;
    dir = k === sortKey ? -dir : 1;
    sortKey = k;
    draw();
  });
  draw();
  try {
    const r = await fetch(api("promotions.php"), { credentials: "include" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || "failed");
    const d = j.data || { month: {}, promotions: [] };
    if (d.month?.he) month = `This month · ${d.month.he}`;
    rows = d.promotions || [];
    if (!rows.length) msg = `No promotions yet this month${d.month?.en ? ` — ${d.month.en}` : ""}.`;
  } catch {
    rows = [];
    msg = "Couldn’t load this month’s promotions — try again in a moment.";
  }
  draw();
}
async function renderChitas(box) {
  const note = (b, rest) => `<div class="chfeed" id="chFeed"><div class="note" id="chFeedMsg"><b>${b}</b>${rest}</div></div>`;
  box.innerHTML = note("Loading", "Pulling today’s Chitas from the news feed…");
  try {
    const r = await fetch(assetUrl(SITE.settings.newsFeedUrl), { method: "POST", credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "page=1&limit=1" });
    if (!r.ok) throw new Error(r.status);
    const posts = ((JSON.parse(await r.text()) || {}).data || []).slice(0, 1);
    if (!posts.length) return (box.innerHTML = note("Nothing posted yet", "The feed has no posts right now."));
    const p = posts[0];
    const m = String(p.posted || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
    box.innerHTML = `<div class="chfeed" id="chFeed"><div class="chfeed-list" id="chFeedList"><article class="chpost"><h3>${esc(p.title)}</h3>${date ? `<span class="chdate">${esc(date)}</span>` : ""}<div class="chbody">${String(p.content || "").replace(/http:\/\//g, "https://")}</div></article></div></div>`;
    const body = $(".chbody", box);
    if (body.scrollHeight > body.clientHeight + 4) {
      body.classList.add("open");
      const more = document.createElement("button");
      more.type = "button";
      more.className = "chmore";
      more.textContent = "Show less";
      more.onclick = () => (more.textContent = body.classList.toggle("open") ? "Show less" : "Show more");
      body.after(more);
    }
  } catch {
    box.innerHTML = note("Couldn’t load", `The feed didn’t answer — <a href="${esc(assetUrl(SITE.settings.newsPageUrl))}" target="_blank" rel="noopener">open the news page</a> instead.`);
  }
}

// ---------- embedded tools (Mission Marking, Calendar) ----------
const CRUMB = (label) =>
  `<div class="crumb"><div class="wrap"><button class="back" data-back="home">&#8592; Back<span class="bn"> to Resources</span></button><span class="csep"></span><button data-go="home">Resources</button><span class="sep">›</span><span>${esc(label)}</span></div></div>`;
const MARKING_CSS = `#mashpia-navbar,#sidebar{display:none!important}html,body{height:auto!important;overflow:hidden!important}#dashboard-body{height:auto!important;min-height:0!important}#dashboard-content{padding:10px 14px!important}.Label>.row:not(.Task),.Grid thead th,.modal-header{background:#14265C!important;border-bottom-color:#14265C!important}.Grid tr.Grid-row:first-child td{border-color:#14265C!important}.Grid th,.Grid td{border-color:#D3DAE8!important}.th-callout.alert-primary{background-color:#EDF0F6!important;border-color:#D3DAE8!important}.th-callout.alert-primary i,.th-callout.alert-primary h4{color:#14265C!important}.btn-primary{background-color:#14265C!important;border-color:#14265C!important}.btn-primary:hover,.btn-primary:focus,.btn-primary:active{background-color:#1B4FD8!important;border-color:#1B4FD8!important}.form-control:focus,.mark-cell.waiting>.form-control{border-color:#1B4FD8!important}.mark-cell-waiting,.mark-cell-spinner{color:#1B4FD8!important}.ReactTable .rt-th.rt-resizable-header:not(.-cursor-pointer){color:#14265C!important}.ReactTable .selected-row{background-color:#EDF0F6!important}.nav-tabs{border-color:#14265C!important}.nav-tabs a.active.nav-link{background-color:#14265C!important;border-color:#14265C!important;color:#fff!important}.nav-tabs .nav-link:not(.disabled):not(.active):hover{color:#1B4FD8!important}.tab-content{border-color:#14265C!important}p.title{border-bottom-color:#14265C!important}a{color:#1B4FD8}`;
const CAL_CSS = `html,body{height:auto!important;overflow:hidden!important}#root>div{min-height:0!important}`;

function liveFrame(host, { src, title, label, injectCss, fit }) {
  host.innerHTML = `<div class="wrap"><div class="liveframe"><div class="lf-bar"><span class="lf-dot"></span><span class="lf-lab">${esc(label)}</span><a class="lf-open" href="${esc(src)}" target="_blank" rel="noopener">Open full screen ↗</a></div><div class="lf-body"><div class="lf-msg">Loading…</div><iframe class="lf-frame" title="${esc(title)}" src="${esc(src)}" style="height:0"></iframe></div></div></div>`;
  const fr = $("iframe", host), msg = $(".lf-msg", host);
  const slow = setTimeout(() => (msg.innerHTML = `Still loading… if nothing appears, <a href="${esc(src)}" target="_blank" rel="noopener">open it in a new tab</a>.`), 8000);
  fr.addEventListener("load", () => {
    clearTimeout(slow);
    msg.remove();
    fr.classList.add("on");
    const fitNow = () => {
      try {
        const d = fr.contentDocument;
        if (!d?.body) return;
        const root = d.getElementById("root");
        const hgt = fit === "calendar" ? Math.max(d.body.scrollHeight, root?.scrollHeight ?? 0) : Math.max(d.body.scrollHeight, d.documentElement?.scrollHeight ?? 0, root?.scrollHeight ?? 0);
        if (hgt > 80) fr.style.height = hgt + "px";
      } catch {}
    };
    try {
      const d = fr.contentDocument;
      if (d?.head && injectCss) {
        const st = d.createElement("style");
        st.textContent = injectCss;
        d.head.appendChild(st);
      }
      if (window.ResizeObserver && d) {
        const ro = new ResizeObserver(fitNow);
        ro.observe(d.documentElement);
        ro.observe(d.body);
      }
    } catch {
      fr.style.height = "min(78vh,860px)"; // cross-origin: can't measure
    }
    fitNow();
    const iv = setInterval(() => (document.contains(fr) ? fitNow() : clearInterval(iv)), 1000);
  });
}
function renderMarking(app) {
  const tools = SITE.markingTools;
  let cur = tools[1] || tools[0];
  app.innerHTML = `<section class="page on" data-page="marking">${CRUMB("Mission Marking")}<div class="sec"><div class="wrap"><div class="sec-h"><div class="eyebrow">Browse</div><h2>Mission Marking</h2><p>One branch among eight — but the one that closes the loop. A child reads a feature, does the mission, gets marked, and rises.</p></div><div class="campgrid" data-tools>${tools
    .map((t, i) => `<button class="campcard" data-tool="${i}" style="--c:${esc(t.color)}"><span class="cc-emb"><svg class="emb" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.path.split(" M").map((d, j) => `<path d="${esc(j ? "M" + d : d)}"/>`).join("")}</svg></span><span class="cc-body"><span class="cc-name">${esc(t.name)}</span><span class="cc-desc">${esc(t.desc)}</span></span></button>`)
    .join("")}</div></div></div><div id="toolframe"></div></section>`;
  const show = () => {
    $$("[data-tool]", app).forEach((b) => b.setAttribute("aria-pressed", String(tools[+b.dataset.tool] === cur)));
    const src = assetUrl(cur.src);
    liveFrame($("#toolframe", app), { src, title: cur.name, label: `Live · Base Commander · ${cur.name}`, injectCss: MARKING_CSS });
  };
  $(".campgrid", app).addEventListener("click", (e) => {
    const b = e.target.closest("[data-tool]");
    if (b) (cur = tools[+b.dataset.tool]), show();
  });
  show();
}
function renderCalendar(app, query) {
  const v = query.get("view");
  const src = assetUrl(SITE.settings.calendarUrl + (v ? `?view=${encodeURIComponent(v)}` : ""));
  app.innerHTML = `<section class="page on" data-page="calendar">${CRUMB("Calendar")}<div class="sec"><div class="wrap"><div class="sec-h"><div class="eyebrow">Browse</div><h2>Calendar</h2><p>${esc(SITE.settings.calendarBlurb || "The whole 5787 year — every date and category, filtered and exported the way you need it.")}</p></div></div></div><div id="calframe"></div></section>`;
  liveFrame($("#calframe", app), { src, title: "Tzivos Hashem Calendar", label: SITE.settings.calendarLabel || "Tzivos Hashem Calendar 5787", injectCss: CAL_CSS, fit: "calendar" });
}

// ---------- boot ----------
async function checkLogin() {
  if (!SITE.settings.requireLogin) return true;
  try {
    const r = await fetch(api("checkAuth.php"), { credentials: "include" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (!j.success) {
      alert("You are not authorized to view this page. You must login first.");
      location.href = SITE.settings.loginRedirect || "/";
      return false;
    }
    USER = j;
    return true;
  } catch (err) {
    console.error("Login check failed:", err);
    $("#app").innerHTML = `<section class="page on"><div class="sec"><div class="wrap"><div class="empty"><h3>Couldn’t check your login</h3><p>The login service didn’t answer. Try again, or ask the site admin to turn off “Require login” if this copy is hosted somewhere without it.</p></div></div></div></section>`;
    return false;
  }
}
function setAssetCss() {
  // the logo and mission tick are legacy images; repoint them when hosted elsewhere
  const s = document.createElement("style");
  const logo = SITE.settings.logo || "/resources/site/dist/assets/build/f90a774f9a601cdd-_UY6KeoC.svg";
  const tick = SITE.settings.missionTick || "/resources/site/dist/assets/build/5ada48879bc7ad25-DGXXEFvN.png";
  s.textContent = `:root{--logo:url("${assetUrl(logo)}")}.m2ck{background-image:url("${assetUrl(tick)}")}`;
  document.head.appendChild(s);
}

async function boot() {
  if (location.hash && !location.hash.startsWith("#/")) location.hash = `/${location.hash.slice(1)}`;
  SITE = await (await fetch(`${CONTENT}site.json`, { cache: "no-cache" })).json();
  setAssetCss();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="schmodal" id="schmodal" role="dialog" aria-modal="true" aria-labelledby="schtitle"><div class="schbox"><button class="schx" id="schx" aria-label="Close">✕</button><h3 id="schtitle"></h3><div class="schlist" id="schlist"></div></div></div>
<div class="lb" id="lb"><button class="lbwa" id="lbwa" type="button" aria-label="Share with WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg>Share with WhatsApp</button><button class="lbx" id="lbx" aria-label="Exit">✕ Exit</button><div class="lbspread" id="lbspread"></div><div class="lbtoast" id="lbtoast" role="status"></div></div>`
  );
  $("#schmodal").addEventListener("click", (e) => e.target === e.currentTarget && hideModal());
  $("#schx").addEventListener("click", hideModal);
  $("#lb").addEventListener("click", (e) => e.target === e.currentTarget && closeLightbox());
  $("#lbx").addEventListener("click", closeLightbox);
  $("#lbwa").addEventListener("click", shareWhatsApp);
  document.addEventListener("keydown", (e) => e.key === "Escape" && (hideModal(), $("#lb").classList.contains("on") && closeLightbox()));
  if (!(await checkLogin())) return;
  renderHeader();
  $("#hdr").addEventListener("click", (e) => {
    const b = e.target.closest("[data-nav]");
    if (b) navigate(b.getAttribute("data-nav"), { fromNav: true });
  });
  $("#app").addEventListener("click", onPageClick);
  if (!history.state) history.replaceState({ idx: 0 }, "", location.href);
  route();
}
boot();
