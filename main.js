"use strict";

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  shell,
  dialog,
  nativeImage,
} = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { scan } = require("./tracker");
const { crabTrayPNG } = require("./tray-icon");

// Defaults shipped with the app (stages, cadence). Personal settings — which
// emails count as "you" and which folders to watch — are collected on first
// run and saved to userData, never to this file.
const DEFAULT_CONFIG_PATH = path.join(__dirname, "config.json");

let win = null;
let onboardWin = null;
let tray = null;
let lastStats = null;
let pollTimer = null;

// ---------------------------------------------------------------------------
// Config: shipped defaults + per-user overrides (saved in userData)
// ---------------------------------------------------------------------------
function userConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function loadDefaults() {
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, "utf8"));
  } catch (err) {
    console.error("[claude-crab] failed to read default config:", err.message);
    return {
      watchRoots: [],
      authorEmails: [],
      scanDepth: 4,
      pollSeconds: 90,
      stages: [{ name: "Hatchling", min: 0, emoji: "🦀" }],
    };
  }
}

/** The user's saved setup, or null if they haven't completed first-run yet. */
function loadUserConfig() {
  try {
    return JSON.parse(fs.readFileSync(userConfigPath(), "utf8"));
  } catch {
    return null;
  }
}

function saveUserConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(userConfigPath()), { recursive: true });
    fs.writeFileSync(userConfigPath(), JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error("[claude-crab] failed to save user config:", err.message);
  }
}

/** Merge shipped defaults with the user's saved watchRoots/authorEmails. */
function resolveConfig() {
  const defaults = loadDefaults();
  const user = loadUserConfig() || {};
  return {
    ...defaults,
    ...user,
    // stages always come from the shipped defaults (evolution ladder is fixed)
    stages: defaults.stages,
  };
}

/**
 * Best-effort detection of the user's git commit email, so first-run can
 * pre-fill it. Reads the global git config; falls back to the local one.
 */
function detectGitEmail() {
  const tryGit = (args) =>
    new Promise((resolve) => {
      execFile("git", args, { timeout: 4000 }, (err, stdout) => {
        resolve(err ? "" : String(stdout).trim());
      });
    });
  return tryGit(["config", "--global", "user.email"]).then(
    (email) => email || tryGit(["config", "user.email"])
  );
}

