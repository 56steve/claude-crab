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
  safeStorage,
  nativeImage,
} = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { scan } = require("./tracker");
const github = require("./github");
const { crabTrayPNG } = require("./tray-icon");

// Defaults shipped with the app (stages, cadence, GitHub client id). Personal
// settings, which mode to track in and which emails/folders count as "you",
// are collected on first run and saved to userData, never to this file.
const DEFAULT_CONFIG_PATH = path.join(__dirname, "config.json");

let win = null;
let onboardWin = null;
let tray = null;
let lastStats = null;
let pollTimer = null;
let pendingDevice = null; // in-flight device-flow data during onboarding
let pendingGithub = null; // { login, createdAt } captured after authorization

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
      githubClientId: "",
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

/** Merge shipped defaults with the user's saved settings. */
function resolveConfig() {
  const defaults = loadDefaults();
  const user = loadUserConfig() || {};
  return {
    ...defaults,
    ...user,
    // Use the user's chosen evolution ladder if they set one during setup,
    // otherwise fall back to the shipped defaults.
    stages:
      Array.isArray(user.stages) && user.stages.length
        ? user.stages
        : defaults.stages,
  };
}

/**
 * Validate a stages array coming from the setup window. Each stage needs a
 * name, an emoji, and a numeric min, and the mins must strictly increase.
 * Anything off returns the fallback ladder so a bad payload can't break the pet.
 */
