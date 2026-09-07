"use strict";

const STAGE_CLASSES = [
  "stage-egg",
  "stage-hatchling",
  "stage-blaze",
  "stage-inferno",
];

const root = document.getElementById("stage-root");
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
  root.classList.add(STAGE_CLASSES[Math.min(index, STAGE_CLASSES.length - 1)] || "stage-egg");
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

  el.emoji.textContent = s.stageEmoji || "🦀";
  el.stage.textContent = s.stageName || "Crab";
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

// ---- bridge (real Electron) or a mock for browser preview ----
function makeMock() {
  // Preview with ?progress=N (drives stage + egg cracking). e.g. ?progress=2 shows a cracking egg.
  const params = new URLSearchParams(location.search);
  const mins = [0, 5, 15, 35];
  const names = ["Egg", "Hatchling", "Blaze", "Inferno"];
  const emojis = ["🥚", "🦀", "🔥", "🔥"];
  const progress = parseInt(params.get("progress") ?? "0", 10);
  let idx = 0;
  mins.forEach((m, i) => { if (progress >= m) idx = i; });
  const nextIdx = idx < mins.length - 1 ? idx + 1 : null;
  const sample = {
    progress,
    lifetime: 263 + progress,
    today: 3,
    week: 21,
    repoCount: 48,
    stageIndex: idx,
    stageName: names[idx],
    stageEmoji: emojis[idx],
    stageMin: mins[idx],
    nextMin: nextIdx != null ? mins[nextIdx] : null,
    nextName: nextIdx != null ? names[nextIdx] : null,
    justCommitted: false,
    gained: 0,
  };
  return {
    requestStats: () => render(sample),
    onStats: () => {},
    hide: () => {},
  };
}

const bridge = window.crab || makeMock();
bridge.onStats(render);
bridge.requestStats();

document.getElementById("close").addEventListener("click", (e) => {
  e.stopPropagation();
  bridge.hide();
});
document.getElementById("pet").addEventListener("click", () => {
  if (!root.classList.contains("stage-egg")) celebrate();
});
