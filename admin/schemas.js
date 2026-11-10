// Field definitions for every editable thing: page settings, article fields,
// each block type, page types, and the site data tables.
import { ctx, el } from "./fields.js";

const plain = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
const typeDefault = (k) => (o, page) => ctx.currentType?.defaults?.[k];
export const branchOptions = () => (ctx.nav || []).filter((b) => !["marking", "calendar"].includes(b.id)).map((b) => ({ value: b.id, label: b.label }));

export const pageFields = [
  { key: "title", label: "Title", kind: "text", wide: true, help: "Shown as the page heading. Small HTML like <em> is allowed." },
  {
    key: "type", label: "Page type", kind: "select", rerender: true, required: true,
    options: () => {
      const groups = {};
      for (const [id, t] of Object.entries(ctx.types)) (groups[t.group || "Other"] = groups[t.group || "Other"] || []).push({ value: id, label: t.label });
      return Object.entries(groups).map(([g, items]) => ({ group: g, items }));
    },
    help: "The type supplies defaults (kicker, ribbon, mission) and decides which fields appear.",
  },
  { key: "draft", label: "Draft — hidden from the published site", kind: "bool" },
  {
    kind: "group", label: "Where it sits", of: [
      { key: "branch", label: "Branch", kind: "select", options: branchOptions, help: "Which top-menu tab lights up." },
      { key: "parent", label: "Parent page", kind: "page", help: "The Back button and breadcrumb trail come from this." },
      { key: "crumbLabel", label: "Breadcrumb label", kind: "text", placeholder: (o) => plain(o.title), help: "Short name used in breadcrumbs and Back buttons." },
      { key: "backLabel", label: "Back button text", kind: "text", placeholder: "parent's breadcrumb label" },
      { key: "altParent", label: "Campaign parent (optional)", kind: "page", help: "If set, visitors arriving from the Campaign branch see a breadcrumb through this page instead." },
      { key: "altBranch", label: "Campaign parent's branch", kind: "select", options: branchOptions, placeholder: "campaign", when: (o) => o.altParent },
      { key: "altBackLabel", label: "Campaign Back text", kind: "text", when: (o) => o.altParent },
    ],
  },
];

export const articleFields = [
  { key: "kick", label: "Kicker (small line above the ribbon)", kind: "text", placeholder: typeDefault("kick") },
  { key: "ribbon", label: "Ribbon label", kind: "text", placeholder: typeDefault("ribbon") },
  { key: "ribbonColor", label: "Ribbon colour", kind: "color", placeholder: typeDefault("ribbonColor") },
  { key: "titleHeb", label: "Title is in Hebrew (right-to-left)", kind: "bool" },
  { key: "hebbig", label: "Large Hebrew line above the title", kind: "text", dir: "rtl" },
  { key: "subtitle", label: "Subtitle under the title", kind: "text" },
  { key: "chips", label: "Tags (chips)", kind: "strings", addLabel: "Add tag" },
  {
    key: "pages", label: "Page images", kind: "list", addLabel: "Add page image",
    help: "Scans of the printed pages, in order. Upload a picture or type an existing image key.",
    summary: (k) => k?.value || "", newItem: () => ({ value: "" }),
    of: [{ key: "value", label: "Image", kind: "image", keyHint: () => ctx.currentPageId }],
    wrapStrings: true,
  },
  { key: "pdf", label: "Printable PDF", kind: "file" },
  { key: "pdfLabel", label: "PDF button text", kind: "text", placeholder: "Print PDF", when: (o) => o.pdf },
  { key: "olderPdfs", label: "‘Older PDFs’ button — issue number", kind: "text", help: "Shows older-year PDFs listed under this issue in Site data → Older PDFs." },
  {
    key: "media", label: "Audio / video links", kind: "list", addLabel: "Add audio or video",
    summary: (m) => plain(m.label), newItem: () => ({ label: "🎧 ", href: "" }),
    of: [{ key: "label", label: "Label", kind: "text" }, { key: "href", label: "File", kind: "file" }],
  },
  {
    key: "sichos", label: "Sichos this piece is built on", kind: "list", addLabel: "Add sicha PDF",
    summary: (m) => plain(m.label), newItem: () => ({ label: "Sicha 1", href: "" }),
    of: [{ key: "label", label: "Label", kind: "text" }, { key: "href", label: "PDF", kind: "file" }],
  },
  { key: "body", label: "Text", kind: "rich", wide: true },
  { key: "leadColor", label: "Lead paragraph colour", kind: "color", placeholder: (o) => o.ribbonColor || ctx.currentType?.defaults?.ribbonColor },
  {
    key: "related", label: "Related links box", kind: "group", of: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "headingHeb", label: "…or Hebrew/Yiddish heading", kind: "text", dir: "rtl" },
      { key: "headingEn", label: "…with English heading", kind: "text" },
      {
        key: "items", label: "Links", kind: "list", addLabel: "Add link",
        summary: (m) => plain(m.title), newItem: () => ({ icon: "📖", title: "", sub: "" }),
        of: [{ key: "icon", label: "Icon (emoji)", kind: "text" }, { key: "title", label: "Title", kind: "text" }, { key: "sub", label: "Description", kind: "text" }, { key: "href", label: "Link (leave empty for ‘coming soon’)", kind: "file" }],
      },
      { key: "note", label: "Note under the links", kind: "text" },
    ],
  },
  { key: "mission", label: "Mission", kind: "text", placeholder: typeDefault("mission") },
  { key: "missionColor", label: "Mission colour", kind: "color", placeholder: (o) => o.ribbonColor || ctx.currentType?.defaults?.ribbonColor },
  { key: "source", label: "Source line", kind: "text", placeholder: "Source: Parshas … · date" },
  { key: "sample", label: "Mark as sample content", kind: "bool" },
];

