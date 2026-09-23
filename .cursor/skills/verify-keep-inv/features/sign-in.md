# Sign in

Sign in lets an operator open the counter with email and password, see a precise error when that fails, and leave the session from the account menu.

## Sub-features

- `signin-redirect` sends an anonymous visit to `/auth/login`.
- `signin-validate` refuses an empty or malformed form without calling the API.
- `signin-reject` shows `Invalid email or password.` on HTTP 401.
- `signin-success` lands on `/dashboard` with the primary nav visible.
- `signin-out` returns the operator to `/auth/login` and blocks `/dashboard`.

## How to get to it (user POV)

- Open `http://localhost:4320/` while signed out.
- Open `http://localhost:4320/auth/login` while signed out.
- Choose `Sign out` from the account menu while signed in.

## Driving it with Cursor browser

Preconditions:

- Doctor reports `worthDriving` at `http://localhost:4320`.
- The browser tab is one this run created, not a tab already on `:4200`.
- `signin-success` and `signin-out` also need `authenticatedDrivesOk: true` and credentials from `KEEP_INV_VERIFY_EMAIL` / `KEEP_INV_VERIFY_PASSWORD` (or the sibling seed owner).

- **Anonymous root.** Navigate to `/`. Run `browser_navigate` to `http://localhost:4320/`. The URL becomes `/auth/login`, the heading is `Sign in`, and the tab title is `Sign in · keep inv`.
- **Direct login URL.** Navigate to `/auth/login`. Run `browser_navigate` to `http://localhost:4320/auth/login`. The same `Sign in` heading and `keep inv` wordmark are visible. Focus is in the `Email` field.
- **Empty submit.** Leave both fields blank and choose `Sign in`. Run `browser_click` on the button named `Sign in`. Alerts read `Enter a valid email address.` and `Password is required.` The URL stays `/auth/login`.
- **Bad email shape.** Fill `Email` with `not-an-email`. Run `browser_fill` on `id="email"`. Choose `Sign in`. The email alert remains `Enter a valid email address.`
- **Unknown credentials.** Fill a well-formed email and a wrong password, then choose `Sign in`. Run `browser_fill` on `id="email"` and `id="password"`, then `browser_click` `Sign in`. When CORS and the API are healthy, a `role="alert"` reads `Invalid email or password.` When CORS blocks this origin, the alert is `Cannot reach the server. Check your connection and try again.` — that is not a credential proof; record `signin-reject` as unmet.
- **Successful sign-in.** Fill the verify email and password and choose `Sign in`. The button label becomes `Signing in...`, then the URL is `/dashboard`, `nav` named `Primary` is present, and `h1` is `Dashboard`.
- **Sign out.** Open the account button named `Account: …` and choose `Sign out`. Run `browser_click` on that account button, then on `Sign out`. The URL is `/auth/login`. Navigating to `/dashboard` returns to `/auth/login`.
- **Proof.** Capture the state that matches the sub-feature under test. Run `browser_snapshot` saved to `evidence/sign-in/<step>.aria.txt` and `browser_take_screenshot` with `filename` `.cursor/skills/verify-keep-inv/evidence/sign-in/<step>.png`. The artifacts show `keep inv` and the heading or alert asserted above.

## Gotchas

- Anonymous `/` first paints `index.html` with tab title `keep inv · POS and inventory` and an empty snapshot. Wait until the heading is `Sign in` and the title is `Sign in · keep inv` before asserting.
- PrimeNG wraps the password field; fill `id="password"`, not a generic `textbox` named `Password` if the snapshot also exposes the show-password toggle.
- Only HTTP 401 is `Invalid email or password.` A down API, CORS miss, or 429 is a different alert. Do not treat those as a credential proof.
- `/auth/login` is guest-only. A leftover session from another tab on this origin redirects to `/`.
- The API throttles auth. Wait before retrying `signin-reject`.
- Do not write the password into `run.json` or screenshots of filled password fields when a heading-plus-nav shot will do.
