// Admin app: page tree, page editor with live preview, page types, site data,
// files and publishing. Talks to server.mjs over /api.
import { ctx, el, renderForm, refreshPageList } from "./fields.js";
import { pageFields, articleFields, BLOCKS, typeFields, settingsFields, navFields, scheduleFields, olderFields, toolFields, fillCardFromPage } from "./schemas.js";
import { renderPage, resolvePage, BLOCK_TYPES } from "/js/render.js";

const $ = (s, e = document) => e.querySelector(s);
const plain = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
const clone = (o) => structuredClone(o);

// ---------- API ----------
async function api(path, opts = {}) {
  const r = await fetch(`/api/${path}`, { headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}, ...opts, body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status, data: j });
  return j;
}
function toast(msg, kind = "ok") {
  const t = el("div", { class: `toast ${kind}` }, msg);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3000);
}

// ---------- state ----------
const S = { index: {}, types: {}, images: {}, settings: {}, nav: [], dirty: false, page: null, pageId: null, isNew: false };
const pageCache = new Map();
ctx.pages = async (id) => {
  if (pageCache.has(id)) return pageCache.get(id);
  try {
    const p = await api(`pages/${encodeURIComponent(id)}`);
    pageCache.set(id, p);
    return p;
  } catch {
    return null;
  }
};
ctx.upload = async (file, { image, key }) => {
  const fd = new FormData();
  fd.append("file", file);
  if (image) fd.append("imageKey", key ? `${key}_${Date.now().toString(36)}` : "");
  try {
    const r = await api("upload", { method: "POST", body: fd });
    toast(`Uploaded ${r.name}`);
    if (r.key) S.images[r.key] = r.url;
    return r;
  } catch (e) {
    toast(`Upload failed: ${e.message}`, "err");
    return null;
  }
};
function assetUrl(u) {
  if (!u || /^(https?:|data:|blob:|#)/.test(u)) return u;
  if (/^uploads\//.test(u)) return "/" + u;
  const base = S.settings.previewLegacyBase || S.settings.legacyBase;
  if (!base) return u.startsWith("/") ? u : "/" + u;
  return u.startsWith("/") ? new URL(base).origin + u : new URL(u, base).href;
}
ctx.assetUrl = assetUrl;

async function loadAll() {
  const [index, types, images, settings, nav] = await Promise.all([api("index"), api("data/types"), api("data/images"), api("data/settings"), api("data/nav")]);
  Object.assign(S, { index, types, images, settings, nav });
  Object.assign(ctx, { index, types, images, nav });
  refreshPageList();
}

// ---------- page tree ----------
function drawTree() {
  const q = plain($("#treeq").value).toLowerCase();
  const box = $("#tree");
  box.innerHTML = "";
  const kids = {};
  for (const [id, p] of Object.entries(S.index)) (kids[p.parent || "_root"] = kids[p.parent || "_root"] || []).push(id);
  const label = (id) => plain(S.index[id]?.crumbLabel || S.index[id]?.t || id);
  const sortIds = (ids) => ids.sort((a, b) => label(a).localeCompare(label(b), undefined, { numeric: true }));
  if (q) {
    const hits = Object.keys(S.index).filter((id) => id.toLowerCase().includes(q) || label(id).toLowerCase().includes(q) || plain(S.index[id].t).toLowerCase().includes(q)).slice(0, 300);
    hits.forEach((id) => box.append(treeItem(id, 0, false)));
    if (!hits.length) box.append(el("div", { class: "muted pad" }, "No pages match."));
    return;
  }
  const open = new Set(JSON.parse(localStorage.getItem("th.open") || '["home"]'));
  const addNode = (id, depth) => {
    const c = sortIds(kids[id] || []);
    const node = treeItem(id, depth, c.length > 0, open.has(id), () => {
      open.has(id) ? open.delete(id) : open.add(id);
      localStorage.setItem("th.open", JSON.stringify([...open]));
      drawTree();
    });
    box.append(node);
    if (open.has(id)) c.forEach((k) => addNode(k, depth + 1));
  };
  addNode("home", 0);
  const orphans = (kids._root || []).filter((id) => id !== "home");
  if (orphans.length) {
    box.append(el("div", { class: "tree-sep" }, "Not linked under Home"));
    sortIds(orphans).forEach((id) => addNode(id, 0));
  }
}
function treeItem(id, depth, hasKids, isOpen, toggle) {
  const p = S.index[id] || {};
  const t = S.types[p.type];
  return el(
    "div",
    { class: `ti${id === S.pageId ? " cur" : ""}${p.draft ? " draft" : ""}`, style: `padding-left:${8 + depth * 14}px` },
    hasKids ? el("button", { class: "tw", onclick: toggle }, isOpen ? "▾" : "▸") : el("span", { class: "tw" }),
    el("a", { href: `#page/${encodeURIComponent(id)}`, title: id }, plain(p.crumbLabel || p.t || id), el("small", {}, t ? ` ${t.label}` : ""))
  );
}

// ---------- routing ----------
window.addEventListener("hashchange", () => route());
window.addEventListener("beforeunload", (e) => S.dirty && (e.preventDefault(), (e.returnValue = "")));
let lastHash = location.hash;
async function route() {
  if (S.ignoreHash && location.hash === S.ignoreHash) {
    // we already opened this page ourselves (new or duplicated page that isn't saved yet)
    S.ignoreHash = null;
    lastHash = location.hash;
    return;
  }
  if (S.dirty && location.hash !== lastHash && !confirm("You have unsaved changes. Leave without saving?")) {
    history.replaceState(null, "", lastHash);
    return;
  }
  S.dirty = false;
  lastHash = location.hash;
  const [view, ...rest] = location.hash.replace(/^#/, "").split("/");
  const arg = decodeURIComponent(rest.join("/"));
  document.querySelectorAll("#topnav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${view}` || (view === "page" && a.getAttribute("href") === "#pages")));
  $("#side").style.display = view === "page" || view === "pages" || !view ? "" : "none";
  if (view === "page" && arg) return editPage(arg);
  if (view === "types") return editTypes(arg);
  if (view === "data") return editData(arg || "settings");
  if (view === "files") return showFiles();
  if (view === "publish") return showPublish();
  showWelcome();
}
const main = () => $("#main");

function showWelcome() {
  S.pageId = null;
  drawTree();
  const counts = {};
  Object.values(S.index).forEach((p) => (counts[p.type] = (counts[p.type] || 0) + 1));
  main().innerHTML = "";
  main().append(
    el("div", { class: "pane narrow" },
      el("h1", {}, "Commander’s Resources — editor"),
      el("p", {}, `${Object.keys(S.index).length} pages. Pick one on the left, or start something new.`),
      el("div", { class: "row gap" }, el("button", { class: "btn primary", onclick: newPageDialog }, "+ New page"), el("a", { class: "btn", href: "/", target: "_blank" }, "Open site preview ↗")),
      el("h2", {}, "Pages by type"),
      el("div", { class: "typegrid" }, ...Object.entries(S.types).map(([id, t]) => el("a", { class: "typecard", href: `#types/${id}` }, el("b", {}, t.label), el("span", {}, `${counts[id] || 0} pages · ${t.template === "article" ? "article" : "section page"}`))))
    )
  );
}

// ---------- page editor ----------
// lists of plain strings are edited as [{value}] and unwrapped again on save
const toEditable = (p) => {
  const c = clone(p);
  if (c.article?.pages) c.article.pages = c.article.pages.map((value) => ({ value }));
  return c;
};
// drop empty strings, empty lists and empty objects left behind by the forms
function tidy(o, keep = []) {
  if (Array.isArray(o)) return o.map((x) => tidy(x));
  if (!o || typeof o !== "object") return o;
  for (const k of Object.keys(o)) {
    const v = (o[k] = tidy(o[k]));
    if (keep.includes(k)) continue;
    if (v === "" || v == null || (Array.isArray(v) && !v.length) || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) delete o[k];
  }
  return o;
}
const fromEditable = (p) => {
  const c = clone(p);
  if (c.article?.pages) c.article.pages = c.article.pages.map((x) => x.value).filter(Boolean);
  if (c.article) tidy(c.article, ["chips", "body"]);
  for (const k of Object.keys(c)) if (c[k] === "" || c[k] == null) delete c[k];
  return c;
};

async function editPage(id, preset) {
  S.pageId = id;
  drawTree();
  let page = preset;
  if (!page) {
    main().innerHTML = `<div class="pane"><p class="muted">Loading…</p></div>`;
    try {
      page = await api(`pages/${encodeURIComponent(id)}`);
    } catch (e) {
      main().innerHTML = "";
      main().append(el("div", { class: "pane" }, el("h1", {}, "Page not found"), el("p", {}, `There is no page called “${id}”.`)));
      return;
    }
  }
  S.isNew = !!preset;
  S.page = toEditable(page);
  ctx.currentPageId = id;
  ctx.currentType = S.types[S.page.type];
  drawEditor();
  if (preset) markDirty();
}

function markDirty() {
  S.dirty = true;
  $("#savebtn")?.classList.add("hot");
  schedulePreview();
}

function drawEditor() {
  const p = S.page;
  const t = S.types[p.type] || {};
  ctx.currentType = t;
  main().innerHTML = "";
  const header = el(
    "div",
    { class: "edhead" },
    el("div", {}, el("div", { class: "muted small" }, `${t.label || p.type} · ${p.id}`), el("h1", { html: p.title || p.crumbLabel || p.id })),
    el("div", { class: "row gap" },
      el("button", { class: "btn primary", id: "savebtn", onclick: savePage }, S.isNew ? "Create page" : "Save"),
      el("a", { class: "btn", href: `/#/${encodeURIComponent(p.id)}`, target: "_blank" }, "View ↗"),
      el("button", { class: "btn", onclick: () => duplicatePage() }, "Duplicate"),
      el("button", { class: "btn", onclick: showHistory }, "Versions"),
      el("button", { class: "btn danger", onclick: deletePage, disabled: S.isNew || p.id === "home" }, "Delete"))
  );
  const form = el("div", { class: "edform" });
  const common = el("section", { class: "card" }, el("h2", {}, "Page"));
  const commonBody = el("div", { class: "grid" });
  renderForm(commonBody, p, pageFields, () => {
    markDirty();
    if (S.types[p.type] !== ctx.currentType) {
      // switching type: make sure the layout matches
      const nt = S.types[p.type];
      if (nt && nt.template !== p.template) {
        if (!confirm(`“${nt.label}” uses a different layout. Switch layout? Content in the current layout will be kept in the file but hidden.`)) return;
        p.template = nt.template;
        if (p.template === "article") p.article = p.article || { body: "" };
        else p.blocks = p.blocks || clone(nt.blocks || [{ type: "heading", title: p.title }]);
      }
      drawEditor();
    }
    header.querySelector("h1").innerHTML = p.title || p.crumbLabel || p.id;
  });
  common.append(commonBody);
  form.append(common);
  if (p.template === "article") {
    const sec = el("section", { class: "card" }, el("h2", {}, "Content"));
    const body = el("div", { class: "grid" });
    p.article = p.article || {};
    renderForm(body, p.article, articleFields, markDirty);
    sec.append(body);
    form.append(sec);
  } else if (p.sections) {
    p.sections.forEach((s, i) => {
      const sec = el("section", { class: "card" }, el("h2", {}, s.html != null ? `Section ${i + 1} (HTML)` : `Section ${i + 1}`));
      if (s.html != null) {
        const holder = el("div");
        renderForm(holder, s, [{ key: "html", label: "", kind: "code", rows: 8 }], markDirty);
        sec.append(holder);
      } else sec.append(blocksEditor(s));
      form.append(sec);
    });
  } else {
    p.blocks = p.blocks || [];
    const sec = el("section", { class: "card" }, el("h2", {}, "Blocks"), el("p", { class: "muted small" }, "The page is built from these blocks, top to bottom."));
    sec.append(blocksEditor(p));
    form.append(sec);
  }
  const adv = el("details", { class: "card" }, el("summary", {}, "Advanced: breadcrumb overrides & raw JSON"));
  const advBody = el("div", { class: "grid" });
  renderForm(advBody, p, [
    { key: "crumb", label: "Breadcrumb override", kind: "json", rows: 4, help: 'Only when the trail should differ from the parent chain, e.g. {"trail":[{"id":"date","label":"Date"}]}' },
    { key: "altCrumb", label: "Campaign breadcrumb override", kind: "json", rows: 4 },
  ], markDirty);
  adv.append(advBody, el("button", { class: "btn tiny", onclick: () => {
    const txt = prompt("Paste the whole page JSON (replaces the form):", JSON.stringify(fromEditable(p)));
    if (!txt) return;
    try {
      const np = JSON.parse(txt);
      if (np.id !== p.id) return alert("The id must stay the same.");
      S.page = toEditable(np);
      drawEditor();
      markDirty();
    } catch (e) {
      alert("That isn't valid JSON: " + e.message);
    }
  } }, "Edit raw JSON…"));
  form.append(adv);

  const preview = el("div", { class: "preview" }, el("div", { class: "pvbar" }, el("span", {}, "Live preview"), el("label", { class: "small" }, el("input", { type: "checkbox", id: "pvphone", onchange: () => $(".preview").classList.toggle("phone") }), " phone width")), el("iframe", { id: "pv", src: "preview.html" }));
  main().append(el("div", { class: "editor" }, el("div", { class: "edcol" }, header, form), preview));
  $("#pv").addEventListener("load", () => sendPreview());
}

function blocksEditor(holder) {
  const box = el("div", { class: "blocks" });
  const draw = (openIdx) => {
    box.innerHTML = "";
    holder.blocks.forEach((b, i) => {
      const def = BLOCKS[b.type] || BLOCKS.html;
      const body = el("div", { class: "li-body grid" });
      const sum = el("span", { class: "li-sum" }, def.summary(b) || "");
      const item = el(
        "div",
        { class: `li block${openIdx === i ? " open" : ""}` },
        el("div", { class: "li-head" },
          el("button", { type: "button", class: "li-toggle", onclick: () => item.classList.toggle("open") }, el("span", { class: "btype" }, def.label), sum),
          el("span", { class: "li-tools" },
            el("button", { class: "btn tiny ghost", title: "Move up", disabled: i === 0, onclick: () => (holder.blocks.splice(i - 1, 0, holder.blocks.splice(i, 1)[0]), markDirty(), draw(i - 1)) }, "▲"),
            el("button", { class: "btn tiny ghost", title: "Move down", disabled: i === holder.blocks.length - 1, onclick: () => (holder.blocks.splice(i + 1, 0, holder.blocks.splice(i, 1)[0]), markDirty(), draw(i + 1)) }, "▼"),
            el("button", { class: "btn tiny ghost", title: "Duplicate", onclick: () => (holder.blocks.splice(i + 1, 0, clone(b)), markDirty(), draw(i + 1)) }, "⧉"),
            el("button", { class: "btn tiny ghost danger", title: "Remove block", onclick: () => confirm(`Remove this ${def.label} block?`) && (holder.blocks.splice(i, 1), markDirty(), draw()) }, "✕")))
        , body
      );
      renderForm(body, b, def.fields, () => {
        markDirty();
        sum.textContent = def.summary(b) || "";
      });
      box.append(item);
    });
    const add = el("select", { class: "addsel", onchange: (e) => {
      const t = e.target.value;
      if (!t) return;
      holder.blocks.push(t === "heading" ? { type: t, eyebrow: "", title: "" } : t === "html" ? { type: t, html: "" } : { type: t, items: [] });
      markDirty();
      draw(holder.blocks.length - 1);
    } }, el("option", { value: "" }, "+ Add block…"), ...BLOCK_TYPES.map((t) => el("option", { value: t }, BLOCKS[t]?.label || t)));
    box.append(el("div", { class: "li-add" }, add));
  };
  draw();
  return box;
}

// preview: render the unsaved page with the same renderer the site uses
let pvTimer;
function schedulePreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(sendPreview, 250);
}
function sendPreview() {
  const fr = $("#pv");
  if (!fr?.contentWindow || !S.page) return;
  const p = fromEditable(S.page);
  const lookup = (id) => (id === p.id ? p : S.index[id]);
  let html;
  try {
    html = renderPage(resolvePage(p, S.types), lookup);
  } catch (e) {
    html = `<div class="note"><b>Preview error</b>${String(e.message)}</div>`;
  }
  fr.contentWindow.postMessage({ html, images: S.images, legacyBase: S.settings.previewLegacyBase || S.settings.legacyBase || "" }, location.origin);
}

async function savePage() {
  const p = fromEditable(S.page);
  if (!p.title && !p.crumbLabel) return toast("Give the page a title first.", "err");
  try {
    if (S.isNew) await api("pages", { method: "POST", body: p });
    else await api(`pages/${encodeURIComponent(p.id)}`, { method: "PUT", body: p });
    pageCache.set(p.id, p);
    S.dirty = false;
    const wasNew = S.isNew;
    S.isNew = false;
    S.index = await api("index");
    ctx.index = S.index;
    refreshPageList();
    toast(wasNew ? "Page created." : "Saved.");
    $("#savebtn").classList.remove("hot");
    $("#savebtn").textContent = "Save";
    drawTree();
    if (wasNew && S.pendingCard) await addCardFor(p, S.pendingCard), (S.pendingCard = null);
    if (wasNew) history.replaceState(null, "", `#page/${encodeURIComponent(p.id)}`), (lastHash = location.hash);
  } catch (e) {
    toast(e.message, "err");
  }
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && S.page && location.hash.startsWith("#page/")) {
    e.preventDefault();
    savePage();
  }
});

async function deletePage() {
  const id = S.page.id;
  if (!confirm(`Delete “${plain(S.page.title || id)}”? You can bring it back from Versions only by recreating it.`)) return;
  try {
    await api(`pages/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (e) {
    if (e.status !== 409) return toast(e.message, "err");
    const list = e.data.refs.map((r) => `• ${plain(r.title) || r.id} (${r.why.join(", ")})`).join("\n");
    if (!confirm(`These pages still point here:\n${list}\n\nDelete anyway? Their links will go nowhere until you fix them.`)) return;
    await api(`pages/${encodeURIComponent(id)}?force=1`, { method: "DELETE" });
  }
  S.dirty = false;
  delete S.index[id];
  toast("Deleted.");
  location.hash = S.page.parent && S.index[S.page.parent] ? `#page/${S.page.parent}` : "#pages";
}

async function showHistory() {
  const vers = await api(`history/pages/${encodeURIComponent(S.page.id)}`);
  if (!vers.length) return alert("No earlier versions yet — a copy is kept each time you save.");
  const pick = prompt(`Earlier versions (newest first). Type a number to load it into the editor — it isn't saved until you press Save:\n\n${vers.slice(0, 20).map((v, i) => `${i + 1}. ${v.replace(/\.json$/, "").replace(/T(\d\d)-(\d\d)-(\d\d).*/, " $1:$2")}`).join("\n")}`);
  const v = vers[+pick - 1];
  if (!v) return;
  const old = await api(`history/pages/${encodeURIComponent(S.page.id)}/${v}`);
  S.page = toEditable(old);
  drawEditor();
  markDirty();
  toast("Older version loaded — press Save to keep it.");
}

function duplicatePage() {
  const id = prompt("New page id (letters, numbers, - and _):", `${S.page.id}-copy`);
  if (!id) return;
  if (S.index[id]) return alert("That id is taken.");
  const p = fromEditable(S.page);
  p.id = id;
  p.draft = true;
  openUnsaved(id, p);
}
function openUnsaved(id, p) {
  S.dirty = false;
  S.ignoreHash = `#page/${encodeURIComponent(id)}`;
  location.hash = S.ignoreHash;
  lastHash = location.hash;
  editPage(id, p);
}

// ---------- new page ----------
const slugify = (s) => plain(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function newPageDialog() {
  const d = el("dialog", { class: "dlg" });
  const st = { type: Object.keys(S.types).find((k) => S.types[k].template === "article"), title: "", id: "", card: true };
  const draw = () => {
    const t = S.types[st.type] || {};
    const np = t.newPage || {};
    d.innerHTML = "";
    const add = (...xs) => d.append(...xs.filter(Boolean));
    const typeSel = el("select", { onchange: (e) => ((st.type = e.target.value), (st.parent = undefined), draw()) });
    const groups = {};
    for (const [id, x] of Object.entries(S.types)) (groups[x.group || "Other"] = groups[x.group || "Other"] || []).push([id, x]);
    for (const [g, list] of Object.entries(groups)) {
      const og = el("optgroup", { label: g });
      list.forEach(([id, x]) => og.append(el("option", { value: id, selected: id === st.type }, x.label)));
      typeSel.append(og);
    }
    const title = el("input", { type: "text", value: st.title, placeholder: "e.g. Honey From a Rock?!", oninput: (e) => {
      st.title = e.target.value;
      if (!st.idTouched) idInp.value = st.id = suggestId();
    } });
    const suggestId = () => {
      const base = slugify(st.title) || "page";
      let id = base, i = 2;
      while (S.index[id]) id = `${base}-${i++}`;
      return id;
    };
    const idInp = el("input", { type: "text", value: st.id, placeholder: "page-id", oninput: (e) => ((st.id = e.target.value.trim()), (st.idTouched = true)) });
    const cardLabel = el("span", {});
    const cardRow = el("label", { class: "chk" }, el("input", { type: "checkbox", checked: st.card, onchange: (e) => (st.card = e.target.checked) }), cardLabel);
    const syncCard = () => {
      const on = np.cardOn || st.parent || np.parent;
      cardRow.style.display = t.template === "article" && on && S.index[on] ? "" : "none";
      cardLabel.textContent = ` Also add a card for it on “${plain(S.index[on]?.t || on)}”`;
    };
    const parent = el("input", { type: "text", list: "pagelist", value: st.parent ?? np.parent ?? "", oninput: (e) => ((st.parent = e.target.value.trim()), syncCard()) });
    syncCard();
    add(
      el("h2", {}, "New page"),
      el("label", { class: "lab" }, "Type"), typeSel,
      t.description ? el("p", { class: "help" }, t.description) : null,
      el("label", { class: "lab" }, "Title"), title,
      el("label", { class: "lab" }, "Page id (used in the address)"), idInp,
      el("label", { class: "lab" }, "Parent page"), parent,
      cardRow,
      el("div", { class: "row gap end" },
        el("button", { class: "btn", onclick: () => d.close() }, "Cancel"),
        el("button", { class: "btn primary", onclick: () => {
          const id = st.id || suggestId();
          if (!/^[A-Za-z0-9][A-Za-z0-9_ -]*$/.test(id)) return alert("The id may use letters, numbers, spaces, - and _ only.");
          if (S.index[id] || ["marking", "calendar"].includes(id)) return alert("That id is taken.");
          if (!st.title.trim()) return alert("Give it a title.");
          const p = { id, type: st.type, template: t.template || "article", title: st.title.trim(), branch: np.branch, parent: st.parent ?? np.parent, altParent: np.altParent, altBranch: np.altParent ? "campaign" : undefined, draft: true };
          if (p.template === "article") p.article = { chips: [], body: "<p><br></p>" };
          else p.blocks = clone(t.blocks || [{ type: "heading", eyebrow: "", title: "" }]).map((b) => (b.type === "heading" && !b.title ? { ...b, title: p.title } : b));
          for (const k of Object.keys(p)) if (p[k] == null || p[k] === "") delete p[k];
          const cardOn = np.cardOn || st.parent || np.parent;
          S.pendingCard = t.template === "article" && cardOn && S.index[cardOn] && st.card ? cardOn : null;
          d.close();
          openUnsaved(id, p);
          toast("New page started as a draft. Fill it in and press Create page.");
        } }, "Start editing"))
    );
  };
  draw();
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
}

async function addCardFor(page, hubId) {
  try {
    const hub = await api(`pages/${encodeURIComponent(hubId)}`);
    const blocks = hub.blocks || (hub.sections || []).flatMap((s) => s.blocks || []);
    let cards = [...blocks].reverse().find((b) => b.type === "cards");
    if (!cards) {
      cards = { type: "cards", items: [] };
      (hub.blocks = hub.blocks || []).push(cards);
    }
    const sample = cards.items.find((c) => c.page && c.variant !== "empty") || {};
    const card = { color: sample.color, extraClass: sample.extraClass, imgZoom: sample.imgZoom, icon: sample.icon };
    fillCardFromPage(card, page, S.types);
    for (const k of Object.keys(card)) if (card[k] == null) delete card[k];
    cards.items.unshift(card);
    await api(`pages/${encodeURIComponent(hubId)}`, { method: "PUT", body: hub });
    pageCache.delete(hubId);
    toast(`Card added to “${plain(hub.title || hubId)}”.`);
  } catch (e) {
    toast(`Couldn't add the card: ${e.message}`, "err");
  }
}

// ---------- page types ----------
async function editTypes(id) {
  S.pageId = null;
  const types = clone(await api("data/types"));
  const counts = {};
  Object.values(S.index).forEach((p) => (counts[p.type] = (counts[p.type] || 0) + 1));
  main().innerHTML = "";
  const list = el("div", { class: "typelist" });
  for (const [tid, t] of Object.entries(types)) list.append(el("a", { href: `#types/${tid}`, class: tid === id ? "on" : "" }, el("b", {}, t.label), el("span", {}, `${counts[tid] || 0} · ${t.template}`)));
  list.append(el("button", { class: "btn tiny", onclick: () => {
    const nid = slugify(prompt("Id for the new type (e.g. weekly-quiz):") || "");
    if (!nid) return;
    if (types[nid]) return alert("That id exists.");
    types[nid] = { label: nid, template: "article", group: "Articles", defaults: {}, newPage: {} };
    saveTypes(types).then(() => (location.hash = `#types/${nid}`));
  } }, "+ New type"));
  const pane = el("div", { class: "pane" });
  if (id && types[id]) {
    const t = types[id];
    const form = el("div", { class: "grid" });
    renderForm(form, t, typeFields, () => (S.dirty = true));
    pane.append(
      el("div", { class: "edhead" }, el("div", {}, el("div", { class: "muted small" }, `Page type · ${id} · ${counts[id] || 0} pages`), el("h1", {}, t.label)),
        el("div", { class: "row gap" },
          el("button", { class: "btn primary", onclick: async () => { await saveTypes(types); S.dirty = false; editTypes(id); } }, "Save type"),
          el("a", { class: "btn", href: `#pages`, onclick: () => setTimeout(() => (($("#treeq").value = ""), drawTree())) }, "Pages…"),
          el("button", { class: "btn danger", disabled: counts[id] > 0, title: counts[id] ? "Move or delete its pages first" : "", onclick: async () => { if (!confirm("Delete this type?")) return; delete types[id]; await saveTypes(types); location.hash = "#types"; } }, "Delete"))),
      el("section", { class: "card" }, form),
      counts[id] ? el("section", { class: "card" }, el("h2", {}, "Pages of this type"), el("div", { class: "plist" }, ...Object.entries(S.index).filter(([, p]) => p.type === id).slice(0, 400).map(([pid, p]) => el("a", { href: `#page/${encodeURIComponent(pid)}` }, plain(p.t || pid))))) : null
    );
  } else pane.append(el("h1", {}, "Page types"), el("p", {}, "Each page has a type. Article types carry shared defaults (kicker, ribbon, colour, mission) that their pages inherit, and starting values for new pages. Pick one on the left."));
  main().append(el("div", { class: "split" }, list, pane));
}
async function saveTypes(types) {
  try {
    await api("data/types", { method: "PUT", body: types });
    S.types = types;
    ctx.types = types;
    toast("Types saved.");
  } catch (e) {
    toast(e.message, "err");
  }
}

// ---------- site data ----------
// some tables are stored compactly; these adapters turn them into form-friendly lists and back
const ADAPT = {
  settings: { fields: settingsFields, label: "Settings" },
  nav: { fields: navFields, label: "Top menu", to: (v) => ({ items: v }), from: (o) => o.items || [] },
  schedule: {
    fields: scheduleFields, label: "Schedule & events",
    to: (v) => ({
      weekly: v.weekly.map(([day, task]) => ({ day, task })),
      mivtzaOfMonth: Object.entries(v.mivtzaOfMonth).map(([month, mivtza]) => ({ month, mivtza })),
      categories: Object.entries(v.categories).map(([id, label]) => ({ id, label, icon: v.categoryIcons[id] })),
      events: v.events, monthOrder: v.monthOrder,
    }),
    from: (o) => ({
      weekly: (o.weekly || []).map((r) => [r.day, r.task]),
      mivtzaOfMonth: Object.fromEntries((o.mivtzaOfMonth || []).map((r) => [r.month, r.mivtza])),
      monthOrder: o.monthOrder,
      categories: Object.fromEntries((o.categories || []).map((r) => [r.id, r.label])),
      categoryIcons: Object.fromEntries((o.categories || []).filter((r) => r.icon).map((r) => [r.id, r.icon])),
      events: o.events || [],
    }),
  },
  "older-pdfs": { fields: olderFields, label: "Older PDFs", to: (v) => ({ issues: Object.entries(v).map(([issue, files]) => ({ issue, files: files.map(([label, href]) => ({ label, href })) })) }), from: (o) => Object.fromEntries((o.issues || []).map((r) => [r.issue, (r.files || []).map((f) => [f.label, f.href])])) },
  "marking-tools": { fields: toolFields, label: "Mission Marking tools", to: (v) => ({ items: v }), from: (o) => o.items || [] },
  images: { label: "Images", custom: true },
  calendar: { label: "Calendar data", fields: [{ key: "value", label: "Calendar data (days → parsha, Hebrew date; yom tov dates)", kind: "json", rows: 30, help: "Drives “this week” on the home page and the Today badges. Usually only changes once a year." }], to: (v) => ({ value: v }), from: (o) => o.value },
  "biur-tefillah": { label: "Biur Tefillah books", fields: [{ key: "value", label: "Book PDFs and page counts", kind: "json", rows: 20 }], to: (v) => ({ value: v }), from: (o) => o.value },
};

async function editData(name) {
  S.pageId = null;
  const a = ADAPT[name];
  main().innerHTML = "";
  const list = el("div", { class: "typelist" }, ...Object.entries(ADAPT).map(([n, x]) => el("a", { href: `#data/${n}`, class: n === name ? "on" : "" }, el("b", {}, x.label))));
  const pane = el("div", { class: "pane" });
  main().append(el("div", { class: "split" }, list, pane));
  if (!a) return;
  const raw = await api(`data/${name}`);
  if (a.custom) return imagesPane(pane, raw);
  const obj = a.to ? a.to(raw) : clone(raw);
  const form = el("div", { class: "grid" });
  renderForm(form, obj, a.fields, () => (S.dirty = true));
  pane.append(
    el("div", { class: "edhead" }, el("h1", {}, a.label), el("button", { class: "btn primary", onclick: async () => {
      try {
        const out = a.from ? a.from(obj) : obj;
        await api(`data/${name}`, { method: "PUT", body: out });
        S.dirty = false;
        if (name === "settings") S.settings = out;
        if (name === "nav") (S.nav = out), (ctx.nav = out);
        toast("Saved.");
      } catch (e) {
        toast(e.message, "err");
      }
    } }, "Save")),
    el("section", { class: "card" }, form)
  );
}

function imagesPane(pane, images) {
  const q = el("input", { type: "search", placeholder: "Filter by key…" });
  const grid = el("div", { class: "imggrid" });
  const draw = () => {
    grid.innerHTML = "";
    const f = q.value.toLowerCase();
    Object.entries(images).filter(([k]) => !f || k.toLowerCase().includes(f)).slice(0, 120).forEach(([k, u]) => grid.append(el("figure", {}, el("img", { src: assetUrl(u), loading: "lazy", alt: "" }), el("figcaption", {}, el("b", {}, k), el("span", {}, u)))));
  };
  q.addEventListener("input", draw);
  const up = el("input", { type: "file", accept: "image/*", multiple: true, style: "display:none", onchange: async () => {
    for (const f of up.files) {
      const key = prompt(`Key for ${f.name}:`, f.name.replace(/\.[^.]+$/, "").replace(/\W+/g, "_"));
      if (key == null) continue;
      const r = await ctx.upload(f, { image: true, key });
      if (r?.key) images[r.key] = r.url;
    }
    draw();
  } });
  pane.append(el("div", { class: "edhead" }, el("h1", {}, `Images (${Object.keys(images).length})`), el("div", { class: "row gap" }, q, el("button", { class: "btn primary", onclick: () => up.click() }, "Upload images…"), up)),
    el("p", { class: "muted" }, "Pages refer to pictures by key. Uploading here (or from an image field on a page) adds a key. Showing the first 120 matches."), grid);
  draw();
}

// ---------- files ----------
async function showFiles() {
  S.pageId = null;
  const files = await api("uploads");
  main().innerHTML = "";
  const up = el("input", { type: "file", multiple: true, style: "display:none", onchange: async () => {
    for (const f of up.files) await ctx.upload(f, {});
    showFiles();
  } });
  main().append(el("div", { class: "pane" },
    el("div", { class: "edhead" }, el("h1", {}, "Uploaded files"), el("div", {}, el("button", { class: "btn primary", onclick: () => up.click() }, "Upload files…"), up)),
    el("p", { class: "muted" }, "New PDFs, audio and pictures live here. Older files stay where they always were (pdfs/, sichos/, hisk/… on the main server) and keep working."),
    files.length
      ? el("table", { class: "tbl2" }, el("tr", {}, el("th", {}, "File"), el("th", {}, "Size"), el("th", {}, "")), ...files.map((f) => el("tr", {}, el("td", {}, el("a", { href: "/" + f.url, target: "_blank" }, f.url)), el("td", {}, `${(f.size / 1024 / 1024).toFixed(2)} MB`), el("td", {}, el("button", { class: "btn tiny", onclick: () => navigator.clipboard.writeText(f.url).then(() => toast("Path copied — paste it into a file field.")) }, "Copy path")))))
      : el("p", {}, "Nothing uploaded yet.")));
}

// ---------- publish ----------
async function showPublish() {
  S.pageId = null;
  const st = await api("status");
  const drafts = Object.entries(S.index).filter(([, p]) => p.draft);
  main().innerHTML = "";
  const out = el("div", { class: "pubout" });
  main().append(el("div", { class: "pane narrow" },
    el("h1", {}, "Publish"),
    el("p", {}, "Saving changes only updates the editor and preview. Publishing writes the static site that visitors see."),
    el("p", {}, "Publish folder: ", el("code", {}, st.publishDir)),
    drafts.length ? el("p", { class: "muted" }, `${drafts.length} draft page(s) will be left out: `, ...drafts.slice(0, 12).map(([id]) => el("a", { href: `#page/${encodeURIComponent(id)}`, style: "margin-right:8px" }, id))) : null,
    el("button", { class: "btn primary big", onclick: async (e) => {
      e.target.disabled = true;
      out.textContent = "Publishing…";
      try {
        const r = await api("publish", { method: "POST" });
        out.textContent = `Published ${r.pages} pages to ${r.outDir} at ${new Date(r.at).toLocaleTimeString()}.`;
        toast("Published.");
      } catch (err) {
        out.textContent = "Publishing failed: " + err.message;
      }
      e.target.disabled = false;
    } }, "Publish now"),
    out));
}

// ---------- boot ----------
$("#treeq").addEventListener("input", drawTree);
$("#newpage").addEventListener("click", newPageDialog);
loadAll().then(route).catch((e) => (main().innerHTML = `<div class="pane"><h1>Couldn't load</h1><p>${e.message}</p></div>`));
