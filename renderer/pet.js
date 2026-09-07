"use strict";

// Stage classes are provided by the selected pet pack at load time. This is a
// safe fallback for the crab so something renders if loading fails.
let STAGE_CLASSES = ["stage-egg", "stage-hatchling", "stage-blaze", "stage-inferno"];
// In browser dev preview the mock uses the pack's own stage names/emojis.
let PET_STAGES = null;

const root = document.getElementById("stage-root");
const petEl = document.getElementById("pet");
const el = {
  emoji: document.getElementById("b-emoji"),
  stage: document.getElementById("b-stage"),
  count: document.getElementById("b-count"),
  today: document.getElementById("b-today"),
  week: document.getElementById("b-week"),
  bar: document.getElementById("b-bar"),
  next: document.getElementById("b-next"),
  life: document.getElementById("b-life"),
  repos: document.getElementById("b-repos"),
};

let happyTimer = null;
let lastStageIndex = null;

function applyStage(index) {
  // Only remove stage classes so transient classes (cracking/hatch) survive.
  root.classList.remove(...STAGE_CLASSES);
  root.classList.add(STAGE_CLASSES[Math.min(index, STAGE_CLASSES.length - 1)] || STAGE_CLASSES[0]);
}

function celebrate() {
  root.setAttribute("data-happy", "true");
  clearTimeout(happyTimer);
  happyTimer = setTimeout(() => root.setAttribute("data-happy", "false"), 3400);
}

function hatch() {
  root.classList.add("hatch");
  celebrate();
  setTimeout(() => root.classList.remove("hatch"), 900);
}

function render(s) {
  applyStage(s.stageIndex);

  // egg cracking: within the egg stage, cracks show as it nears hatching
  root.classList.toggle("cracking", s.stageIndex === 0 && s.progress >= 2);

  // hatch animation the moment we leave the egg for the first time
  if (lastStageIndex === 0 && s.stageIndex >= 1) hatch();
  lastStageIndex = s.stageIndex;

  el.emoji.textContent = s.stageEmoji || "🥚";
  el.stage.textContent = s.stageName || "Pet";
  el.count.textContent = s.progress;
  el.today.textContent = s.today;
  el.week.textContent = s.week;
  el.life.textContent = s.lifetime;
  el.repos.textContent = s.repoCount;

  if (s.nextMin != null) {
    const base = s.stageMin || 0;
    const span = Math.max(1, s.nextMin - base);
    const pct = Math.max(5, Math.min(100, ((s.progress - base) / span) * 100));
    el.bar.style.width = pct + "%";
    const remaining = Math.max(0, s.nextMin - s.progress);
    el.next.textContent =
      s.stageIndex === 0
        ? `${remaining} more commit${remaining === 1 ? "" : "s"} to hatch 🥚`
        : `${remaining} more → ${s.nextName}`;
  } else {
    el.bar.style.width = "100%";
    el.next.textContent = "Max evolution reached 🔥";
  }

  if (s.justCommitted && s.stageIndex >= 1) {
    el.next.textContent = s.gained === 1 ? "Nice! +1 commit 🎉" : `Whoa! +${s.gained} commits 🎉`;
    celebrate();
  }
}

// ---- load the selected pet pack and inject its artwork -----------------------
async function loadPet() {
  const params = new URLSearchParams(location.search);
  const petId = params.get("pet") || "crab";
  let pet = null;

  if (window.crab && window.crab.getPet) {
    try {
      pet = await window.crab.getPet();
    } catch {
      /* fall through to the dev fetch */
    }
  }
  if (!pet) {
    // Browser dev preview: fetch the pack straight from the pets folder.
    try {
      const [html, meta] = await Promise.all([
        fetch(`../pets/${petId}/pet.html`).then((r) => r.text()),
        fetch(`../pets/${petId}/pet.json`).then((r) => r.json()),
      ]);
      pet = { html, stageClasses: meta.stages.map((s) => s.class) };
      PET_STAGES = meta.stages;
    } catch {
      /* nothing to inject; the fallback classes stay */
    }
  }
  if (pet) {
    if (pet.html) petEl.innerHTML = pet.html;
    if (Array.isArray(pet.stageClasses) && pet.stageClasses.length) {
      STAGE_CLASSES = pet.stageClasses;
    }
  }
}

// ---- bridge (real Electron) or a mock for browser preview ----
function makeMock() {
  const params = new URLSearchParams(location.search);
  const stages = PET_STAGES || [
    { name: "Egg", emoji: "🥚", defaultMin: 0 },
    { name: "Hatchling", emoji: "🦀", defaultMin: 5 },
    { name: "Blaze", emoji: "🔥", defaultMin: 15 },
    { name: "Inferno", emoji: "🔥", defaultMin: 35 },
  ];
  const mins = stages.map((s) => s.defaultMin);
  const progress = parseInt(params.get("progress") ?? "0", 10);
  let idx = 0;
  mins.forEach((m, i) => { if (progress >= m) idx = i; });
  const nextIdx = idx < stages.length - 1 ? idx + 1 : null;
  const sample = {
    progress,
    lifetime: 263 + progress,
    today: 3,
    week: 21,
    repoCount: 48,
    stageIndex: idx,
    stageName: stages[idx].name,
    stageEmoji: stages[idx].emoji,
    stageMin: mins[idx],
    nextMin: nextIdx != null ? mins[nextIdx] : null,
    nextName: nextIdx != null ? stages[nextIdx].name : null,
    justCommitted: false,
    gained: 0,
  };
  return {
    requestStats: () => render(sample),
    onStats: () => {},
    hide: () => {},
  };
}

(async function start() {
  await loadPet();

  const bridge = window.crab || makeMock();
  bridge.onStats(render);
  bridge.requestStats();

  document.getElementById("close").addEventListener("click", (e) => {
    e.stopPropagation();
    bridge.hide();
  });
  petEl.addEventListener("click", () => {
    if (!root.classList.contains(STAGE_CLASSES[0])) celebrate();
  });
})();
