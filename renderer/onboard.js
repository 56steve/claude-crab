"use strict";

const setup = window.crabSetup;

const emailsEl = document.getElementById("emails");
const addEmailBtn = document.getElementById("add-email");
const homePathEl = document.getElementById("home-path");
const folderInput = document.getElementById("folder");
const advToggle = document.getElementById("adv-toggle");
const advEl = document.getElementById("adv");
const pickBtn = document.getElementById("pick");
const hatchBtn = document.getElementById("hatch");
const errorEl = document.getElementById("error");
const paceAdvToggle = document.getElementById("pace-adv-toggle");
const paceAdvEl = document.getElementById("pace-adv");
const stagesGrid = document.getElementById("stages-grid");
const presetBtns = [...document.querySelectorAll(".preset")];

let homeDir = "";

// The fixed stage names/emojis after the egg. Only the commit thresholds
// (mins) change; presets and the Advanced grid just fill those numbers in.
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

/** Add one email input row. The remove button is hidden on the only row. */
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

/** Only show remove buttons when there's more than one row. */
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

function clearError() {
  errorEl.textContent = "";
}

function setError(msg) {
  errorEl.textContent = msg;
}

// Build the six editable threshold inputs (one per post-egg stage).
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
      // A manual edit means the ladder is now custom, so drop the preset highlight.
      presetBtns.forEach((b) => b.classList.remove("selected"));
      clearError();
    });

    cell.appendChild(label);
    cell.appendChild(input);
    stagesGrid.appendChild(cell);
    stageInputs.push(input);
  });
}

// Fill the grid from a named preset and highlight that button.
function applyPreset(name) {
  const vals = PRESETS[name];
  if (!vals) return;
  vals.forEach((v, i) => {
    stageInputs[i].value = v;
  });
  presetBtns.forEach((b) => b.classList.toggle("selected", b.dataset.preset === name));
  clearError();
}

// Read the grid into a full stages array (egg first). Throws on a bad ladder.
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

// ---- events ----------------------------------------------------------------
addEmailBtn.addEventListener("click", () => addEmailRow().focus());

advToggle.addEventListener("click", () => {
  const showing = !advEl.hidden;
  advEl.hidden = showing;
  advToggle.textContent = showing ? "Advanced ▸" : "Advanced ▾";
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
  const emails = collectEmails();
  if (emails.length === 0) {
    setError("Add at least one email so the crab knows which commits are yours.");
    emailsEl.querySelector("input")?.focus();
    return;
  }
  const folder = (advEl.hidden ? "" : folderInput.value.trim()) || homeDir;

  let stages;
  try {
    stages = collectStages();
  } catch (e) {
    setError(e.message);
    if (paceAdvEl.hidden) paceAdvToggle.click(); // reveal the grid to fix it
    return;
  }

  hatchBtn.disabled = true;
  hatchBtn.textContent = "Hatching… 🥚";
  try {
    await setup.submit({ emails, folder, stages });
  } catch (err) {
    setError("Something went wrong saving your setup. Please try again.");
    hatchBtn.disabled = false;
    hatchBtn.textContent = "Hatch my egg 🥚";
  }
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
})();

/** Pretty-print the home path (~) for display. */
function shortHome(p) {
  const parts = p.split(/[\\/]/);
  const last = parts[parts.length - 1] || p;
  return `~ (${last})`;
}