// ---------- blocks ----------
const pageSummary = (id) => (id ? plain(ctx.index[id]?.t || id) : "");

export const cardFields = (c) => [
  { key: "variant", label: "Card style", kind: "select", rerender: true, options: [{ value: "", label: "Link card" }, { value: "empty", label: "Placeholder (‘awaiting issue’)" }] },
  ...(c.variant === "empty"
    ? [
        { key: "ribbon", label: "Ribbon", kind: "text" },
        { key: "ribbonColor", label: "Ribbon colour", kind: "color" },
        { key: "kick", label: "Kicker", kind: "text" },
        { key: "heading", label: "Heading", kind: "text" },
        { key: "text", label: "Text", kind: "text" },
        { key: "pill", label: "Status pill", kind: "text" },
        { key: "go", label: "Right-hand note", kind: "text" },
      ]
    : [
        { key: "page", label: "Opens page", kind: "page" },
        { key: "img", label: "Thumbnail image", kind: "image" },
        { key: "imgZoom", label: "Clicking the thumbnail opens it full screen", kind: "bool" },
        { key: "color", label: "Card accent colour", kind: "color" },
        { key: "kick", label: "Kicker", kind: "text" },
        { key: "ribbon", label: "Ribbon", kind: "text" },
        { key: "ribbonColor", label: "Ribbon colour", kind: "color" },
        { key: "icon", label: "Mission icon (image URL; empty = tick)", kind: "file" },
        { key: "missionLabel", label: "Mission label", kind: "text", placeholder: "Mission" },
        { key: "mission", label: "Mission text", kind: "text" },
        { key: "go", label: "Footer link text", kind: "text", placeholder: "Open →" },
        { key: "extraClass", label: "Extra CSS classes", kind: "text", help: "hkcard / mvcard make the card respond to filter buttons; tp-lb opens a picture instead of a page." },
        { key: "attrs", label: "Filter tags & other attributes", kind: "json", rows: 3, help: 'e.g. {"data-hk": "indecision ohel"} or {"data-mv": "lulav"}' },
      ]),
];

/** Copy what a card shows from the page it links to. */
export function fillCardFromPage(card, page, types) {
  const t = types[page.type] || {};
  const a = { ...(t.defaults || {}), ...(page.article || {}) };
  card.page = page.id;
  if (page.template === "article") {
    card.kick = a.kick;
    card.ribbon = a.ribbon;
    card.ribbonColor = a.ribbonColor;
    card.mission = a.mission;
    if (a.pages?.[0]) card.img = a.pages[0];
  } else {
    card.ribbon = page.crumbLabel || page.title;
  }
  for (const k of Object.keys(card)) if (card[k] == null) delete card[k];
}

