// Everything the pages need, worked out once from the content files.
// Lists (feature pages, issue pages, grades, weeks) are never kept by hand:
// they come from each spread's `feature`, `issue` and `tags`.
import { getCollection, type CollectionEntry } from "astro:content";
import fs from "node:fs";

export type Spread = CollectionEntry<"spreads">;
export type Issue = CollectionEntry<"issues">;
export type Feature = CollectionEntry<"features">;
export type Campaign = CollectionEntry<"campaigns">;
export type Entry = Campaign["data"]["sections"][number]["entries"][number];

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, "/");
/** Link to a page of this site: url("issues/668/") */
export const url = (p = "") => BASE + String(p).replace(/^\//, "");
/** Uploaded files are stored as /uploads/…; old files are full https:// addresses. */
export const fileUrl = (u?: string) => (!u ? "" : u.startsWith("/uploads/") ? url(u) : u);
export const plain = (s = "") => String(s).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const COLORS: Record<string, string> = {
  navy: "#14265C", blue: "#1B4FD8", cyan: "#00A6CE", red: "#E11B2E", gold: "#F5B715",
  green: "#2F7D4F", orange: "#F07E17", teal: "#0E9B8E", purple: "#5B3FA8",
};
export const color = (c?: string) => (!c ? COLORS.navy : COLORS[c] || c);
const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
export { n as count };

let cache: Awaited<ReturnType<typeof load>> | null = null;
export async function site() {
  return (cache ??= await load());
}

async function load() {
  const spreads = (await getCollection("spreads")).filter((s) => !s.data.draft);
  const issues = await getCollection("issues");
  // keep the order the entries are written in features.yml / campaigns.yml
  const order = (f: string) => [...fs.readFileSync(f, "utf8").matchAll(/^- id: *"?([^"\n]+)"?/gm)].map((m) => m[1].trim());
  const inOrder = <T extends { id: string }>(list: T[], f: string) => { const o = order(f); return list.sort((a, b) => o.indexOf(a.id) - o.indexOf(b.id)); };
  const features = inOrder(await getCollection("features"), "./content/features.yml");
  const campaigns = inOrder(await getCollection("campaigns"), "./content/campaigns.yml");

  // a spread whose issue has no file yet still gets an issue page (number only)
  for (const s of spreads) {
    const no = s.data.issue;
    if (no != null && !issues.some((i) => i.data.number === no)) issues.push({ id: String(no), collection: "issues", data: { number: no } } as Issue);
  }
  const issueByNo = new Map(issues.map((i) => [i.data.number, i]));
  const featureById = new Map(features.map((f) => [f.id, f]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  for (const s of spreads) {
    if (!featureById.has(s.data.feature)) throw new Error(`content/spreads/${s.id}.md: feature "${s.data.feature}" is not in content/features.yml`);
  }
  // a feature deleted from features.yml is skipped in the campaign list (with a note in the build log)
  for (const c of campaigns) for (const sec of c.data.sections) for (const e of sec.entries) {
    const gone = e.show.features.filter((f) => !featureById.has(f));
    if (gone.length) console.warn(`content/campaigns.yml: ${c.id} › ${e.id} lists ${gone.join(", ")}, which is not in content/features.yml; skipped`);
    e.show.features = e.show.features.filter((f) => featureById.has(f));
  }

  const yearOf = (s: Spread) => (s.data.issue != null ? issueByNo.get(s.data.issue)?.data.year : undefined);
  const byIssue = (a: Spread, b: Spread) => (a.data.issue ?? 1e9) - (b.data.issue ?? 1e9) || plain(a.data.title).localeCompare(plain(b.data.title));
  spreads.sort(byIssue);

  /** Address of a spread: /issues/<n>/<name>/ (or /spreads/<name>/ without an issue). */
  const slugOf = (s: Spread) => (s.data.issue != null ? s.id.replace(new RegExp(`^${s.data.issue}-`), "") : s.id);
  const spreadUrl = (s: Spread) => (s.data.issue != null ? url(`issues/${s.data.issue}/${slugOf(s)}/`) : url(`spreads/${s.id}/`));

  const matches = (e: Entry, s: Spread) =>
    e.show.features.includes(s.data.feature) &&
    (e.show.year == null || yearOf(s) === e.show.year) &&
    (e.show.tag == null || (s.data.tags || []).includes(e.show.tag));
  const spreadsOf = (e: Entry) => spreads.filter((s) => matches(e, s));

  // entries a spread belongs to (for the links on a spread page)
  const entriesOf = (s: Spread) =>
    campaigns.flatMap((c) => c.data.sections.flatMap((sec) => sec.entries.filter((e) => matches(e, s)).map((e) => ({ campaign: c, section: sec.name, entry: e }))));

  const entryName = (e: Entry, section: string) => (/^\d{4}$/.test(e.title) ? `${section} ${e.title}` : e.title);
  const entryUrl = (c: Campaign, e: Entry) => url(`campaigns/${c.id}/${e.id}/`);

  // grades
  const grades = new Map<number, { label: string; items: { campaign: Campaign; section: string; entry: Entry }[] }>();
  for (const c of campaigns) for (const sec of c.data.sections) for (const e of sec.entries) {
    if (!e.grade) continue;
    const g = parseInt(e.grade);
    if (!grades.has(g)) grades.set(g, { label: e.grade, items: [] });
    grades.get(g)!.items.push({ campaign: c, section: sec.name, entry: e });
  }

  // issues, newest first
  const issueList = [...issues].sort((a, b) => b.data.number - a.data.number);
  const spreadsInIssue = (no: number) => spreads.filter((s) => s.data.issue === no);

  // weeks (parshiyos and yamim tovim)
  const weeks = new Map<string, Issue[]>();
  for (const i of issueList) if (i.data.week) { if (!weeks.has(i.data.week)) weeks.set(i.data.week, []); weeks.get(i.data.week)!.push(i); }

  const feat = (s: Spread) => featureById.get(s.data.feature)!;
  /** A spread's display values: its own, else its feature's. */
  const look = (s: Spread) => {
    const f = feat(s).data;
    return {
      kick: s.data.kick ?? f.kick ?? "",
      ribbon: s.data.ribbon ?? f.ribbon ?? f.name,
      color: color(s.data.ribbonColor ?? f.color),
      mission: s.data.mission ?? f.mission ?? "",
      missionColor: color(s.data.missionColor ?? s.data.ribbonColor ?? f.color),
      leadColor: color(s.data.leadColor ?? s.data.ribbonColor ?? f.color),
    };
  };
  const issueLabel = (i?: Issue) => (i ? [i.data.week, i.data.date].filter(Boolean).join(" · ") : "");

  return {
    spreads, issues: issueList, features, campaigns, issueByNo, featureById, campaignById,
    yearOf, slugOf, spreadUrl, spreadsOf, entriesOf, entryName, entryUrl, grades, spreadsInIssue, weeks, feat, look, issueLabel, matches,
  };
}
