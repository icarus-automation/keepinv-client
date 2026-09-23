#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  API_BASE,
  DEFAULT_HOST,
  DEFAULT_PORT,
  LOG_PATH,
  REPO_ROOT,
  RUN_DIR,
  clearRunDir,
  fail,
  fetchText,
  ok,
  originOf,
  pidAlive,
  portPids,
  readState,
  waitForHttp,
  writeState,
} from './lib.mjs';

const PORT = Number(process.env.KEEP_INV_VERIFY_PORT || DEFAULT_PORT);
const HOST = process.env.KEEP_INV_VERIFY_HOST || DEFAULT_HOST;
const ORIGIN = originOf(HOST, PORT);

function ensureIsolated() {
  const existing = readState();
  if (existing?.pid && pidAlive(existing.pid)) {
    fail(
      `a verification instance is already running (pid ${existing.pid} at ${existing.origin}). Run cleanup.mjs first.`,
    );
  }
  if (existing) {
    clearRunDir();
  }

  const occupants = portPids(PORT);
  if (occupants.length) {
    fail(
      `port ${PORT} is already in use by pid(s) ${occupants.join(', ')}. Do not hijack it. Pick KEEP_INV_VERIFY_PORT or stop that listener.`,
    );
  }

  const defaultOccupants = PORT === 4200 ? [] : portPids(4200);
  if (defaultOccupants.length) {
    ok(`localhost:4200 is already served by pid(s) ${defaultOccupants.join(', ')} — leaving it alone and using ${ORIGIN}`);
  }
}

function startServe() {
  mkdirSync(RUN_DIR, { recursive: true });
  const bunProbe = spawnSync('bun', ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: true,
  });
  const inner =
    bunProbe.status === 0
      ? `bun run start -- --port=${PORT} --host=${HOST}`
      : `npx ng serve --port=${PORT} --host=${HOST}`;
  const command = `${inner} > "${LOG_PATH}" 2>&1`;
  const child = spawn(command, {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,
    env: { ...process.env, BROWSER: 'none' },
  });
  child.unref();
  return { pid: child.pid, command };
}

ensureIsolated();

if (!existsSync(join(REPO_ROOT, 'node_modules'))) {
  fail(`node_modules is missing in ${REPO_ROOT}. Run bun install (or npm install) first.`);
}

ok(`starting keep inv at ${ORIGIN}`);
const started = startServe();
if (!started.pid) {
  fail('spawn returned no pid');
}

writeState({
  pid: started.pid,
  port: PORT,
  host: HOST,
  origin: ORIGIN,
  apiBase: API_BASE,
  command: started.command,
  startedAt: new Date().toISOString(),
  logPath: LOG_PATH,
});

try {
  await waitForHttp(ORIGIN, { timeoutMs: 180_000 });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), `See ${LOG_PATH}`);
}

const page = await fetchText(ORIGIN);
if (!page.body.includes('keep inv') && !page.body.includes('keep-inv') && !page.body.toLowerCase().includes('<app-root')) {
  fail(`served page at ${ORIGIN} does not look like keep inv`, page.body.slice(0, 400));
}

ok(`ready pid=${started.pid} origin=${ORIGIN} log=${LOG_PATH}`);
ok('this instance is the only one this run may drive. Never drive http://localhost:4200 unless doctor.mjs printed that origin as ours.');
