# 🦀 Claude Crab

Claude Crab is a tiny desktop pet that lives on your screen and grows as you commit code. It starts life as an egg, hatches into a baby crab, and evolves into a fiery, goggle wearing inferno. Every commit you make feeds it and pushes it toward its next form.

It is built with [Electron](https://www.electronjs.org/) and runs on **macOS and Windows** from a single codebase.

<!-- TODO: add a screen recording / gif here -->

## What it does

- Sits on your desktop as a small, always on top, draggable pixel crab.
- Watches your git activity in the background and counts the commits you author.
- Evolves through four stages as your commit count climbs, from a cracking egg to a fiery inferno.
- Shows a little stats bubble on hover: your commit count, today and this week totals, progress to the next stage, and lifetime numbers.
- Lives quietly in your menu bar (macOS) or system tray (Windows) with quick actions to refresh, reset to an egg, or edit your settings.

## How commit counting works

Claude Crab counts your commits **entirely on your own machine**. There is no network, no login, and no data collection.

1. It scans the folder you choose (your home folder by default) for git repositories.
2. For each repository it runs `git rev-list --count --author <your-email>` to count the commits you authored.
3. Your crab's stage is based on how many commits you have made **since you adopted it**, not your all time history.

Your email is used only as a local `git --author` filter. It never leaves your device. If you want to confirm that for yourself, the whole scanner is one short file: [`tracker.js`](tracker.js).

## First run

The first time you launch the app, a short setup window appears. It:

- **Auto-detects your git email** from `git config user.email` and asks you to confirm it. You can add more than one, for example a work address and a personal one.
- Watches your **home folder** by default. An Advanced option lets you pick a specific folder instead, which is handy if your projects live on an external drive.

Your answers are saved to the app's per-user config in the operating system's `userData` folder, not into this repository. You can reopen your settings anytime from the tray or menu bar crab under **Edit settings**.

## Evolution stages

| Stage | Commits since adoption |
| --- | --- |
| 🥚 Egg | 0 (cracks at 2, hatches at 3) |
| 🦀 Hatchling | 3 |
| 🔥 Blaze | 10 |
| 🔥 Inferno | 30 |

The thresholds live in [`config.json`](config.json), so you can tune the whole ladder to your own pace.

## Run it locally

```bash
npm install
npm start
```

## Configuration

- [`config.json`](config.json) holds the shipped **defaults**: the evolution ladder, scan depth, and poll interval. It contains no personal data.
- Your personal settings (your emails and watched folder) are written on first run to the operating system's `userData` folder. See [`config.example.json`](config.example.json) for the shape of that file.

## Privacy

Everything stays on your device. Claude Crab makes no network requests, has no accounts, and sends nothing anywhere. It only reads your local git history to count your commits.

## License

[MIT](LICENSE)