function sanitizeStages(stages, fallback) {
  if (!Array.isArray(stages) || stages.length < 2) return fallback;
  let prev = -1;
  for (const s of stages) {
    if (!s || typeof s.name !== "string" || typeof s.emoji !== "string") {
      return fallback;
    }
    const min = Number(s.min);
    if (!Number.isFinite(min) || min < 0 || (prev !== -1 && min <= prev)) {
      return fallback;
    }
    prev = min;
  }
  return stages.map((s) => ({
    name: s.name,
    min: Math.floor(Number(s.min)),
    emoji: s.emoji,
  }));
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
// GitHub token storage (encrypted at rest via Electron safeStorage)
// ---------------------------------------------------------------------------
function tokenPath() {
  return path.join(app.getPath("userData"), "github-token.bin");
}
function saveToken(token) {
  try {
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(token)
      : Buffer.from(token, "utf8");
    fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
    fs.writeFileSync(tokenPath(), buf);
  } catch (err) {
    console.error("[claude-crab] failed to save token:", err.message);
  }
}
function loadToken() {
  try {
    const buf = fs.readFileSync(tokenPath());
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString("utf8");
  } catch {
    return null;
  }
}
function clearToken() {
  try {
    fs.unlinkSync(tokenPath());
  } catch {
    /* nothing to remove */
  }
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
    height: 660,
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
// Gather commit numbers for the active tracking mode.
// Returns { lifetime, today, week, repoCount, progress }.
// ---------------------------------------------------------------------------
async function gatherStats(config) {
  if (config.mode === "github") {
    const token = loadToken();
    if (!token) throw new Error("GitHub is not connected.");
    const s = await github.fetchStats(token, config.adoptedAt);
    const progress = s.sinceAdoption;
    return {
      lifetime: (config.githubBaselineLifetime || 0) + progress,
      today: s.today,
      week: s.week,
      repoCount: s.repoCount,
      progress,
    };
  }

  // Local mode: scan repos and derive progress from a saved baseline.
  const stats = await scan(config);
  const state = loadState();
  if (state.baseline == null) {
    state.baseline = stats.lifetime;
    saveState(state);
  }
  return {
    lifetime: stats.lifetime,
    today: stats.today,
    week: stats.week,
    repoCount: stats.repoCount,
    progress: Math.max(0, stats.lifetime - state.baseline),
  };
}

// ---------------------------------------------------------------------------
// Scan + push to UI
// ---------------------------------------------------------------------------
async function runScan(config) {
  let g;
  try {
    g = await gatherStats(config);
  } catch (err) {
    console.error("[claude-crab] scan failed:", err.message);
    return;
  }

  const state = loadState();
  const prev = state.lastProgress;
  const justCommitted = prev !== null && g.progress > prev;
  const gained = prev !== null ? Math.max(0, g.progress - prev) : 0;

  state.lastProgress = g.progress;
  state.lastLifetime = g.lifetime;
  saveState(state);

  const stage = pickStage(config.stages, g.progress);
  const nextStage = pickNextStage(config.stages, g.progress);

  lastStats = {
    lifetime: g.lifetime,
    today: g.today,
    week: g.week,
    repoCount: g.repoCount,
    progress: g.progress,
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
// Reset the pet to an egg for the current mode.
// ---------------------------------------------------------------------------
async function resetToEgg(config) {
  if (config.mode === "github") {
    // Re-adopt now: freeze the current lifetime as the new baseline so
    // progress restarts at zero.
    const token = loadToken();
    try {
      const s = token ? await github.fetchStats(token, config.adoptedAt) : null;
      const lifetime = s
        ? (config.githubBaselineLifetime || 0) + s.sinceAdoption
        : config.githubBaselineLifetime || 0;
      const user = loadUserConfig() || {};
      user.adoptedAt = new Date().toISOString();
      user.githubBaselineLifetime = lifetime;
      saveUserConfig(user);
      Object.assign(config, resolveConfig());
    } catch (err) {
      console.error("[claude-crab] github reset failed:", err.message);
    }
  } else {
    const st = loadState();
    st.baseline = st.lastLifetime != null ? st.lastLifetime : null;
  }
  const st = loadState();
  st.lastProgress = null;
  saveState(st);
  runScan(config);
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
      click: () => resetToEgg(config),
    },
    { type: "separator" },
    {
      label: "Edit settings…",
      click: () => shell.openPath(userConfigPath()),
    },
    {
      label: "Reload settings",
      click: () => {
        Object.assign(config, resolveConfig());
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

  // GitHub device flow: begin (get + show the code, open the browser).
  ipcMain.handle("onboard:github-begin", async () => {
    const clientId = loadDefaults().githubClientId;
    if (!clientId) return { ok: false, error: "No GitHub client id is configured." };
    try {
      pendingDevice = { ...(await github.requestDeviceCode(clientId)), clientId };
      shell.openExternal(pendingDevice.verificationUri);
      return {
        ok: true,
        userCode: pendingDevice.userCode,
        verificationUri: pendingDevice.verificationUri,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // GitHub device flow: wait for authorization, then store the token.
  ipcMain.handle("onboard:github-await", async () => {
    if (!pendingDevice) return { ok: false, error: "Start the GitHub sign-in first." };
    try {
      const token = await github.pollForToken(
        pendingDevice.clientId,
        pendingDevice.deviceCode,
        pendingDevice.interval,
        pendingDevice.expiresIn
      );
      const stats = await github.fetchStats(token, new Date().toISOString());
      saveToken(token);
      pendingGithub = { login: stats.login, createdAt: stats.createdAt };
      pendingDevice = null;
      return { ok: true, login: stats.login };
    } catch (err) {
      pendingDevice = null;
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("onboard:submit", async (_e, payload) => {
    const defaults = loadDefaults();
    const stages = sanitizeStages(payload.stages, defaults.stages);
    const base = {
      scanDepth: defaults.scanDepth || 4,
      pollSeconds: defaults.pollSeconds || 90,
      stages,
    };

    if (payload.mode === "github") {
      if (!pendingGithub || !loadToken()) {
        return { ok: false, error: "Connect your GitHub account first." };
      }
      let baseline = 0;
      try {
        baseline = await github.fetchLifetimeCommits(loadToken(), pendingGithub.createdAt);
      } catch (err) {
        console.error("[claude-crab] lifetime fetch failed:", err.message);
      }
      saveUserConfig({
        ...base,
        mode: "github",
        githubLogin: pendingGithub.login,
        githubCreatedAt: pendingGithub.createdAt,
        githubBaselineLifetime: baseline,
        adoptedAt: new Date().toISOString(),
      });
    } else {
      const emails = (payload.emails || [])
        .map((s) => String(s).trim())
        .filter(Boolean);
      const folder =
        String(payload.folder || os.homedir()).trim() || os.homedir();
      saveUserConfig({
        ...base,
        mode: "local",
        watchRoots: [folder],
        authorEmails: emails,
      });
    }

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

// Exported only so the token can be cleared if a future "Sign out" is added.
module.exports = { clearToken };
