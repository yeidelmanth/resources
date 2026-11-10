// Generic form builder. A form is a list of field descriptors bound to an object:
//   { key, label, kind, help, placeholder, options, of, summary, newItem, actions }
// Editing mutates the object in place and calls onChange().
//
// kinds: text, textarea, rich, code, bool, number, select, color, page, file,
//        image, strings, list, json, group
import { COLORS } from "/js/render.js";

export const ctx = {
  index: {}, // page id -> summary
  images: {}, // image key -> url
  assetUrl: (u) => u,
  upload: async () => null, // (file, {image:true}) -> {url, key}
};

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
export { el };

const get = (o, k) => (o ? o[k] : undefined);
function set(o, k, v) {
  if (v === "" || v === undefined || (Array.isArray(v) && v.length === 0 && !o.__keepEmpty)) delete o[k];
  else o[k] = v;
}
const plain = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#8592;/g, "←").trim();

let pageListId = null;
function ensurePageList() {
  if (pageListId && document.getElementById(pageListId)) return pageListId;
  pageListId = "pagelist";
  const dl = el("datalist", { id: pageListId });
  dl.append(el("option", { value: "home" }, "Home"));
  for (const [id, p] of Object.entries(ctx.index)) dl.append(el("option", { value: id }, `${plain(p.t || p.title)} · ${p.branch || ""}`));
  document.body.append(dl);
  return pageListId;
}
export function refreshPageList() {
  document.getElementById("pagelist")?.remove();
  pageListId = null;
}

export function renderForm(container, obj, fields, onChange) {
  container.innerHTML = "";
  for (const f of fields) {
    if (f.when && !f.when(obj)) continue;
    container.append(renderField(obj, f, onChange, () => renderForm(container, obj, fields, onChange)));
  }
}

function wrap(f, control, extra) {
  return el(
    "div",
    { class: `fld fld-${f.kind}${f.wide ? " wide" : ""}` },
    f.label ? el("label", { class: "lab" }, f.label, f.inheritNote ? el("span", { class: "inh" }, f.inheritNote) : null) : null,
    control,
    extra,
    f.help ? el("div", { class: "help", html: f.help }) : null
  );
}

