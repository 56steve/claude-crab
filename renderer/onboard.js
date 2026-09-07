"use strict";

const setup = window.crabSetup;

// mode toggle
const modeBtns = [...document.querySelectorAll(".mode")];
const githubSection = document.getElementById("github-section");
const localSection = document.getElementById("local-section");

// github connect
const githubConnectBtn = document.getElementById("github-connect");
const githubStatus = document.getElementById("github-status");
const githubDone = document.getElementById("github-done");
const ghCode = document.getElementById("gh-code");
const ghUri = document.getElementById("gh-uri");
const ghLogin = document.getElementById("gh-login");

// local fields
const emailsEl = document.getElementById("emails");
const addEmailBtn = document.getElementById("add-email");
const homePathEl = document.getElementById("home-path");
const folderInput = document.getElementById("folder");
const folderAdvToggle = document.getElementById("folder-adv-toggle");
const folderAdvEl = document.getElementById("folder-adv");
const pickBtn = document.getElementById("pick");

// pace
const paceAdvToggle = document.getElementById("pace-adv-toggle");
const paceAdvEl = document.getElementById("pace-adv");
const stagesGrid = document.getElementById("stages-grid");
const presetBtns = [...document.querySelectorAll(".preset")];

// shared
const hatchBtn = document.getElementById("hatch");
const errorEl = document.getElementById("error");

let mode = "github";
let githubConnected = false;
let homeDir = "";

const STAGE_DEFS = [
  { name: "Hatchling", emoji: "🦀" },
  { name: "Blaze", emoji: "🔥" },
  { name: "Inferno", emoji: "🔥" },
];
const PRESETS = {
  chill: [2, 6, 18],
  normal: [3, 10, 30],
  grind: [5, 20, 60],
};
const stageInputs = [];

// ---- helpers ---------------------------------------------------------------
function clearError() {
  errorEl.textContent = "";
}
function setError(msg) {
  errorEl.textContent = msg;
}

function setMode(m) {
  mode = m;
  modeBtns.forEach((b) => b.classList.toggle("selected", b.dataset.mode === m));
  githubSection.hidden = m !== "github";
  localSection.hidden = m !== "local";
  clearError();
}

