# 🦀 Claude Crab

A tiny Claude-crab desktop pet that lives on your screen and **evolves as you commit code**. It starts as an egg, hatches into a hatchling, and grows all the way to a fiery, goggle-wearing legend — one commit at a time.

Built with [Electron](https://www.electronjs.org/). Runs on **macOS and Windows** from a single codebase.

<!-- TODO: add a screen recording / gif here -->

## How it works

Claude Crab counts your git commits **entirely on your own machine**:

1. It scans the folder you choose (your home folder by default) for git repositories.
2. For each repo it runs `git rev-list --count --author <your-email>` to count commits authored by you.
3. The crab's stage is based on how many commits you've made **since you adopted it**.

There is **no network, no login, and no data collection**. Your email is used only as a local `git --author` filter — it never leaves your device. See [`tracker.js`](tracker.js) if you'd like to verify that yourself.

## First run

The first time you launch the app, a short setup window appears. It:

- **Auto-detects your git email** (from `git config user.email`) and asks you to confirm it — you can add more than one (e.g. work + personal).
- Watches your **home folder** by default; an *Advanced* option lets you pick a specific folder instead.

Your answers are saved to the app's per-user config (in the OS `userData` folder), **not** into this repo. You can reopen it anytime from the menu-bar / tray crab → **Edit settings…**.

## Evolution stages

| Stage | Commits since adoption |
| --- | --- |
| 🥚 Egg | 0 (cracks at 2, hatches at 3) |
| 🦀 Hatchling | 3 |
| 🔥 Blaze | 10 |
| 🔥 Inferno | 30 |
| 🦀 Adult | 100 |
| 🦀 Elder | 300 |
| 👑 Legendary | 750 |

Thresholds live in [`config.json`](config.json) — tweak them however you like.

## Develop / run locally

```bash
npm install
npm start
```

## Configuration

- [`config.json`](config.json) — shipped **defaults** (the evolution ladder, scan depth, poll interval). No personal data.
- Per-user settings (your emails + watched folder) are written on first run to the OS `userData` folder. See [`config.example.json`](config.example.json) for the shape.

## License

[MIT](LICENSE)
