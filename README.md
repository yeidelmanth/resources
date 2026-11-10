# Commander's Resources: editable rebuild

This is a rebuild of the Tzivos Hashem Commander's Resources site. All 691 pages are now JSON content files you edit in a browser admin panel, not HTML baked into JavaScript. The published site is plain static files. It looks and behaves exactly like the original: every page renders identically to the original markup (`npm run check -- --original migration/orig.json`).

```
content/
  pages/<id>.json      one file per page (691)
  data/
    types.json         page types: defaults pages inherit + starting values for new pages
    settings.json      site name, hosting, login, live-feature addresses
    nav.json           top menu
    images.json        image key -> file (lightbox, thumbnails, page scans)
    schedule.json      weekly workflow, mivtza of the month, events
    older-pdfs.json    "Older PDFs" lists by issue
    calendar.json      day -> parsha / Hebrew date; yom tov dates ("this week" logic)
    marking-tools.json, biur-tefillah.json, handwriting.json
uploads/               files added through the admin (new content)
public/                the site itself: index.html, css/site.css, js/app.js, js/render.js
admin/                 the editor
server.mjs             admin server (editor + preview + API)
scripts/               build, check, migrate
migration/             tools and source snapshot used to convert the original site
```

## Running the editor

```bash
npm install
ADMIN_PASSWORD=choose-one npm run admin
# editor:  http://127.0.0.1:4000/admin/      (user: admin)
# preview: http://127.0.0.1:4000/
```

By default the server only listens on this computer. To use it from other machines, set `HOST=0.0.0.0`. It refuses to start that way without `ADMIN_PASSWORD`.

## Editing

- **Pages tab.** The tree on the left mirrors the site's breadcrumb hierarchy. Open a page to get a form with a live preview beside it.
  - **Articles** (sichos, stories, niggunim, drills, archive PDFs) have fields: kicker, ribbon, title, tags, page scans, PDF, audio/video, sichos, text, related links, mission and source.
  - **Section pages** (parsha weeks, hubs, Yoma Depagra dates, story series) are a stack of blocks you can add, reorder or remove. The blocks are headings, cards, link lists, tabs, filter buttons, image galleries, the Hachayol bar, notes and custom HTML.
- **New page.** Pick a type, title and parent. The type pre-fills the branch, parents and defaults. For articles, tick "Also add a card…" and a card linking to it is placed on the parent page. New pages start as drafts.
- **Page types tab.** Article types hold shared defaults: kicker, ribbon, ribbon colour and mission. A page that leaves those blank inherits them, so changing *Orders from Our General*'s mission there updates all 22 sichos at once. You can add new types, for example a new weekly feature.
- **Site data tab.** Covers settings, the top menu, the schedule and events, older PDFs, Mission Marking tools, images, calendar data and Biur Tefillah books.
- **Every save keeps the previous version.** Use *Versions* on a page to bring an older one back. Deleting a page warns you if other pages still link to it.
- **Publish** writes the static site. Saving alone only updates the editor and preview.

## Files: mixed storage

- **Existing files stay where they are.** The paths in pages (`pdfs/665.pdf`, `sichos/…`, `hisk/…`, `audio/…`, `/resources/assets/img/…`) still point at the original server.
- **New files go under `uploads/YYYY-MM/`.** Use the *Upload…* button beside any file or image field, or the *Files* tab.
  - Uploaded pictures are registered in `images.json` under a key, so the lightbox and cards can use them.
  - Publishing copies `uploads/` next to the site.

## Deploying (either way)

`npm run build` writes `dist/`. `node scripts/build.mjs <folder>` writes anywhere, and setting `PUBLISH_DIR=<folder>` makes the admin's Publish button write there.

**Same server as today.** Publish into the existing `/resources/` folder. Only `index.html`, `css/`, `js/`, `content/` and `uploads/` are written. The old PDF folders, `calendar/`, `checkAuth.php`, `promotions.php` and everything else there are left alone. Login, promotions, the Chitas feed, Mission Marking and the calendar keep working as before.

**Separate static host** (Netlify, Cloudflare Pages, S3…). Upload `dist/`, then in *Site data → Settings*:
- Set **"Where old files live"** to the main server's resources address, e.g. `https://<main-domain>/resources/`, so old PDFs, images and the logo load from there.
- Turn off **Require login**, or keep it if the main server allows cross-site requests from the new host.
- Promotions, the Chitas feed and Mission Marking are served by the main server and need it to allow that.

**Admin preview.** Set **"Where old files live (admin preview)"** to the main server's address, or the preview will show blank boxes for the old images.

## Checking

```bash
npm run check                                   # broken links, missing parents, unknown image keys
node scripts/check.mjs --original migration/orig.json   # compare every page with the original site
```

## Still HTML (edit in the Custom HTML block)

Some one-off layouts were kept exactly as written rather than turned into forms:
- The 13 month calendar grids
- The year overview
- The Chumash jump bar
- The Biur Tefillah shelf
- The VeHolachta drill table
- The Didan Notzach rally page
- The Promotions ladder

The month grids are a snapshot of the 5787 schedule. Editing *Site data → Schedule* updates the pop-ups but not those grids. Generating the grids from the calendar and event data is the natural next step when the year rolls over.

## If you later prefer editing in Git

Content is just JSON files, so you can edit `content/` in a code editor or on GitHub and run `npm run build` (or a CI job) to publish. A Git-backed CMS such as Decap could also edit the same files. Nothing in the site depends on the admin server.
