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

let homeDir = "";

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

hatchBtn.addEventListener("click", async () => {
  const emails = collectEmails();
  if (emails.length === 0) {
    setError("Add at least one email so the crab knows which commits are yours.");
    emailsEl.querySelector("input")?.focus();
    return;
  }
  const folder = (advEl.hidden ? "" : folderInput.value.trim()) || homeDir;

  hatchBtn.disabled = true;
  hatchBtn.textContent = "Hatching… 🥚";
  try {
    await setup.submit({ emails, folder });
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
})();

/** Pretty-print the home path (~) for display. */
function shortHome(p) {
  const parts = p.split(/[\\/]/);
  const last = parts[parts.length - 1] || p;
  return `~ (${last})`;
}
