# Feature shells

Every spread is drawn with its feature's shell. A feature uses
`src/layouts/Spread.astro` unless this folder has a file named after the
feature's id (the `id` in `content/features.yml`).

To give a feature its own look:

1. Copy `chassidishe-frames.astro` (or `../Spread.astro`) to `<feature id>.astro` here,
   e.g. `roots-stories-of-our-lives.astro`.
2. Rearrange the parts, add your own HTML, and style it in the `<style>` block
   at the bottom. Styles there only affect this feature.

The parts you can place anywhere:

| Part | What it shows |
|---|---|
| `<SpreadHead spread={spread} />` | kicker, ribbon, title, chips, Hachayol issue link |
| `<PageScans spread={spread} />` | the page scans side by side (`layout="stack"` for one under another) |
| `<Buttons spread={spread} />` | Full screen, Print PDF, Older PDFs, audio/video, sichos |
| `<Content />` | the spread's text |
| `<Related spread={spread} />` | the related-links box |
| `<Mission spread={spread} />` | the mission box |
| `<SpreadLinks spread={spread} />` | "Find this in" (issue, feature, campaign) + previous/next |

Any field in a spread's file is available as `spread.data.<field>`. Add
`author: Rabbi X` to a spread and write `{spread.data.author}` in the shell.