function renderField(obj, f, onChange, rerender) {
  const v = get(obj, f.key);
  const ph = typeof f.placeholder === "function" ? f.placeholder(obj) : f.placeholder;
  const changed = (nv, again) => {
    set(obj, f.key, nv);
    onChange();
    if (again || f.rerender) rerender();
  };
  switch (f.kind) {
    case "group": {
      const box = el("fieldset", { class: "grp" }, el("legend", {}, f.label));
      const target = f.key ? (obj[f.key] = obj[f.key] || {}) : obj;
      const inner = el("div", { class: "grid" });
      renderForm(inner, target, f.of, () => {
        if (f.key && !Object.keys(target).length) delete obj[f.key];
        onChange();
      });
      box.append(inner);
      if (f.help) box.append(el("div", { class: "help", html: f.help }));
      return box;
    }
    case "bool":
      return el("div", { class: "fld fld-bool" }, el("label", { class: "chk" }, el("input", { type: "checkbox", checked: !!v, onchange: (e) => changed(e.target.checked || undefined, f.rerender) }), " ", f.label), f.help ? el("div", { class: "help", html: f.help }) : null);
    case "textarea":
    case "code":
      return wrap(f, el("textarea", { class: f.kind === "code" ? "code" : "", rows: f.rows || (f.kind === "code" ? 10 : 3), placeholder: ph || "", spellcheck: f.kind === "code" ? "false" : null, oninput: (e) => changed(e.target.value) }, v ?? ""));
    case "number":
      return wrap(f, el("input", { type: "number", value: v ?? "", placeholder: ph || "", oninput: (e) => changed(e.target.value === "" ? undefined : +e.target.value) }));
    case "select": {
      const opts = typeof f.options === "function" ? f.options(obj) : f.options;
      const s = el("select", { onchange: (e) => changed(e.target.value || undefined, true) });
      if (!f.required) s.append(el("option", { value: "" }, ph ? `— ${ph} —` : "—"));
      for (const o of opts) {
        if (o.group) {
          const g = el("optgroup", { label: o.group });
          o.items.forEach((x) => g.append(el("option", { value: x.value, selected: x.value === v }, x.label)));
          s.append(g);
        } else s.append(el("option", { value: o.value ?? o, selected: (o.value ?? o) === v }, o.label ?? o));
      }
      if (v && ![...s.options].some((o) => o.value === v)) s.append(el("option", { value: v, selected: true }, `${v} (custom)`));
      return wrap(f, s);
    }
    case "color": {
      const row = el("div", { class: "colors" });
      const inherit = ph;
      const opts = ["", ...COLORS];
      for (const c of opts) {
        row.append(
          el("button", {
            type: "button",
            class: `sw${(v ?? "") === c ? " on" : ""}${c ? "" : " none"}`,
            title: c || (inherit ? `Use type default (${inherit})` : "None"),
            style: c ? `background:var(--${c})` : inherit ? `background:var(--${inherit})` : "",
            onclick: () => changed(c || undefined, true),
          }, c ? "" : "↺")
        );
      }
      const custom = el("input", { type: "text", class: "small", placeholder: "or #hex", value: v && !COLORS.includes(v) ? v : "", onchange: (e) => changed(e.target.value || undefined, true) });
      row.append(custom);
      return wrap(f, row);
    }
    case "page": {
      const inp = el("input", { type: "text", list: ensurePageList(), value: v ?? "", placeholder: ph || "page id", onchange: (e) => changed(e.target.value.trim() || undefined, true) });
      const p = v && (ctx.index[v] || (v === "home" ? { t: "Home" } : null));
      const note = el("div", { class: `pagenote${v && !p ? " warn" : ""}` }, v ? (p ? `→ ${plain(p.t || p.title)}` : "No page with this id") : "");
      return wrap(f, inp, note);
    }
    case "file": {
      const inp = el("input", { type: "text", value: v ?? "", placeholder: ph || "URL or path, e.g. pdfs/665.pdf", oninput: (e) => changed(e.target.value.trim()) });
      const up = uploadButton(async (file) => {
        const r = await ctx.upload(file, {});
        if (r) {
          inp.value = r.url;
          changed(r.url);
        }
      });
      const open = el("a", { class: "btn tiny ghost", target: "_blank", rel: "noopener", onclick: (e) => (inp.value ? (e.currentTarget.href = ctx.assetUrl(inp.value)) : e.preventDefault()) }, "Open");
      return wrap(f, el("div", { class: "row" }, inp, up, open));
    }
    case "image": {
      const thumb = el("img", { class: "thumb", alt: "" });
      const show = (k) => {
        const u = ctx.images[k] || (k && /[/.]/.test(k) ? k : "");
        thumb.src = u ? ctx.assetUrl(u) : "";
        thumb.style.visibility = u ? "visible" : "hidden";
      };
      const inp = el("input", { type: "text", value: v ?? "", placeholder: ph || "image key", oninput: (e) => (changed(e.target.value.trim()), show(e.target.value.trim())) });
      const up = uploadButton(async (file) => {
        const r = await ctx.upload(file, { image: true, key: f.keyHint ? f.keyHint(obj) : "" });
        if (r?.key) {
          ctx.images[r.key] = r.url;
          inp.value = r.key;
          changed(r.key);
          show(r.key);
        }
      }, "image/*");
      show(v);
      return wrap(f, el("div", { class: "row" }, thumb, inp, up));
    }
    case "strings": {
      const list = Array.isArray(v) ? v.slice() : [];
      const box = el("div", { class: "strings" });
      const draw = () => {
        box.innerHTML = "";
        list.forEach((s, i) => {
          box.append(
            el("div", { class: "row" },
              el("input", { type: "text", value: s, oninput: (e) => ((list[i] = e.target.value), changed(list.slice())) }),
              el("button", { type: "button", class: "btn tiny ghost", title: "Remove", onclick: () => (list.splice(i, 1), changed(list.slice()), draw()) }, "✕"))
          );
        });
        box.append(el("button", { type: "button", class: "btn tiny", onclick: () => (list.push(""), changed(list.slice()), draw()) }, `+ ${f.addLabel || "Add"}`));
      };
      draw();
      return wrap(f, box);
    }
    case "list":
      return wrap(f, listEditor(obj, f, onChange));
    case "json": {
      const ta = el("textarea", { class: "code", rows: f.rows || 12, spellcheck: "false" }, v === undefined ? "" : JSON.stringify(v, null, 2));
      const err = el("div", { class: "err" });
      ta.addEventListener("input", () => {
        try {
          const nv = ta.value.trim() ? JSON.parse(ta.value) : undefined;
          err.textContent = "";
          changed(nv);
        } catch (e) {
          err.textContent = "Not valid JSON yet: " + e.message;
        }
      });
      return wrap(f, ta, err);
    }
    case "rich":
      return wrap(f, richEditor(v ?? "", (html) => changed(html)), null);
    default: {
      const inp = el("input", { type: "text", value: v ?? "", placeholder: ph || "", dir: f.dir || "auto", oninput: (e) => changed(e.target.value) });
      return wrap(f, inp);
    }
  }
}

