# keep inv verification map

This directory is the maintained source for verifying the operator-facing behavior of keep inv. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-keep-inv/scripts/launch.mjs` so the app is at `http://localhost:4320`, not `http://localhost:4200`.
- Run `node .cursor/skills/verify-keep-inv/scripts/doctor.mjs` and require `worthDriving: true` and `origin: "http://localhost:4320"`.
- Never drive an instance this run did not start. A listener on port 4200 is the operator's session — leave it alone.
- Guest recipes (sign-in page, client validation, unauthenticated redirect) need only the frontend.
- Authenticated recipes also need `authenticatedDrivesOk: true` (API `GET /api/v1/health` ok, and CORS allowing `http://localhost:4320`). If CORS is blocked, record the unmet precondition; do not switch origins.
- Signed-in credentials come from `KEEP_INV_VERIFY_EMAIL` / `KEEP_INV_VERIFY_PASSWORD`, or the demo org owner in sibling `asset-wise-backend/prisma/seeds/accounts.ts`. Do not paste passwords into evidence.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer accessible names, heading text, and the listed `id`s over CSS or DOM position.
- Treat every command as literal. Keep quoted names unchanged.
- Browser actions go through Cursor `browser_*` tools against the doctor origin.
- After a mutation, restore or uniquely name fixture data. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with `keep inv` or the shop name visible.
- Mutation proof includes a second user-facing read of the saved value.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.
- POS, receipt scan, and barcode-sheet are plan-gated. BASIC tenants redirect home; that redirect is the proof for the gated entry, not a failure of the page.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Cursor browser` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Sign in](./sign-in.md) covers the guest landing, client validation, credential success and failure, and sign-out.
- [Dashboard](./dashboard.md) covers the signed-in home, stock KPIs, empty inventory, and load failure.
- [Products](./products.md) covers catalog search, opening a product, and creating one from the button and the `N` then `P` chord.
- [Point of Sale](./point-of-sale.md) covers scan/search into the cart and completing a cash sale on a POS-enabled plan.
- [Categories](./categories.md) covers adding a category from the catalog rail and seeing it in the list.
