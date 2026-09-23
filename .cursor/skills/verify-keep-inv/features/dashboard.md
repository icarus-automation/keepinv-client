# Dashboard

Dashboard is the signed-in home: a snapshot of stock on hand, stock value, and what needs chasing, or an empty state that sends the operator to Products.

## Sub-features

- `dash-open` shows `Dashboard` as the page title after sign-in or from the rail.
- `dash-kpis` shows the stock overview (Products, Assets tracked, Stock value, Low stock) when inventory exists.
- `dash-empty` shows `No inventory yet` and `Go to Products` when the catalog is empty.
- `dash-error` shows `Could not load the dashboard` when the report request fails.
- `dash-refresh` reloads the report from the `Refresh` button.

## How to get to it (user POV)

- Sign in; the app routes to `/dashboard`.
- Choose `Dashboard` in the primary nav.
- Open `/dashboard` while signed in.

## Driving it with Cursor browser

Preconditions:

- Doctor reports `worthDriving` and `authenticatedDrivesOk` at `http://localhost:4320`.
- A session exists for the verify account (see [Sign in](./sign-in.md)).

- **Home after sign-in.** Land on `/dashboard` from a successful sign-in, or `browser_navigate` to `http://localhost:4320/dashboard`. `h1` is `Dashboard`, tab title is `Dashboard · keep inv`, and the `Dashboard` nav link has `aria-current="page"`.
- **Rail entry.** From another signed-in page, choose `Dashboard`. Run `browser_click` on the link named `Dashboard` inside `nav` `Primary`. The same heading and current-page state appear.
- **Stock overview.** When the tenant has products, a region named `Stock overview` lists `Products`, `Assets tracked`, `Stock value`, and `Low stock` as numeric terms. Those numbers are the proof, not a spinner.
- **Empty catalog.** When the tenant has no products, the page shows `No inventory yet` and a control named `Go to Products`. Choosing it opens `/products`.
- **Load failure.** If the report cannot load, the page shows `Could not load the dashboard` and `Retry`. That copy is the proof for `dash-error`; do not inject a fake error.
- **Refresh.** Choose `Refresh`. Run `browser_click` on the button named `Refresh`. The overview remains (or the empty/error state remains) after loading finishes; a transient spinner is not the proof.
- **Proof.** Snapshot and screenshot `evidence/dashboard/open.aria.txt` and `evidence/dashboard/open.png` with the `Dashboard` heading and either the KPI region or the empty-state copy visible.

## Gotchas

- BASIC and PRO tenants both get Dashboard. Missing POS links in the rail are not a dashboard failure.
- KPI values come from `GET /api/v1/reports/inventory-dashboard`. Stale numbers after a sale mean you did not refresh; choose `Refresh` before asserting.
- The empty state is suppressed only when inventory exists. Do not seed products solely to avoid it unless the recipe under test needs KPIs.
