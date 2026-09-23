# Products

Products is the catalog: search or scan to find an item, inspect it in the detail pane, and add a new one without leaving the page.

## Sub-features

- `products-open` shows the catalog at `/products`.
- `products-search` filters the list from the search field.
- `products-select` opens a row in the detail pane.
- `products-new-button` opens the create form from `New product`.
- `products-new-chord` opens the same form from `N` then `P`.
- `products-create` persists a named product and shows it after save.
- `products-cancel` discards an unsaved create form.

## How to get to it (user POV)

- Choose `Products` in the primary nav.
- Open `/products` while signed in.
- From Dashboard empty state, choose `Go to Products`.
- Press `N` then `P` while focus is outside an editable field.
- Open `/products?new=1` (the chord writes this query, then strips it).

## Driving it with Cursor browser

Preconditions:

- Doctor reports `worthDriving` and `authenticatedDrivesOk` at `http://localhost:4320`.
- A session exists for the verify account.
- Create recipes use a unique name and SKU prefixed `verify-` (for example `verify-gasket-4320` / `VERIFY-4320-1`). Category is required; pick an existing one or quick-add from `New` next to the category select.

- **Open catalog.** Choose `Products` or `browser_navigate` to `http://localhost:4320/products`. `h1` is `Products`. Either the region `Product catalog` is present, or the empty copy `No products yet` is present.
- **Search.** Focus `Search products` (`id="product-search"`) and fill a known product name or SKU. Run `browser_fill` on that field. After the debounce, the catalog lists the match and not unrelated rows. Empty matches show `No products match these filters.`
- **Select row.** Choose a product name in `Product catalog`. The region `Product details` shows that name.
- **New from button.** Choose `New product`. Run `browser_click` on the button named `New product`. Heading `New product` appears; `Product name` (`id="pf-name"`) is focused.
- **New from chord.** From `/products` with focus not in an input, press `N` then `P`. A status `New…` appears after `N`; after `P` the create form opens the same way as the button.
- **Create.** Fill `Product name` and `SKU`, choose a category, then choose `Create product`. Run `browser_fill` on `id="pf-name"` and `id="pf-sku"`, then `browser_click` `Create product`. The detail pane shows the new name; searching the catalog for that SKU returns the row.
- **Cancel.** Open create, type `verify-discard`, choose `Cancel`. The form closes and the catalog has no `verify-discard` row.
- **Proof.** Snapshot the catalog (or detail) that contains the asserted name: `evidence/products/<step>.aria.txt` and `evidence/products/<step>.png`.

## Gotchas

- Search waits ~300ms after the last keystroke. Assert the list or empty copy, not a fixed sleep alone.
- `N` then `P` types into the field if search, email, or the product form is focused. Click the heading or a non-input first.
- Create requires a category. Saving without one stays on the form; that is not a successful `products-create`.
- Stock is not set on create. `0 on hand` after create is expected.
- Creating writes the shared local API. Prefix `verify-` and do not leave duplicate SKUs.