// ---------------------------------------------------------------------------
// Persistent state (last-seen commit count, to detect fresh commits)
// ---------------------------------------------------------------------------
function statePath() {
  return path.join(app.getPath("userData"), "state.json");
}
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return { baseline: null, lastProgress: null, lastLifetime: null };
  }
}
function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("[claude-crab] failed to save state:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Tray icon: the pixel Claude-crab, generated at runtime (no asset files).
// ---------------------------------------------------------------------------
function crabTrayImage() {
  // Render at 2x for retina, then let the OS scale to the menu-bar height.
  const img = nativeImage.createFromBuffer(crabTrayPNG(2));
  return img.resize({ height: 18 });
}

// ---------------------------------------------------------------------------
// First-run onboarding window
// ---------------------------------------------------------------------------
function createOnboardingWindow() {
  onboardWin = new BrowserWindow({
    width: 460,
    height: 520,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#17120d",
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  onboardWin.loadFile(path.join(__dirname, "renderer", "onboard.html"));
  onboardWin.on("closed", () => {
    onboardWin = null;
    // If the user closed setup without finishing, there's nothing to run.
    if (!loadUserConfig()) app.quit();
  });
}

// ---------------------------------------------------------------------------
// Main pet window
// ---------------------------------------------------------------------------
function createWindow() {
  const WIDTH = 200;
  const HEIGHT = 224;
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: x + width - WIDTH - 24,
    y: y + height - HEIGHT - 24,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // "screen-saver" level is macOS-only; harmless (still on top) on Windows.
  win.setAlwaysOnTop(true, "screen-saver");
  // Spaces are a macOS concept; this is a no-op on Windows/Linux.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// ---------------------------------------------------------------------------
// Start the pet: window + tray + polling, once we have a config.
// ---------------------------------------------------------------------------
function startCrab() {
  const config = resolveConfig();
  createWindow();
  buildTray(config);

  ipcMain.removeAllListeners("crab:request-stats");
  ipcMain.on("crab:request-stats", (e) => {
    if (lastStats) e.sender.send("crab:stats", lastStats);
  });
  ipcMain.removeAllListeners("crab:hide");
  ipcMain.on("crab:hide", () => {
    if (win) win.hide();
  });

  runScan(config);
  restartPolling(config);
}

// ---------------------------------------------------------------------------
// Scan + push to UI
// ---------------------------------------------------------------------------
async function runScan(config) {
  let stats;
  try {
    stats = await scan(config);
  } catch (err) {
    console.error("[claude-crab] scan failed:", err.message);
    return;
  }

  const state = loadState();
  // Adopt the pet at the current commit total: the egg starts fresh and grows
  // with every commit you make from now on.
  if (state.baseline == null) state.baseline = stats.lifetime;
  const progress = Math.max(0, stats.lifetime - state.baseline);

  const prev = state.lastProgress;
  const justCommitted = prev !== null && progress > prev;
  const gained = prev !== null ? Math.max(0, progress - prev) : 0;

  state.lastProgress = progress;
  state.lastLifetime = stats.lifetime;
  saveState(state);

  const stage = pickStage(config.stages, progress);
  const nextStage = pickNextStage(config.stages, progress);

  lastStats = {
    ...stats,
    progress,
    stageIndex: stage.index,
    stageName: stage.def.name,
    stageEmoji: stage.def.emoji,
    stageMin: stage.def.min,
    nextName: nextStage ? nextStage.def.name : null,
    nextMin: nextStage ? nextStage.def.min : null,
    justCommitted,
    gained,
  };

  if (win && !win.isDestroyed()) win.webContents.send("crab:stats", lastStats);
  updateTrayTooltip();
}

function pickStage(stages, lifetime) {
  let chosen = { def: stages[0], index: 0 };
  stages.forEach((def, index) => {
    if (lifetime >= def.min) chosen = { def, index };
  });
  return chosen;
}
function pickNextStage(stages, lifetime) {
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].min > lifetime) return { def: stages[i], index: i };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function updateTrayTooltip() {
  if (!tray) return;
  if (lastStats) {
    tray.setToolTip(
      `Claude Crab · ${lastStats.stageName} · ${lastStats.lifetime} commits`
    );
  } else {
    tray.setToolTip("Claude Crab");
  }
}

function buildTray(config) {
  if (tray) tray.destroy();
  tray = new Tray(crabTrayImage());
  const menu = Menu.buildFromTemplate([
    {
      label: "Show / Hide crab",
      click: () => {
        if (!win) return;
        if (win.isVisible()) win.hide();
        else win.show();
      },
    },
    {
      label: "Refresh now",
      click: () => runScan(config),
    },
    {
      label: "Reset to egg 🥚",
      click: () => {
        const st = loadState();
        st.baseline = st.lastLifetime != null ? st.lastLifetime : null;
        st.lastProgress = null;
        saveState(st);
        runScan(config);
      },
    },
    { type: "separator" },
    {
      label: "Edit settings…",
      click: () => shell.openPath(userConfigPath()),
    },
    {
      label: "Reload settings",
      click: () => {
        const fresh = resolveConfig();
        Object.assign(config, fresh);
        restartPolling(config);
        runScan(config);
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!win) return;
    win.isVisible() ? win.focus() : win.show();
  });
  updateTrayTooltip();
}

function restartPolling(config) {
  if (pollTimer) clearInterval(pollTimer);
  const ms = Math.max(15, config.pollSeconds || 90) * 1000;
  pollTimer = setInterval(() => runScan(config), ms);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
// Only allow one crab at a time (login launch won't spawn a duplicate).
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on("second-instance", () => {
  const w = win || onboardWin;
  if (w) {
    w.show();
    w.focus();
  }
});

app.whenReady().then(() => {
  if (app.dock) app.dock.hide(); // desktop pet: no dock icon

  // First-run onboarding IPC ------------------------------------------------
  ipcMain.handle("onboard:defaults", async () => ({
    email: await detectGitEmail(),
    home: os.homedir(),
  }));

  ipcMain.handle("onboard:pick-folder", async () => {
    const parent = onboardWin || undefined;
    const res = await dialog.showOpenDialog(parent, {
      title: "Choose a folder to watch for commits",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: os.homedir(),
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("onboard:submit", (_e, payload) => {
    const defaults = loadDefaults();
    const emails = (payload.emails || [])
      .map((s) => String(s).trim())
      .filter(Boolean);
    const folder = String(payload.folder || os.homedir()).trim() || os.homedir();
    saveUserConfig({
      watchRoots: [folder],
      authorEmails: emails,
      scanDepth: defaults.scanDepth || 4,
      pollSeconds: defaults.pollSeconds || 90,
    });
    if (onboardWin) {
      const w = onboardWin;
      onboardWin = null; // avoid the "closed without config" quit guard
      w.close();
    }
    startCrab();
    return { ok: true };
  });

  // Route to onboarding on first run, otherwise straight to the pet.
  if (loadUserConfig()) {
    startCrab();
  } else {
    createOnboardingWindow();
  }
});

app.on("window-all-closed", (e) => {
  // Keep running in the tray even if the window is hidden/closed.
  e.preventDefault();
});
