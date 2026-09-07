"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Recursively find git repositories under a root directory, up to maxDepth.
 * Skips node_modules and nested .git internals for speed.
 */
function findRepos(root, maxDepth) {
  const found = [];
  const SKIP = new Set([
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".cache",
    "Library",
  ]);

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // A directory containing .git is a repo; record it and don't descend further.
    if (entries.some((e) => e.name === ".git")) {
      found.push(dir);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (SKIP.has(entry.name)) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  walk(root, 0);
  return found;
}

/** Run git and resolve stdout, never rejecting (errors -> empty string). */
function git(repo, args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", repo, ...args],
      { timeout: 8000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve("");
        resolve(String(stdout).trim());
      }
    );
  });
}

/** Count commits on HEAD authored by any of the given emails, with optional extra args. */
async function countCommits(repo, emails, extraArgs = []) {
  const authorArgs = emails.flatMap((e) => ["--author", e]);
  const out = await git(repo, [
    "rev-list",
    "--count",
    ...authorArgs,
    ...extraArgs,
    "HEAD",
  ]);
  const n = parseInt(out, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Scan all repos under the configured roots and total up commits by the user.
 * Returns { lifetime, today, week, repoCount, scannedAt }.
 */
async function scan(config) {
  const roots = config.watchRoots || [];
  const emails = config.authorEmails || [];
  const depth = config.scanDepth || 4;

  const repoSet = new Set();
  for (const root of roots) {
    for (const repo of findRepos(root, depth)) repoSet.add(repo);
  }
  const repos = [...repoSet];

  let lifetime = 0;
  let today = 0;
  let week = 0;

  // Process repos in parallel batches to stay fast without spawning hundreds at once.
  const BATCH = 8;
  for (let i = 0; i < repos.length; i += BATCH) {
    const batch = repos.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (repo) => {
        const [all, day, wk] = await Promise.all([
          countCommits(repo, emails),
          countCommits(repo, emails, ["--since=midnight"]),
          countCommits(repo, emails, ["--since=7.days.ago"]),
        ]);
        return { all, day, wk };
      })
    );
    for (const r of results) {
      lifetime += r.all;
      today += r.day;
      week += r.wk;
    }
  }

  return {
    lifetime,
    today,
    week,
    repoCount: repos.length,
    scannedAt: Date.now(),
  };
}

module.exports = { scan, findRepos };
