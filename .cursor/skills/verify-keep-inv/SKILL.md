---
name: verify-keep-inv
description: Drive the keep inv Angular web UI in a real browser to prove operator-facing behavior (sign-in, dashboard, catalog, POS, categories). Use when launching, doctoring, or verifying a user-visible change in this frontend.
---

# Verify keep inv

keep inv (`keep-inv` in `package.json`) is the Angular counter terminal in this repo. Operators sign in, then sell, look up stock, and keep inventory honest. The only surface this skill drives is the **web UI**. Unit tests (`ng test` / Vitest) and the sibling Nest API (`asset-wise-backend` on `http://localhost:8000`) are not substitutes for a proof.

There is no Playwright or Cypress harness in this repo. Drive the running app through **Cursor's browser tools** (`browser_navigate`, `browser_lock`, `browser_snapshot`, `browser_fill`, `browser_click`, `browser_take_screenshot`). Prefer accessible names, heading text, and the `id`s listed below over CSS, coordinates, or tab order.

Read `features/README.md` before driving. A proof that uses one convenient entry point is incomplete when the matching feature file lists others.

## Launch

Verification always starts **its own** frontend on port **4320**. `http://localhost:4200` is the operator's default `ng serve` and is frequently already running — never attach to it, never kill it.

From the repo root:

```bash
node .cursor/skills/verify-keep-inv/scripts/launch.mjs
```

What it does:

- Refuses if `.cursor/skills/verify-keep-inv/.run/state.json` already names a live pid, or if port `4320` is taken.
- Spawns `bun run start -- --port=4320 --host=localhost` (falls back to `npx ng serve --port=4320 --host=localhost`).
- Writes pid, origin, and log path to `.cursor/skills/verify-keep-inv/.run/state.json`.
- Waits until `http://localhost:4320/` answers (Angular prints `Local:   http://localhost:4320/` in `.run/ng-serve.log`).

Ready means `GET http://localhost:4320/` returns HTML that contains `<app-root` or `keep inv`.

Override only when 4320 is blocked: `KEEP_INV_VERIFY_PORT=4321 node .cursor/skills/verify-keep-inv/scripts/launch.mjs`. Then every later command and browser URL must use that origin.

The API is **not** started by this skill. Development expects `http://localhost:8000/api/v1` (`src/environments/environment.ts`). Health is `GET http://localhost:8000/api/v1/health`. If that fails, guest UI can still be driven; authenticated pages cannot.

Teardown is `scripts/cleanup.mjs` (see Cleanup). After every failed launch or drive, run cleanup before retrying.

## Doctor

Run this first whenever anything looks off, and once after launch before touching the browser:

```bash
node .cursor/skills/verify-keep-inv/scripts/doctor.mjs
```

It is read-only. It prints JSON and exits `0` only when this run's pid is alive and `http://localhost:4320/` looks like keep inv.

Require:

- `worthDriving: true`
- `origin` equals `http://localhost:4320` (or the `KEEP_INV_VERIFY_PORT` you launched)
- `pidAlive: true`
- `frontend.looksLikeKeepInv: true`

`authenticatedDrivesOk: true` additionally requires API health `ok` and CORS allowing this origin. The sibling backend `.env` defaults `CORS_ALLOWED_ORIGINS` to `http://localhost:4200` only. Guest recipes still run when CORS is blocked; authenticated recipes must be reported as unmet — do **not** fall back to driving 4200.

Refuse to drive when doctor fails, when origin is 4200 and state.json does not own it, or when 4320 is served by a pid this run did not start.

## Drive

Harness: Cursor browser tools against the origin doctor printed.

Baseline:

1. `node .cursor/skills/verify-keep-inv/scripts/launch.mjs` unless doctor already reports this run healthy.
2. `node .cursor/skills/verify-keep-inv/scripts/doctor.mjs` — require `worthDriving`.
3. `browser_tabs` with `action: "list"`. Create a **new** tab (`action: "new"`) for this run; do not reuse a tab that is already on `:4200`.
4. `browser_navigate` to the origin (guest) or a feature path. Then `browser_lock` with `action: "lock"`.
5. `browser_snapshot` and act by **ref**. Never click by coordinates. After `browser_navigate`, wait until the route heading and tab title have updated (`Sign in · keep inv`, not the `index.html` title `keep inv · POS and inventory`).
6. Unlock when the drive is finished.

Stable handles (real markup in this repo):