function uploadButton(onFile, accept) {
  const input = el("input", { type: "file", accept: accept || null, style: "display:none" });
  const btn = el("button", { type: "button", class: "btn tiny", onclick: () => input.click() }, "Upload…");
  input.addEventListener("change", async () => {
    if (!input.files[0]) return;
    btn.disabled = true;
    btn.textContent = "Uploading…";
    try {
      await onFile(input.files[0]);
    } finally {
      btn.disabled = false;
      btn.textContent = "Upload…";
      input.value = "";
    }
  });
  return el("span", {}, btn, input);
}

function listEditor(obj, f, onChange) {
  const box = el("div", { class: "list" });
  const items = () => (obj[f.key] = obj[f.key] || []);
  const draw = (openIdx) => {
    box.innerHTML = "";
    const arr = items();
    arr.forEach((it, i) => {
      const body = el("div", { class: "li-body" });
      const head = el(
        "div",
        { class: "li-head" },
        el("button", { type: "button", class: "li-toggle", onclick: () => item.classList.toggle("open") }, el("span", { class: "li-n" }, String(i + 1)), el("span", { class: "li-sum" }, (f.summary ? f.summary(it, i) : "") || "(empty)")),
        el("span", { class: "li-tools" },
          ...(f.itemActions ? f.itemActions(it, () => (onChange(), draw(i))) : []),
          el("button", { type: "button", class: "btn tiny ghost", title: "Move up", disabled: i === 0, onclick: () => (arr.splice(i - 1, 0, arr.splice(i, 1)[0]), onChange(), draw(i - 1)) }, "▲"),
          el("button", { type: "button", class: "btn tiny ghost", title: "Move down", disabled: i === arr.length - 1, onclick: () => (arr.splice(i + 1, 0, arr.splice(i, 1)[0]), onChange(), draw(i + 1)) }, "▼"),
          el("button", { type: "button", class: "btn tiny ghost", title: "Duplicate", onclick: () => (arr.splice(i + 1, 0, structuredClone(it)), onChange(), draw(i + 1)) }, "⧉"),
          el("button", { type: "button", class: "btn tiny ghost danger", title: "Remove", onclick: () => confirm("Remove this item?") && (arr.splice(i, 1), onChange(), draw()) }, "✕"))
      );
      const item = el("div", { class: `li${openIdx === i ? " open" : ""}` }, head, body);
      const fields = typeof f.of === "function" ? f.of(it) : f.of;
      const redraw = () => renderForm(body, it, typeof f.of === "function" ? f.of(it) : f.of, () => {
        onChange();
        head.querySelector(".li-sum").textContent = (f.summary ? f.summary(it, i) : "") || "(empty)";
      });
      renderForm(body, it, fields, () => {
        onChange();
        head.querySelector(".li-sum").textContent = (f.summary ? f.summary(it, i) : "") || "(empty)";
      });
      item._redraw = redraw;
      box.append(item);
    });
    const add = f.addChoices
      ? (() => {
          const s = el("select", { class: "addsel", onchange: (e) => {
            if (!e.target.value) return;
            items().push(f.newItem(e.target.value));
            onChange();
            draw(items().length - 1);
          } }, el("option", { value: "" }, `+ ${f.addLabel || "Add"}…`), ...f.addChoices.map((c) => el("option", { value: c.value }, c.label)));
          return s;
        })()
      : el("button", { type: "button", class: "btn tiny", onclick: () => (items().push(f.newItem ? f.newItem() : {}), onChange(), draw(items().length - 1)) }, `+ ${f.addLabel || "Add item"}`);
    box.append(el("div", { class: "li-add" }, add, el("span", { class: "muted" }, ` ${arr.length} item${arr.length === 1 ? "" : "s"}`)));
  };
  draw();
  return box;
}