export const BLOCKS = {
  heading: { label: "Heading", summary: (b) => plain(b.title), fields: [
    { key: "eyebrow", label: "Small label above", kind: "text" },
    { key: "title", label: "Heading", kind: "text" },
    { key: "heb", label: "Heading is Hebrew", kind: "bool" },
    { key: "text", label: "Intro sentence", kind: "textarea" },
  ] },
  cards: { label: "Cards", summary: (b) => `${(b.items || []).length} cards`, fields: [
    { key: "items", label: "Cards", kind: "list", addLabel: "Add card", of: cardFields, newItem: () => ({ color: "purple", ribbonColor: "purple" }),
      summary: (c) => [plain(c.ribbon), pageSummary(c.page) || plain(c.heading)].filter(Boolean).join(" — "),
      itemActions: (c, redraw) => c.page && ctx.pages ? [el("button", { type: "button", class: "btn tiny ghost", title: "Copy kicker, ribbon, mission and thumbnail from the linked page", onclick: async () => {
        const p = await ctx.pages(c.page);
        if (p) fillCardFromPage(c, p, ctx.types), redraw();
      } }, "Fill from page")] : [] },
    { key: "extraClass", label: "Extra classes", kind: "text", help: "mvgrid / mvgrid off when the cards sit inside a tab." },
    { key: "attrs", label: "Attributes", kind: "json", rows: 2, help: 'Tab panels need an id, e.g. {"id": "mvg0"}' },
  ] },
  links: { label: "Link list", summary: (b) => `${(b.items || []).length} links`, fields: [
    { key: "rtl", label: "Right-to-left (Hebrew)", kind: "bool" },
    { key: "items", label: "Links", kind: "list", addLabel: "Add link", newItem: () => ({}), summary: (it) => plain(it.title), of: [
      { key: "page", label: "Opens page", kind: "page" },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Description", kind: "text" },
      { key: "sched", label: "…or opens schedule", kind: "text", help: "weekly, mivtza, or an event category from Site data → Schedule" },
      { key: "badge", label: "Badge", kind: "text" },
      { key: "static", label: "Not clickable", kind: "bool" },
      { key: "attrs", label: "Attributes", kind: "json", rows: 2 },
    ] },
  ] },
  gallery: { label: "Page images + PDF", summary: (b) => `${(b.images || []).length} images${b.panel ? ` · tab ${b.panel}` : ""}`, fields: [
    { key: "images", label: "Images", kind: "list", addLabel: "Add image", newItem: () => ({ img: "", alt: "" }), summary: (i) => i.img, of: [
      { key: "img", label: "Image", kind: "image" }, { key: "alt", label: "Description", kind: "text" },
    ] },
    { key: "pdf", label: "PDF", kind: "file" },
    { key: "pdfLabel", label: "PDF button text", kind: "text", placeholder: "Print PDF" },
    { key: "panel", label: "Tab panel id", kind: "text", help: "Must match a tab in a Tabs block above." },
    { key: "hidden", label: "Hidden until its tab is picked", kind: "bool" },
  ] },
  tabs: { label: "Tabs", summary: (b) => (b.items || []).map((t) => plain(t.label)).join(" | "), fields: [
    { key: "items", label: "Tabs", kind: "list", addLabel: "Add tab", newItem: () => ({ panel: "", label: "" }), summary: (t) => plain(t.label), of: [
      { key: "label", label: "Label", kind: "text" }, { key: "panel", label: "Shows panel id", kind: "text" }, { key: "on", label: "Selected at first", kind: "bool" },
    ] },
  ] },
  filters: { label: "Filter buttons", summary: (b) => `${(b.items || []).length} filters`, fields: [
    { key: "mode", label: "Filters", kind: "select", options: [{ value: "hk", label: "cards by tag (data-hk)" }, { value: "mv", label: "cards by category (data-mv)" }] },
    { key: "label", label: "Label in front", kind: "text" },
    { key: "items", label: "Buttons", kind: "list", addLabel: "Add button", newItem: () => ({ key: "", label: "" }), summary: (t) => plain(t.label), of: [
      { key: "label", label: "Label", kind: "text" }, { key: "key", label: "Tag (* = show all)", kind: "text" }, { key: "pressed", label: "Pressed at first", kind: "bool" },
    ] },
  ] },
  label: { label: "Small heading", summary: (b) => plain(b.text), fields: [
    { key: "text", label: "Text", kind: "text" }, { key: "heb", label: "Hebrew style", kind: "bool" }, { key: "spaced", label: "Extra space above", kind: "bool" }, { key: "attrs", label: "Attributes", kind: "json", rows: 2 },
  ] },
  note: { label: "Note box", summary: (b) => plain(b.html).slice(0, 60), fields: [{ key: "html", label: "Text (first <b>…</b> is the bold title)", kind: "textarea", rows: 3 }] },
  hachayolbar: { label: "Hachayol PDF bar", summary: (b) => plain(b.info), fields: [
    { key: "href", label: "Magazine PDF", kind: "file" }, { key: "info", label: "Text", kind: "text", placeholder: "Hachayol #665 · Parshas Bereishis · 28 Tishrei 5787" }, { key: "action", label: "Button text", kind: "text", placeholder: "Printable PDF ↗" },
  ] },
  tiles: { label: "Big tiles (home)", summary: (b) => `${(b.items || []).length} tiles`, fields: [
    { key: "items", label: "Tiles", kind: "list", addLabel: "Add tile", newItem: () => ({ color: "navy" }), summary: (t) => plain(t.title), of: [
      { key: "page", label: "Opens", kind: "page" }, { key: "color", label: "Colour", kind: "color" }, { key: "kicker", label: "Kicker", kind: "text" }, { key: "title", label: "Title", kind: "text" }, { key: "text", label: "Text", kind: "text" },
    ] },
  ] },
  branches: { label: "Section cards with icons", summary: (b) => `${(b.items || []).length} sections`, fields: [
    { key: "items", label: "Sections", kind: "list", addLabel: "Add section", newItem: () => ({ color: "purple" }), summary: (t) => plain(t.title), of: [
      { key: "page", label: "Opens", kind: "page" }, { key: "color", label: "Colour", kind: "color" }, { key: "icon", label: "Icon", kind: "file" }, { key: "title", label: "Title", kind: "text" }, { key: "text", label: "Text", kind: "text" },
    ] },
  ] },
  dates: { label: "Rally dates", summary: (b) => `${(b.items || []).length} dates`, fields: [
    { key: "items", label: "Dates", kind: "list", addLabel: "Add date", newItem: () => ({ page: "rally" }), summary: (t) => `${plain(t.title)} — ${plain(t.text)}`, of: [
      { key: "title", label: "Date", kind: "text" }, { key: "text", label: "Occasion", kind: "text" }, { key: "page", label: "Opens page", kind: "page" }, { key: "suggested", label: "Suggested", kind: "bool" },
    ] },
  ] },
  html: { label: "Custom HTML", summary: (b) => plain(b.html).slice(0, 70) || "(empty)", fields: [{ key: "html", label: "HTML", kind: "code", rows: 14, help: "Kept exactly as written. Used for one-off layouts like the month calendars." }] },
};

