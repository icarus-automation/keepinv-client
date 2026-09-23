import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = join(HERE, '..');
export const REPO_ROOT = join(SKILL_ROOT, '..', '..', '..');
export const RUN_DIR = join(SKILL_ROOT, '.run');
export const STATE_PATH = join(RUN_DIR, 'state.json');
export const LOG_PATH = join(RUN_DIR, 'ng-serve.log');
export const EVIDENCE_DIR = join(SKILL_ROOT, 'evidence');

export const DEFAULT_PORT = 4320;
export const DEFAULT_HOST = 'localhost';
export const API_BASE = 'http://localhost:8000/api/v1';
export const APP_NAME = 'keep inv';

export function originOf(host, port) {
  return `http://${host}:${port}`;
}

export function readState() {
  if (!existsSync(STATE_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

export function writeState(state) {
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

export function clearRunDir() {
  if (existsSync(RUN_DIR)) {
    rmSync(RUN_DIR, { recursive: true, force: true });
  }
}

export function pidAlive(pid) {
  if (!pid || !Number.isInteger(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function portPids(port) {
  if (process.platform === 'win32') {
    const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    if (result.status !== 0) {
      return [];
    }
    const pids = new Set();
    const suffix = `:${port}`;
    for (const line of result.stdout.split(/\r?\n/)) {
      if (!/\sLISTENING\s/.test(line)) {
        continue;
      }
      const cols = line.trim().split(/\s+/);
      const local = cols[1] ?? '';
      if (local === `${port}` || local.endsWith(suffix)) {
        const pid = Number(cols.at(-1));
        if (Number.isInteger(pid) && pid > 0) {
          pids.add(pid);
        }
      }
    }
    return [...pids];
  }

  const result = spawnSync('lsof', [`-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  return result.stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export async function fetchText(url, init = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
    const body = await response.text();
    return { ok: response.ok, status: response.status, headers: response.headers, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForHttp(url, { timeoutMs = 120_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not tried';
  while (Date.now() < deadline) {
    try {
      const result = await fetchText(url, {}, 2000);
      if (result.status > 0 && result.status < 500) {
        return result;
      }
      lastError = `HTTP ${result.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url} (${lastError})`);
}

export function fail(message, extra) {
  console.error(`verify-keep-inv: ${message}`);
  if (extra) {
    console.error(extra);
  }
  process.exit(1);
}

export function ok(message) {
  console.log(`verify-keep-inv: ${message}`);
}
