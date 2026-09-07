"use strict";

// GitHub commit tracking via OAuth Device Flow and the GraphQL contributions
// API. No client secret is used (device flow), so nothing secret ships in the
// app. The "repo" scope is requested so private-repo commits are counted too.

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const GRAPHQL_URL = "https://api.github.com/graphql";
const SCOPE = "read:user repo";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Step 1: ask GitHub for a device code + the short user code to type in.
async function requestDeviceCode(clientId) {
  const data = await postJson(DEVICE_CODE_URL, { client_id: clientId, scope: SCOPE });
  if (!data.device_code) {
    throw new Error(data.error_description || "Could not start GitHub sign-in.");
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval || 5,
    expiresIn: data.expires_in || 900,
  };
}

// Step 2: poll until the user authorizes in the browser (or it fails/expires).
async function pollForToken(clientId, deviceCode, interval, expiresIn) {
  const deadline = Date.now() + (expiresIn || 900) * 1000;
  let wait = (interval || 5) * 1000;
  while (Date.now() < deadline) {
    await sleep(wait);
    const data = await postJson(TOKEN_URL, {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (data.access_token) return data.access_token;
    switch (data.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        wait += 5000;
        break;
      case "expired_token":
        throw new Error("The sign-in code expired. Please try again.");
      case "access_denied":
        throw new Error("Sign-in was cancelled.");
      default:
        throw new Error(data.error_description || "GitHub sign-in failed.");
    }
  }
  throw new Error("The sign-in code expired. Please try again.");
}

async function graphql(token, query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "claude-crab",
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors && data.errors.length) {
    throw new Error(data.errors[0].message || "GitHub query failed.");
  }
  return data.data;
}

// With the "repo" scope, private-repo commits are already included in
// totalCommitContributions, so that single field is the commit count.
function commitsOf(collection) {
  return (collection && collection.totalCommitContributions) || 0;
}

const STATS_QUERY = `
query($from: DateTime!, $todayFrom: DateTime!, $weekFrom: DateTime!) {
  viewer {
    login
    createdAt
    since: contributionsCollection(from: $from) {
      totalCommitContributions
      restrictedContributionsCount
    }
    today: contributionsCollection(from: $todayFrom) { totalCommitContributions }
    week: contributionsCollection(from: $weekFrom) { totalCommitContributions }
    repositoriesContributedTo(contributionTypes: [COMMIT]) { totalCount }
  }
}`;

// Commit stats since the given adoption date, plus today/this week and the
// number of repos contributed to. The contributions API only allows a window
// of up to one year, so `from` is clamped to no earlier than a year ago.
async function fetchStats(token, sinceISO) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const yearAgo = new Date(now.getTime() - 364 * 24 * 3600 * 1000);
  const from = new Date(
    Math.max(new Date(sinceISO).getTime() || yearAgo.getTime(), yearAgo.getTime())
  );

  const data = await graphql(token, STATS_QUERY, {
    from: from.toISOString(),
    todayFrom: midnight.toISOString(),
    weekFrom: weekAgo.toISOString(),
  });
  const v = data.viewer;
  return {
    login: v.login,
    createdAt: v.createdAt,
    sinceAdoption: commitsOf(v.since),
    today: commitsOf(v.today),
    week: commitsOf(v.week),
    repoCount: v.repositoriesContributedTo.totalCount,
  };
}

const YEAR_QUERY = `
query($from: DateTime!, $to: DateTime!) {
  viewer { contributionsCollection(from: $from, to: $to) { totalCommitContributions } }
}`;

// Total commit contributions across the whole account, summed year by year
// (each contributions query is limited to a one-year window). Used once at
// adoption to seed the lifetime counter.
async function fetchLifetimeCommits(token, createdAtISO) {
  const now = new Date();
  let from = new Date(createdAtISO);
  if (Number.isNaN(from.getTime())) from = new Date(now.getFullYear() - 1, 0, 1);
  let total = 0;
  while (from < now) {
    const to = new Date(Math.min(from.getTime() + 364 * 24 * 3600 * 1000, now.getTime()));
    const data = await graphql(token, YEAR_QUERY, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    total += data.viewer.contributionsCollection.totalCommitContributions || 0;
    from = new Date(to.getTime() + 1000);
  }
  return total;
}

module.exports = {
  requestDeviceCode,
  pollForToken,
  fetchStats,
  fetchLifetimeCommits,
  SCOPE,
};
