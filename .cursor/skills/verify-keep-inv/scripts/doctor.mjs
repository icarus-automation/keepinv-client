#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  API_BASE,
  DEFAULT_HOST,
  DEFAULT_PORT,
  LOG_PATH,
  REPO_ROOT,
  fail,
  fetchText,
  ok,
  originOf,
  pidAlive,
  portPids,
  readState,
} from './lib.mjs';

const expectedPort = Number(process.env.KEEP_INV_VERIFY_PORT || DEFAULT_PORT);
const expectedHost = process.env.KEEP_INV_VERIFY_HOST || DEFAULT_HOST;
const expectedOrigin = originOf(expectedHost, expectedPort);

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
}

const state = readState();
if (!state) {
  fail(`no run state at expected origin ${expectedOrigin}. Launch with scripts/launch.mjs first.`);
}

const report = {
  worthDriving: false,
  origin: state.origin,
  expectedOrigin,
  pid: state.pid,
  pidAlive: pidAlive(state.pid),
  portListeners: portPids(state.port),
  frontend: { status: null, looksLikeKeepInv: false },
  api: { healthStatus: null, healthOk: false, corsAllowsOrigin: false },
  reasons: [],
};

if (state.origin !== expectedOrigin) {
  report.reasons.push(`state origin ${state.origin} does not match expected ${expectedOrigin}`);
}
if (!report.pidAlive) {
  report.reasons.push(`pid ${state.pid} is not running`);
}

try {
  const page = await fetchText(state.origin);
  report.frontend.status = page.status;
  const html = page.body.toLowerCase();
  report.frontend.looksLikeKeepInv =
    html.includes('keep inv') || html.includes('keep-inv') || html.includes('<app-root');
  if (page.status >= 500) {
    report.reasons.push(`frontend returned HTTP ${page.status}`);
  }
  if (!report.frontend.looksLikeKeepInv) {
    report.reasons.push(`frontend at ${state.origin} does not look like keep inv`);
  }
} catch (error) {
  report.reasons.push(`frontend fetch failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (!report.portListeners.length && report.frontend.status == null) {
  report.reasons.push(`nothing is listening on port ${state.port}`);
}

try {
  const health = await fetchText(`${API_BASE}/health`);
  report.api.healthStatus = health.status;
  report.api.healthOk = health.status === 200 && /"status"\s*:\s*"ok"/.test(health.body);
  if (!report.api.healthOk) {
    report.reasons.push(`API health at ${API_BASE}/health is not ok (HTTP ${health.status})`);
  }
} catch (error) {
  report.reasons.push(`API health fetch failed: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const preflight = await fetchText(`${API_BASE}/auth/get-session`, {
    method: 'OPTIONS',
    headers: {
      Origin: state.origin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  const allowOrigin =
    preflight.headers.get('access-control-allow-origin') ||
    preflight.headers.get('Access-Control-Allow-Origin');
  report.api.corsAllowsOrigin = allowOrigin === state.origin || allowOrigin === '*';
  if (!report.api.corsAllowsOrigin) {
    report.reasons.push(
      `API CORS does not allow ${state.origin} (got ${allowOrigin ?? 'no ACAO header'}). Guest UI still works; authenticated API calls from this origin will fail until CORS_ALLOWED_ORIGINS on the sibling backend includes this origin.`,
    );
  }
} catch (error) {
  report.reasons.push(`CORS probe failed: ${error instanceof Error ? error.message : String(error)}`);
}

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
report.packageName = pkg.name;
report.logPath = existsSync(LOG_PATH) ? LOG_PATH : null;

const guestOk =
  report.pidAlive &&
  report.frontend.looksLikeKeepInv &&
  report.frontend.status !== null &&
  report.frontend.status < 500 &&
  state.origin === expectedOrigin;

report.worthDriving = guestOk;
report.authenticatedDrivesOk = guestOk && report.api.healthOk && report.api.corsAllowsOrigin;

printReport(report);

if (!report.worthDriving) {
  fail('instance is not worth driving');
}

if (report.authenticatedDrivesOk) {
  ok(`healthy at ${state.origin}; API + CORS allow authenticated drives`);
} else {
  ok(`guest UI at ${state.origin} is worth driving; authenticated features are blocked until API CORS allows this origin`);
}
