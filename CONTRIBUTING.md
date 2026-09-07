# Contributing to Claude Crab

Thanks for wanting to help. Claude Crab is a small, friendly project, and contributions of every size are welcome, from typo fixes to whole new pets.

## Ways to contribute

- **Report a bug** or suggest an idea by opening an issue.
- **Improve the code**: fix a bug, add a feature, tidy something up.
- **Add a new pet** (see the guide below). This is the most fun way to contribute.
- **Improve the docs** or the website in `docs/`.

## Getting set up

You need [Node.js](https://nodejs.org/) 18 or newer and git.

```bash
git clone https://github.com/56steve/claude-crab.git
cd claude-crab
npm install
npm start
```

To try the different evolution stages without making real commits, open `renderer/index.html` in a browser with a `?progress=N` query, for example `?progress=12`. The preview mock in `renderer/pet.js` renders the matching stage.

## Project layout

| File or folder | What it does |
| --- | --- |
| `main.js` | Electron main process: config, tracking modes, tray, windows. |
| `tracker.js` | Local mode: counts commits by scanning git repos. |
| `github.js` | GitHub mode: device-flow sign-in and the contributions query. |
| `preload.js` | The safe bridge between the UI and the main process. |
| `renderer/index.html` | The app shell and the stats bubble. |
| `renderer/style.css` | Shell styling (the pet container and the bubble). |
| `renderer/pet.js` | Loads the selected pet pack, applies stages, renders stats. |
| `renderer/onboard.js` / `onboard.html` | The first-run setup window. |
| `pets/` | The pet packs (one folder per pet). |
| `pets.js` | Discovers and loads pet packs. |
| `tray-icon.js` | Draws the menu-bar / tray icon. |
| `config.json` | Scan settings and the GitHub client id. |
| `build/` | App icon for packaging. |
| `docs/` | The landing page (served by GitHub Pages). |

## Branches and pull requests

- `main` is the released code. `development` is where changes land before a release.
- Fork the repo, create a branch off `main` (for example `fix-tray-tooltip` or `pet-octopus`), and open a pull request against `main`.
- Keep each pull request focused on one thing.
- Describe what you changed and why, and include a screenshot or short clip for anything visual.

## Code style

- **No em dashes** anywhere, in code, comments, docs, or UI copy. Use commas, colons, or shorter sentences.
- Write production-ready code: no placeholders, no commented-out blocks, no "fix later" notes.
- Match the style of the file you are editing. Handle errors, and do not leave `console.log` debugging behind.
- Before opening a pull request, run the app with `npm start` and confirm your change works.

## Adding a new pet

Pets are self-contained **packs**. To add one, create a folder under `pets/` with two files. Nothing else needs editing, and your pet shows up automatically in the setup window's pet picker.

**`pets/<id>/pet.json`** is the metadata:

```json
{
  "id": "slime",
  "name": "Pixel Slime",
  "author": "your-name",
  "stages": [
    { "name": "Egg",       "emoji": "🥚", "class": "slime-egg",  "defaultMin": 0 },
    { "name": "Slimeling", "emoji": "🟢", "class": "slime-baby", "defaultMin": 5 },
    { "name": "Bubbler",   "emoji": "🫧", "class": "slime-mid",  "defaultMin": 15 },
    { "name": "Titan",     "emoji": "👑", "class": "slime-titan", "defaultMin": 35 }
  ]
}
```

The first stage is the egg (`defaultMin` 0). Each stage has a unique CSS `class`. The `defaultMin` values are the default commit thresholds, which a user can still change during setup.

**`pets/<id>/pet.html`** is a `<style>` block followed by the `<svg>` artwork. Use `viewBox="0 0 200 200"`. Show and hide each stage's parts with the stage class, which is applied to `#stage-root`, for example `.slime-baby .slime-body { display: block }`. Set each stage's size with `.slime-baby .pet { scale: 0.44 }`. The generic hooks `#stage-root.cracking`, `#stage-root.hatch`, and `#stage-root[data-happy="true"]` are available for the egg-cracking, hatching, and commit-celebration moments.

Use [`pets/crab/pet.html`](pets/crab/pet.html) and [`pets/slime/pet.html`](pets/slime/pet.html) as references. Please **open an issue first** with a sketch so we can coordinate and avoid two people drawing the same animal. Pixel-art pets that match the existing look are the easiest to accept.

## Be kind

Be respectful and patient with each other. We are here to build something small and fun.

## License

By contributing, you agree that your work is licensed under the [MIT License](LICENSE), the same as the rest of the project.
