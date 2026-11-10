// The shape of every piece of content. If a file is missing a required field or
// names a feature/issue that doesn't exist, the build stops and says which file.
import { defineCollection } from "astro:content";
import { glob, file } from "astro/loaders";
import { z } from "astro/zod";

// The browser editor may save an empty field as "" or null; treat that as "not set".
const blank = (v: unknown) => (v === null || v === "" ? undefined : v);
const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess(blank, t.optional());
const list = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v == null || v === "" ? [] : v), z.array(t));
const link = z.object({ label: z.string(), href: z.string() });

const spreads = defineCollection({
  loader: glob({ pattern: "*.md", base: "./content/spreads" }),
  schema: z.object({
    title: z.string(),
    feature: z.string(),
    issue: opt(z.coerce.number().int()),
    draft: opt(z.boolean()),
    // shown on the spread
    chips: opt(z.array(z.string())),
    pages: list(z.string()),
    pdf: opt(z.string()),
    pdfLabel: opt(z.string()),
    media: opt(z.array(link)),
    sichos: opt(z.array(link)),
    sichosLabel: opt(z.string()),
    related: opt(z.object({
      heading: opt(z.string()), headingHeb: opt(z.string()), headingEn: opt(z.string()),
      items: z.array(z.object({ icon: opt(z.string()), title: z.string(), sub: opt(z.string()), href: opt(z.string()) })).default([]),
      note: opt(z.string()),
    })),
    source: opt(z.string()),
    subtitle: opt(z.string()),
    hebbig: opt(z.string()),
    titleHeb: opt(z.boolean()),
    altBase: opt(z.string()),
    olderPdfs: opt(z.string()),
    // override the feature's defaults for this spread only
    kick: opt(z.string()),
    ribbon: opt(z.string()),
    ribbonColor: opt(z.string()),
    mission: opt(z.string()),
    missionColor: opt(z.string()),
    leadColor: opt(z.string()),
    // grouping: tags put a spread in tag-based campaign entries (e.g. a niggunim collection)
    tags: opt(z.array(z.string())),
    v1: opt(z.string()),
  }).passthrough(), // any extra field you add is kept and usable in a feature layout
});

const issues = defineCollection({
  loader: glob({ pattern: "*.yml", base: "./content/issues" }),
  schema: z.object({
    number: z.coerce.number().int(),
    week: opt(z.string()),
    date: opt(z.string()),
    year: opt(z.coerce.number().int()),
    pdf: opt(z.string()),
    note: opt(z.string()),
  }).passthrough(),
});

const features = defineCollection({
  loader: file("./content/features.yml"),
  schema: z.object({
    name: z.string(),
    campaign: z.string(),
    color: z.string().default("navy"),
    kick: opt(z.string()),
    ribbon: opt(z.string()),
    mission: opt(z.string()),
    description: opt(z.string()),
  }).passthrough(),
});

const show = z.object({ features: z.array(z.string()).min(1), year: opt(z.coerce.number().int()), tag: opt(z.string()) });
const campaigns = defineCollection({
  loader: file("./content/campaigns.yml"),
  schema: z.object({
    name: z.string(),
    color: z.string().default("navy"),
    description: opt(z.string()),
    sections: z.array(z.object({
      name: z.string(),
      entries: z.array(z.object({ id: z.string(), title: z.string(), grade: opt(z.string()), part: opt(z.string()), show })),
    })),
  }),
});

export const collections = { spreads, issues, features, campaigns };
