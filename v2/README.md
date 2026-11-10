# Weekly Hachayol v2

The rebuild of the Hachayol content, organised the way it is made: **issues**
contain **spreads**, each spread belongs to a **feature**, and features are
arranged into **campaigns**. Every list on the site is generated from that, so
you only ever write issues and spreads.

Live at **https://yeidelmanth.github.io/resources/v2/**. It rebuilds by itself
on every push to `main`. The current site at `/resources/` is untouched.

## Where things are

```
v2/content/
  spreads/<issue>-<feature>.md   one file per spread: details on top, text below
  issues/<number>.yml            one file per Hachayol issue: week, date, year, PDF
  features.yml                   each feature (series): name, campaign, colour, kicker, ribbon, mission
  campaigns.yml                  campaign → section → entries (grade, and which spreads to show)
  older-pdfs.json                the "Older PDFs" lists
v2/src/layouts/Spread.astro      the default look of a spread
v2/src/layouts/features/         a feature's own look: <feature id>.astro (see the README there)
v2/public/uploads/               files uploaded through the editor
```

A spread file:

```markdown
---
title: A Mysterious Watchman
feature: roots-stories-of-our-lives
issue: 650
pages:
  - https://mashpia.com/resources/assets/img/5468845de821aa71.jpg
pdf: https://mashpia.com/resources/hisk/14%20650%20Shmini.pdf
---

Baruch’s new employer, Reb Avraham, had a large vegetable farm…
```

From those few lines the spread gets its look (from its feature), appears on
its issue page, its feature page, every campaign entry and grade that shows that
feature, the week page and search. The kicker, ribbon and mission come from the
feature unless the spread sets its own.

## Adding content

**In the browser (easiest):** go to https://app.pagescms.org, sign in with
GitHub and open `yeidelmanth/resources`. You get forms for Spreads, Hachayol
issues, Features and Campaigns, plus uploads. Saving commits to `main` and
the site rebuilds within a couple of minutes. The editor's setup is
`.pages.yml` at the top of the repo.

**On GitHub:** add a file to `v2/content/spreads/` (copy an existing one of the
same feature) and, for a new issue, a file to `v2/content/issues/`.

**A new issue:** create `issues/<number>.yml` with at least `number:`, plus
`week:`, `date:`, `year:` and `pdf:` if you have them. `year` matters for
year-based entries such as *Roots Book 3 - 5787*.

**A new feature:** add it to `features.yml`, list it in an entry in
`campaigns.yml`, and add its id to the two option lists in `.pages.yml`.

## Campaign entries

Each entry in `campaigns.yml` says which spreads it shows:

```yaml
- id: roots-book-2
  title: Book 2 - 5786
  grade: 3rd Grade
  show:
    features: [roots-stories-of-our-lives, roots]
    year: 5786              # optional: only issues from this year
    tag: Niggunei Hashana   # optional: only spreads carrying this tag
```

## Checks

The build stops with a message naming the file if a spread names a feature that
doesn't exist, points at an issue with no issue file, or is missing a title.

## Running it on your computer

```bash
cd v2
npm install
npm run dev        # http://localhost:4321/resources/v2/
```

## Files

Old PDFs, page scans and audio stay on mashpia.com; spreads link to them by
full address. New uploads go in `v2/public/uploads/` and are stored as
`/uploads/…`.

## Re-importing from the current site

`node scripts/import-v1.mjs --force` rebuilds `v2/content` from `../content`.
It overwrites everything in `v2/content`, so don't run it once you've started
editing here.
