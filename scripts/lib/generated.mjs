// Pages the build makes by itself from content/data/campaign-index.json and the
// spreads' "issue" and "features" fields:
//
//   wh                 Weekly Hachayol: every campaign, plus the other ways in
//   wh-c-<campaign>    a campaign: its sections and features
//   wh-f-<feature>     a feature: every spread drawn with its shell
//   wh-grades          grade list;  wh-g-<n>  the features for one grade
//   hachayol           every Hachayol issue;  h<number>  the spreads in one issue
//
// To hand-design one of these pages instead, save a page with the same id in
// content/pages/; a real page always wins over a generated one.
import { stripTags } from "../../public/js/render.js";

const plain = (s) => stripTags(s).replace(/\s+/g, " ").trim();
const n = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
/** A feature named only by a year ("5785") reads better with its section in front. */
export const featureName = (f) => (/^\d{4}$/.test(f.title) ? `${f.section} ${f.title}` : f.title);

/** Flatten the index: features by id, with campaign/section context. ref entries reuse a feature. */
export function indexFeatures(idx) {
  const features = {};
  for (const c of idx.campaigns || [])
    for (const s of c.sections || [])
      for (const f of s.features || [])
        if (f.id) features[f.id] = { ...f, campaign: c, section: s.name };
  return features;
}

function spreadLine(p) {
  const a = p.article || {};
  const src = plain(a.source || "").replace(/^Source:\s*/, "");
  const when = /^Parshas|^\d/.test(src) ? src.split(" · ").slice(0, 2).join(" · ") : (a.chips || []).slice(0, 2).map(plain).join(" · ");
  return [p.issue ? `Hachayol #${p.issue}` : "", when].filter(Boolean).join(" · ");
}