| Place | Handle |
| --- | --- |
| Unauthenticated redirect | `/` → `/auth/login` via `authGuard` |
| Sign-in heading | `h1` text `Sign in` |
| App wordmark | `keep` + `inv` on the login card; tab title `Sign in · keep inv` |
| Email | `label` `Email`, input `id="email"` |
| Password | `label` `Password`, input `id="password"` (PrimeNG `p-password`) |
| Submit | button name `Sign in` (becomes `Signing in...` while the request is in flight) |
| Credential failure | `role="alert"` text `Invalid email or password.` (HTTP 401 only) |
| Network/CORS failure | `role="alert"` text `Cannot reach the server. Check your connection and try again.` |
| Signed-in shell nav | `nav` name `Primary` |
| Dashboard | link name `Dashboard` → `/dashboard`, `h1` `Dashboard`, tab `Dashboard · keep inv` |
| Products | link name `Products` → `/products`, `h1` `Products` |
| Product search | `label` `Search products`, input `id="product-search"` |
| New product | button name `New product`; chord `N` then `P` (not while a field is focused) |
| Product form | heading `New product`; fields `Product name` (`id="pf-name"`), `SKU` (`id="pf-sku"`); submit `Create product` |
| Categories | link name `Categories` → `/categories`; add field `id="add-category"`; submit `Add` |
| POS | link name `Point of Sale` → `/pos` (hidden / redirected home on BASIC plans) |
| POS scan | `label` `Scan or search items`, input `id="pos-scan"` |
| Complete sale | button name `Complete sale` |
| Account menu | button name starting `Account: ` |
| Sign out | menu item `Sign out` |

Do not type into the POS scan field and the login email with a global keypress helper. Fill the named control.

Credentials for signed-in recipes: `KEEP_INV_VERIFY_EMAIL` and `KEEP_INV_VERIFY_PASSWORD`. If unset, read the demo org owner from the sibling repo `asset-wise-backend/prisma/seeds/accounts.ts` (documented in that repo's README). Never write passwords into evidence files.

Auth is an httpOnly Better Auth cookie (`POST /api/v1/auth/sign-in/email`, `withCredentials`). There is no bearer token to inject.

## Evidence

Root: `.cursor/skills/verify-keep-inv/evidence/<feature-id>/`

Every proof writes at least:

- `<step>.aria.txt` — the `browser_snapshot` YAML for that step (action **and** result, not only the last screen)
- `<step>.png` — `browser_take_screenshot` with `filename` `.cursor/skills/verify-keep-inv/evidence/<feature-id>/<step>.png`. Cursor often writes that file under the OS temp screenshots directory; copy it into the evidence folder before cleanup. The ARIA file is written with the Write tool, not left in temp.
- `run.json` — `{ "feature": "<id>", "entryPoint": "<path or control>", "origin": "http://localhost:4320", "doctor": { "worthDriving": true, "authenticatedDrivesOk": <bool> }, "at": "<ISO-8601>" }`

Proof standards:

- Exercise the real operator path (type, click, submit). Do not set Angular signals, hit test-only URLs, or PATCH localStorage to fake a session.
- Capture the action and the resulting state. A signed-in dashboard screenshot without the login submit (or a session that already existed) is not a sign-in proof.
- Mutations (create product, add category, complete sale) need a second user-facing read: leave the form, reopen the record / see it in the list. The shared local API at `:8000` is real tenant data — prefer unique names prefixed `verify-` and delete or archive what you created, but keep the evidence files.
- Hardware (RFID reader, NIIMBOT printer, barcode scanner) is a production boundary. Do not mock the API. Skip the hardware-only sub-feature and record the unmet precondition.
- Login is rate-limited on the API. Do not retry credential failures in a tight loop.

## Cleanup

```bash
node .cursor/skills/verify-keep-inv/scripts/cleanup.mjs
```

Kills **only** the pid in `.run/state.json` (Windows: `taskkill /PID <pid> /T /F`). Removes `.run/`. Does **not** delete `evidence/`. Does **not** stop `localhost:4200`, `localhost:8000`, or any process it did not start.

If launch or doctor failed after a spawn, still run cleanup so port 4320 is not stranded.

## Helpers

All helpers are Node ESM. Run them from the repo root with `node`. They print `verify-keep-inv:` lines and (for doctor) a JSON report.

| Script | Invocation |
| --- | --- |
| Launch | `node .cursor/skills/verify-keep-inv/scripts/launch.mjs` |
| Doctor | `node .cursor/skills/verify-keep-inv/scripts/doctor.mjs` |
| Cleanup | `node .cursor/skills/verify-keep-inv/scripts/cleanup.mjs` |

Shared constants live in `scripts/lib.mjs`. Do not reverse-engineer flags; there are none besides `KEEP_INV_VERIFY_PORT` / `KEEP_INV_VERIFY_HOST`.