// ---------- page types ----------
export const typeFields = [
  { key: "label", label: "Name", kind: "text" },
  { key: "group", label: "Group in menus", kind: "text", placeholder: "Articles" },
  { key: "template", label: "Layout", kind: "select", required: true, options: [{ value: "article", label: "Article (one piece of content)" }, { value: "hub", label: "Section page (blocks)" }] },
  { key: "description", label: "Notes for editors", kind: "textarea" },
  {
    kind: "group", key: "defaults", label: "Defaults every page of this type inherits", when: (t) => t.template === "article",
    help: "A page that leaves one of these empty shows the value here — so changing it here updates every such page at once.",
    of: [
      { key: "kick", label: "Kicker", kind: "text" },
      { key: "ribbon", label: "Ribbon", kind: "text" },
      { key: "ribbonColor", label: "Ribbon colour", kind: "color" },
      { key: "mission", label: "Mission", kind: "text" },
    ],
  },
  {
    kind: "group", key: "newPage", label: "Starting values for new pages", of: [
      { key: "branch", label: "Branch", kind: "select", options: branchOptions },
      { key: "parent", label: "Parent page", kind: "page" },
      { key: "altParent", label: "Campaign parent", kind: "page" },
      { key: "cardOn", label: "Offer to add a card on", kind: "page", help: "When someone creates a page of this type, offer to add a card for it on this page." },
    ],
  },
  { key: "blocks", label: "Starting blocks for new section pages", kind: "json", rows: 8, when: (t) => t.template === "hub" },
];

