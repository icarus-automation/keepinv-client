#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { STATE_PATH, clearRunDir, fail, ok, pidAlive, readState } from './lib.mjs';

const state = readState();
if (!state) {
  ok('nothing to clean up (no .run/state.json)');
  process.exit(0);
}

function killTree(pid) {
  if (!pidAlive(pid)) {
    return { killed: false, detail: 'already gone' };
  }
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const detail = pidAlive(pid)
      ? (result.stdout + result.stderr).trim() || 'taskkill failed'
      : 'stopped';
    return { killed: !pidAlive(pid), detail };
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // fall through to existence check
    }
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && pidAlive(pid)) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (pidAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
  return { killed: !pidAlive(pid), detail: pidAlive(pid) ? 'still alive' : 'stopped' };
}

ok(`stopping pid ${state.pid} started for ${state.origin}`);
const result = killTree(state.pid);
if (pidAlive(state.pid)) {
  fail(`pid ${state.pid} is still alive after cleanup`, result.detail);
}

clearRunDir();
ok(`run state removed (${STATE_PATH} gone). Evidence under evidence/ is untouched.`);
ok(result.detail || 'stopped');