// local: email rows
function addEmailRow(value = "") {
  const row = document.createElement("div");
  row.className = "email-row";

  const input = document.createElement("input");
  input.type = "email";
  input.placeholder = "you@example.com";
  input.value = value;
  input.spellcheck = false;
  input.addEventListener("input", clearError);

  const remove = document.createElement("button");
  remove.className = "remove-email";
  remove.textContent = "−";
  remove.title = "Remove";
  remove.addEventListener("click", () => {
    row.remove();
    refreshRemoveButtons();
  });

  row.appendChild(input);
  row.appendChild(remove);
  emailsEl.appendChild(row);
  refreshRemoveButtons();
  return input;
}
function refreshRemoveButtons() {
  const rows = emailsEl.querySelectorAll(".email-row");
  rows.forEach((r) => {
    r.querySelector(".remove-email").style.visibility =
      rows.length > 1 ? "visible" : "hidden";
  });
}
function collectEmails() {
  return [...emailsEl.querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter(Boolean);
}

// pace: build + read the threshold grid
function buildStagesGrid() {
  STAGE_DEFS.forEach((def) => {
    const cell = document.createElement("div");
    cell.className = "stage-cell";

    const label = document.createElement("label");
    label.textContent = `${def.emoji} ${def.name}`;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.addEventListener("input", () => {
      presetBtns.forEach((b) => b.classList.remove("selected"));
      clearError();
    });

    cell.appendChild(label);
    cell.appendChild(input);
    stagesGrid.appendChild(cell);
    stageInputs.push(input);
  });
}
function applyPreset(name) {
  const vals = PRESETS[name];
  if (!vals) return;
  vals.forEach((v, i) => {
    stageInputs[i].value = v;
  });
  presetBtns.forEach((b) => b.classList.toggle("selected", b.dataset.preset === name));
  clearError();
}
function collectStages() {
  const stages = [{ name: "Egg", min: 0, emoji: "🥚" }];
  let prev = 0;
  for (let i = 0; i < STAGE_DEFS.length; i++) {
    const n = parseInt(stageInputs[i].value, 10);
    if (!Number.isFinite(n) || n <= prev) {
      throw new Error(
        `Each stage needs a number higher than the one before it (check ${STAGE_DEFS[i].name}).`
      );
    }
    stages.push({ name: STAGE_DEFS[i].name, min: n, emoji: STAGE_DEFS[i].emoji });
    prev = n;
  }
  return stages;
}

function shortHome(p) {
  const parts = p.split(/[\\/]/);
  const last = parts[parts.length - 1] || p;
  return `~ (${last})`;
}

// ---- events ----------------------------------------------------------------
modeBtns.forEach((btn) => btn.addEventListener("click", () => setMode(btn.dataset.mode)));

githubConnectBtn.addEventListener("click", async () => {
  clearError();
  githubConnectBtn.disabled = true;
  githubConnectBtn.textContent = "Starting…";

  const begin = await setup.githubBegin();
  if (!begin || !begin.ok) {
    setError((begin && begin.error) || "Could not start GitHub sign-in.");
    githubConnectBtn.disabled = false;
    githubConnectBtn.textContent = "🐙 Connect GitHub";
    return;
  }

  ghCode.textContent = begin.userCode;
  ghUri.textContent = (begin.verificationUri || "github.com/login/device").replace(
    /^https?:\/\//,
    ""
  );
  githubConnectBtn.hidden = true;
  githubStatus.hidden = false;

  const res = await setup.githubAwait();
  if (!res || !res.ok) {
    setError((res && res.error) || "GitHub sign-in failed.");
    githubStatus.hidden = true;
    githubConnectBtn.hidden = false;
    githubConnectBtn.disabled = false;
    githubConnectBtn.textContent = "🐙 Connect GitHub";
    return;
  }

  githubConnected = true;
  githubStatus.hidden = true;
  ghLogin.textContent = "@" + res.login;
  githubDone.hidden = false;
});

addEmailBtn.addEventListener("click", () => addEmailRow().focus());

folderAdvToggle.addEventListener("click", () => {
  const showing = !folderAdvEl.hidden;
  folderAdvEl.hidden = showing;
  folderAdvToggle.textContent = showing ? "Advanced ▸" : "Advanced ▾";
  if (!showing && !folderInput.value) folderInput.value = homeDir;
});

pickBtn.addEventListener("click", async () => {
  const picked = await setup.pickFolder();
  if (picked) folderInput.value = picked;
});

presetBtns.forEach((btn) => {
  btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
});

paceAdvToggle.addEventListener("click", () => {
  const showing = !paceAdvEl.hidden;
  paceAdvEl.hidden = showing;
  paceAdvToggle.textContent = showing ? "Advanced ▸" : "Advanced ▾";
});

hatchBtn.addEventListener("click", async () => {
  clearError();

  let stages;
  try {
    stages = collectStages();
  } catch (e) {
    setError(e.message);
    if (paceAdvEl.hidden) paceAdvToggle.click();
    return;
  }

  let payload;
  if (mode === "github") {
    if (!githubConnected) {
      setError("Connect your GitHub account first.");
      return;
    }
    payload = { mode: "github", stages };
  } else {
    const emails = collectEmails();
    if (emails.length === 0) {
      setError("Add at least one email so the crab knows which commits are yours.");
      emailsEl.querySelector("input")?.focus();
      return;
    }
    const folder = (folderAdvEl.hidden ? "" : folderInput.value.trim()) || homeDir;
    payload = { mode: "local", emails, folder, stages };
  }

  hatchBtn.disabled = true;
  hatchBtn.textContent = "Hatching… 🥚";
  const res = await setup.submit(payload);
  if (res && res.ok === false) {
    setError(res.error || "Something went wrong. Please try again.");
    hatchBtn.disabled = false;
    hatchBtn.textContent = "Hatch my egg 🥚";
  }
  // On success, main closes this window and launches the pet.
});

document.getElementById("close").addEventListener("click", () => window.close());

// ---- init ------------------------------------------------------------------
(async function init() {
  let detected = { email: "", home: "" };
  try {
    detected = await setup.defaults();
  } catch {
    /* fall through with empty defaults */
  }
  homeDir = detected.home || "";
  homePathEl.textContent = homeDir ? shortHome(homeDir) : "(~)";
  folderInput.value = homeDir;
  addEmailRow(detected.email || "");
  buildStagesGrid();
  applyPreset("normal");
  setMode("github");
})();
