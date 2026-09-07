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
| `renderer/index.html` | The pet artwork (inline SVG) and the stats bubble. |
| `renderer/style.css` | Colors, per-stage scaling, and animations. |
| `renderer/pet.js` | Applies the current stage and renders stats. |
| `renderer/onboard.js` / `onboard.html` | The first-run setup window. |
| `tray-icon.js` | Draws the menu-bar / tray icon. |
| `config.json` | Default evolution stages and scan settings. |
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

Right now the crab is defined directly in the renderer and a few helpers, so a new pet means editing these files:

- `renderer/index.html`: the pet is one inline `<svg>`. Each stage is shown or hidden with CSS. Add your artwork here.
- `renderer/style.css`: the `.stage-*` rules control which parts of the SVG show at each stage, plus colors, scaling, and animation.
- `renderer/pet.js`: the `STAGE_CLASSES` list maps stage index to a CSS class.
- `config.json`: the `stages` array sets the names, emojis, and commit thresholds.
- `tray-icon.js`: the menu-bar icon, drawn in code.

A cleaner **pet packs** system, where each pet is a self-contained folder you can drop in and pick during setup, is planned. If you want to add a pet, please **open an issue first** with a sketch or an SVG so we can agree on the shape before you build it, and so two people do not redraw the same animal. Pixel-art pets that match the existing look are the easiest to accept.

## Be kind

Be respectful and patient with each other. We are here to build something small and fun.

## License

By contributing, you agree that your work is licensed under the [MIT License](LICENSE), the same as the rest of the project.