// ---------- rich text ----------
function richEditor(html, onChange) {
  const area = el("div", { class: "rich", contenteditable: "true", spellcheck: "true", html });
  const src = el("textarea", { class: "code", rows: 14, spellcheck: "false", style: "display:none" });
  const emit = () => onChange(area.innerHTML);
  area.addEventListener("input", emit);
  area.addEventListener("paste", (e) => {
    // paste as plain text so Word/Docs styling doesn't leak in
    e.preventDefault();
    const t = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, t);
  });
  src.addEventListener("input", () => onChange(src.value));
  const cmd = (c, arg) => () => {
    area.focus();
    document.execCommand(c, false, arg);
    emit();
  };
  const wrapBlock = (cls) => () => {
    area.focus();
    document.execCommand("formatBlock", false, "p");
    const sel = getSelection();
    let n = sel.anchorNode;
    while (n && n.parentNode !== area) n = n.parentNode;
    if (n && n.nodeType === 1) n.className = n.className === cls ? "" : cls;
    emit();
  };
  const tb = el(
    "div",
    { class: "tb" },
    el("button", { type: "button", title: "Bold", onclick: cmd("bold") }, el("b", {}, "B")),
    el("button", { type: "button", title: "Italic", onclick: cmd("italic") }, el("i", {}, "I")),
    el("button", { type: "button", title: "Paragraph", onclick: cmd("formatBlock", "p") }, "¶"),
    el("button", { type: "button", title: "Sub-heading", onclick: cmd("formatBlock", "h3") }, "H"),
    el("button", { type: "button", title: "Lead paragraph (large coloured intro)", onclick: wrapBlock("lead") }, "Lead"),
    el("button", { type: "button", title: "Bullet list", onclick: cmd("insertUnorderedList") }, "• List"),
    el("button", { type: "button", title: "Quote", onclick: cmd("formatBlock", "blockquote") }, "❝"),
    el("button", { type: "button", title: "Link", onclick: () => { const u = prompt("Link address (URL or file path):"); if (u) cmd("createLink", u)(); } }, "Link"),
    el("button", { type: "button", title: "Remove formatting", onclick: cmd("removeFormat") }, "Clear"),
    el("button", { type: "button", class: "srcbtn", title: "Edit the HTML directly", onclick: () => {
      const showing = src.style.display !== "none";
      if (showing) {
        area.innerHTML = src.value;
        src.style.display = "none";
        area.style.display = "";
      } else {
        src.value = area.innerHTML;
        src.style.display = "";
        area.style.display = "none";
      }
    } }, "</> HTML")
  );
  return el("div", { class: "richwrap" }, tb, area, src);
}