// ---------- site data ----------
export const settingsFields = [
  { key: "siteName", label: "Site name", kind: "text" },
  { key: "tagline", label: "Tagline", kind: "text" },
  { kind: "group", label: "Hosting", of: [
    { key: "legacyBase", label: "Where old files live (published site)", kind: "text", placeholder: "leave empty when the site is in /resources/ on the main server", help: "If you host this site somewhere other than the main server, put the main server's resources address here, e.g. https://www.example.org/resources/. Old PDFs, images and the logo are then loaded from there." },
    { key: "previewLegacyBase", label: "Where old files live (admin preview)", kind: "text", placeholder: "https://www.example.org/resources/", help: "Same, for the preview inside this admin. Usually the main server's address." },
    { key: "apiBase", label: "Login & promotions service folder", kind: "text", placeholder: "/resources/" },
    { key: "requireLogin", label: "Require login (checkAuth.php)", kind: "bool" },
    { key: "loginRedirect", label: "Send logged-out visitors to", kind: "text" },
  ] },
  { kind: "group", key: "defaultUser", label: "Name shown when nobody is logged in", of: [
    { key: "name", label: "Name", kind: "text" }, { key: "role", label: "Role", kind: "text" }, { key: "initials", label: "Initials", kind: "text" },
  ] },
  { kind: "group", label: "Live features", of: [
    { key: "calendarUrl", label: "Calendar app address", kind: "text" },
    { key: "calendarLabel", label: "Calendar label", kind: "text", placeholder: "Tzivos Hashem Calendar 5787" },
    { key: "calendarBlurb", label: "Calendar intro", kind: "text" },
    { key: "newsFeedUrl", label: "Chitas news feed", kind: "text" },
    { key: "newsPageUrl", label: "News page", kind: "text" },
    { key: "logo", label: "Logo", kind: "file" },
    { key: "missionTick", label: "Mission tick icon", kind: "file" },
  ] },
];

export const navFields = [
  { key: "items", label: "Top menu", kind: "list", addLabel: "Add tab", newItem: () => ({ id: "", label: "" }), summary: (b) => `${b.label} → ${b.id}`, of: [
    { key: "label", label: "Label", kind: "text" }, { key: "id", label: "Opens page (or marking / calendar)", kind: "page" },
  ] },
];

export const scheduleFields = [
  { key: "weekly", label: "Weekly workflow", kind: "list", addLabel: "Add day", newItem: () => ({ day: "", task: "" }), summary: (r) => `${r.day}: ${r.task}`, of: [{ key: "day", label: "Day", kind: "text" }, { key: "task", label: "Task", kind: "text" }] },
  { key: "mivtzaOfMonth", label: "Mivtza of the month", kind: "list", addLabel: "Add month", newItem: () => ({ month: "", mivtza: "" }), summary: (r) => `${r.month}: ${r.mivtza}`, of: [{ key: "month", label: "Month", kind: "text" }, { key: "mivtza", label: "Mivtza", kind: "text" }] },
  { key: "categories", label: "Event categories", kind: "list", addLabel: "Add category", newItem: () => ({ id: "", label: "" }), summary: (r) => `${r.label} (${r.id})`, of: [{ key: "id", label: "Code", kind: "text" }, { key: "label", label: "Name", kind: "text" }, { key: "icon", label: "Icon", kind: "file" }] },
  { key: "events", label: "Events", kind: "list", addLabel: "Add event", newItem: () => ({ iso: "", hd: "", cat: "", label: "" }), summary: (e) => `${e.iso} · ${e.cat} · ${e.label}`, of: [
    { key: "iso", label: "Date (YYYY-MM-DD)", kind: "text" }, { key: "hd", label: "Hebrew date (Month-Day, e.g. Elul-17)", kind: "text" }, { key: "cat", label: "Category code", kind: "text" }, { key: "label", label: "What", kind: "text" },
  ] },
];

export const olderFields = [
  { key: "issues", label: "Older-year PDFs by issue", kind: "list", addLabel: "Add issue", newItem: () => ({ issue: "", files: [] }), summary: (r) => `#${r.issue} · ${(r.files || []).length} files`, of: [
    { key: "issue", label: "Issue number", kind: "text" },
    { key: "files", label: "Files", kind: "list", addLabel: "Add file", newItem: () => ({ label: "", href: "" }), summary: (f) => f.label, of: [{ key: "label", label: "Label", kind: "text" }, { key: "href", label: "PDF", kind: "file" }] },
  ] },
];

export const toolFields = [
  { key: "items", label: "Mission Marking tools", kind: "list", addLabel: "Add tool", newItem: () => ({ name: "", src: "", desc: "", color: "var(--navy)", path: "" }), summary: (t) => t.name, of: [
    { key: "name", label: "Name", kind: "text" }, { key: "desc", label: "Description", kind: "text" }, { key: "src", label: "Address", kind: "text" }, { key: "color", label: "Colour (CSS)", kind: "text" }, { key: "path", label: "Icon (SVG path)", kind: "textarea" },
  ] },
];