function issueYear(spreads) {
  const votes = {};
  for (const p of spreads) {
    const m = plain([p.article?.source, ...(p.article?.chips || [])].join(" ")).match(/57\d\d/);
    if (m) votes[m[0]] = (votes[m[0]] || 0) + 1;
  }
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function issueWhen(spreads) {
  for (const p of spreads) {
    const src = plain(p.article?.source || "").replace(/^Source:\s*/, "");
    if (/^Parshas/.test(src)) return src.split(" · ")[0];
  }
  return "";
}

export function generatePages(pages, idx, types) {
  const out = {};
  const add = (p) => { if (!pages[p.id]) out[p.id] = { branch: "wh", template: "hub", type: "hub", generated: true, ...p }; };
  const features = indexFeatures(idx);
  const spreads = Object.values(pages).filter((p) => p.template === "article" && !p.draft);
  const byFeature = {};
  for (const p of spreads) for (const f of p.features || []) (byFeature[f] ||= []).push(p);
  const sortIssue = (a, b) => (a.issue ?? 1e9) - (b.issue ?? 1e9) || plain(a.title).localeCompare(plain(b.title));
  const meta = (f) => [f.grade, f.part, n((byFeature[f.id] || []).length, "spread")].filter(Boolean).join(" · ");

  // ----- Weekly Hachayol home -----
  add({
    id: "wh", parent: "home", crumbLabel: "Weekly Hachayol", title: "Weekly Hachayol",
    blocks: [
      { type: "heading", eyebrow: "Browse", title: "Weekly Hachayol", text: "Every campaign, feature and spread. Open a campaign, pick a grade, or go by Hachayol issue." },
      { type: "tiles", items: (idx.campaigns || []).map((c) => {
        const fs = c.sections.flatMap((s) => s.features.map((f) => features[f.id || f.ref]));
        const k = fs.reduce((t, f) => t + (byFeature[f?.id] || []).length, 0);
        return { page: `wh-c-${c.id}`, color: c.color, kicker: n(c.sections.length, "section"), title: c.name, text: `${n(fs.length, "feature")}${k ? ` · ${n(k, "spread")}` : ""}` };
      }) },
      { type: "label", text: "Other ways in", spaced: true },
      { type: "links", items: [
        { page: "wh-grades", title: "By grade", text: "Every feature for one class, 1st through 7th grade." },
        { page: "hachayol", title: "By Hachayol issue", text: "Each weekly issue with all of its spreads." },
        { page: "campaign", title: "Campaign hubs", text: "The campaign pages with filters and tabs." },
      ] },
    ],
  });

  // ----- campaigns and features -----
  for (const c of idx.campaigns || []) {
    add({
      id: `wh-c-${c.id}`, parent: "wh", crumbLabel: c.name, title: c.name,
      blocks: [
        { type: "heading", eyebrow: "Weekly Hachayol", title: c.name, text: c.sections.map((s) => s.name).join(" · ") },
        ...c.sections.flatMap((s) => [
          { type: "label", text: s.name, spaced: true },
          { type: "links", items: s.features.map((x) => features[x.id || x.ref]).filter(Boolean).map((f) => ({ page: `wh-f-${f.id}`, title: f.title, text: meta(f) })) },
        ]),
      ],
    });
  }
  for (const f of Object.values(features)) {
    const list = (byFeature[f.id] || []).sort(sortIssue);
    const shell = types[f.shell]?.label || f.shell;
    const blocks = [{ type: "heading", eyebrow: `${f.campaign.name} · ${f.section}`, title: featureName(f), text: [f.grade, f.part, `Shell: ${shell}`].filter(Boolean).join(" · ") }];
    if (list.length) blocks.push({ type: "links", items: list.map((p) => ({ page: p.id, title: plain(p.title), text: spreadLine(p) })) });
    else blocks.push({ type: "note", html: `<b>No spreads yet.</b> Add one as a page of type <i>${shell}</i> with <code>"features": ["${f.id}"]</code> and its Hachayol <code>"issue"</code> number.` });
    add({ id: `wh-f-${f.id}`, parent: `wh-c-${f.campaign.id}`, crumbLabel: featureName(f), title: featureName(f), blocks });
  }

  // ----- grades -----
  const grades = {};
  for (const f of Object.values(features)) if (f.grade) (grades[parseInt(f.grade)] ||= { label: f.grade, list: [] }).list.push(f);
  const gkeys = Object.keys(grades).map(Number).sort((a, b) => a - b);
  add({
    id: "wh-grades", parent: "wh", crumbLabel: "By grade", title: "By grade",
    blocks: [
      { type: "heading", eyebrow: "Weekly Hachayol", title: "By grade", text: "Features assigned to a grade, across every campaign." },
      { type: "links", items: gkeys.map((g) => ({ page: `wh-g-${g}`, title: grades[g].label, text: n(grades[g].list.length, "feature") })) },
    ],
  });
  for (const g of gkeys) {
    const camps = (idx.campaigns || []).map((c) => [c, grades[g].list.filter((f) => f.campaign.id === c.id)]).filter(([, l]) => l.length);
    add({
      id: `wh-g-${g}`, parent: "wh-grades", crumbLabel: grades[g].label, title: grades[g].label,
      blocks: [
        { type: "heading", eyebrow: "By grade", title: grades[g].label, text: `${n(grades[g].list.length, "feature")} in ${n(camps.length, "campaign")}` },
        ...camps.flatMap(([c, l]) => [
          { type: "label", text: c.name, spaced: true },
          { type: "links", items: l.map((f) => ({ page: `wh-f-${f.id}`, title: featureName(f), text: [f.section, n((byFeature[f.id] || []).length, "spread")].join(" · ") })) },
        ]),
      ],
    });
  }

  // ----- Hachayol issues -----
  const issues = {};
  for (const p of spreads) if (p.issue != null) (issues[p.issue] ||= []).push(p);
  const nums = Object.keys(issues).map(Number).sort((a, b) => b - a);
  const years = {};
  for (const k of nums) (years[issueYear(issues[k]) || "Other"] ||= []).push(k);
  add({
    id: "hachayol", parent: "wh", crumbLabel: "Hachayol issues", title: "Hachayol issues",
    blocks: [
      { type: "heading", eyebrow: "Weekly Hachayol", title: "Hachayol issues", text: `${n(nums.length, "issue")}, newest first. Each issue page groups every spread printed in it.` },
      ...Object.keys(years).sort((a, b) => (a === "Other") - (b === "Other") || b.localeCompare(a)).flatMap((y) => [
        { type: "label", text: y === "Other" ? "Year not marked" : `Year ${y}`, spaced: true },
        { type: "links", items: years[y].map((k) => ({ page: `h${k}`, title: `Hachayol #${k}`, text: [issueWhen(issues[k]), n(issues[k].length, "spread")].filter(Boolean).join(" · ") })) },
      ]),
    ],
  });
  for (const k of nums) {
    const list = issues[k];
    const groups = {};
    for (const p of list) {
      const f = (p.features || []).map((id) => features[id]).find(Boolean);
      const label = f ? `${f.campaign.name} · ${/^\d{4}$/.test(f.title) ? f.section : f.title}` : types[p.type]?.label || p.type;
      (groups[label] ||= []).push(p);
    }
    const pdf = list.map((p) => p.article?.pdf).find((u) => u && new RegExp(`(^|/)${k}\\.pdf$`).test(u));
    const i = nums.indexOf(k);
    const blocks = [{ type: "heading", eyebrow: "Hachayol", title: `Hachayol #${k}`, text: [issueWhen(list), issueYear(list), n(list.length, "spread")].filter(Boolean).join(" · ") }];
    if (pdf) blocks.push({ type: "hachayolbar", href: pdf, info: `Issue #${k}` });
    for (const [label, ps] of Object.entries(groups).sort()) {
      blocks.push({ type: "label", text: label, spaced: true });
      blocks.push({ type: "links", items: ps.sort(sortIssue).map((p) => ({ page: p.id, title: plain(p.title), text: types[p.type]?.label || "" })) });
    }
    const near = [nums[i + 1], nums[i - 1]].filter((x) => x != null);
    if (near.length) {
      blocks.push({ type: "label", text: "Other issues", spaced: true });
      blocks.push({ type: "links", items: near.map((x) => ({ page: `h${x}`, title: `${x < k ? "← " : ""}Hachayol #${x}${x > k ? " →" : ""}`, text: n(issues[x].length, "spread") })) });
    }
    add({ id: `h${k}`, parent: "hachayol", crumbLabel: `#${k}`, title: `Hachayol #${k}`, blocks });
  }
  return out;
}
