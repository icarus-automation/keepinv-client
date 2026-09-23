# Categories

Categories are how the shop groups products. An operator adds a name from the Categories page and sees it in the list used by the catalog.

## Sub-features

- `categories-open` shows `/categories` with the add field focused.
- `categories-add` creates a category from the top form.
- `categories-list` shows the new name under `Your categories`.
- `categories-reject-blank` refuses an empty add.

## How to get to it (user POV)

- Choose `Categories` in the primary nav (Catalog group).
- Open `/categories` while signed in.
- From a product form, choose `New` next to Category (quick-add popover). That path must be proven separately; it is not a substitute for this page.

## Driving it with Cursor browser

Preconditions:

- Doctor reports `worthDriving` and `authenticatedDrivesOk` at `http://localhost:4320`.
- A session exists for the verify account.
- Use a unique name prefixed `verify-` (for example `verify-filters-4320`). Do not add a duplicate of a live shop category.

- **Open.** Choose `Categories` or `browser_navigate` to `http://localhost:4320/categories`. `h1` is `Categories`. The field labelled `Add a category` (`id="add-category"`) is present. Heading `Your categories` is present, or the empty copy `No categories yet`.
- **Blank add.** Leave the field empty and choose `Add`. Run `browser_click` on the button named `Add`. An alert appears next to the field; the list does not gain a blank row.
- **Add.** Fill `id="add-category"` with `verify-filters-4320` and choose `Add`. Run `browser_fill` then `browser_click` `Add`. The button may read `Adding...`. Then `Your categories` contains `verify-filters-4320`.
- **Second read.** Reload `/categories` or navigate away to Products and back. The name is still in `Your categories`.
- **Proof.** Snapshot the list containing the new name: `evidence/categories/add.aria.txt` and `evidence/categories/add.png`.

## Gotchas

- Category names collide case-insensitively. A second `verify-filters-4320` is a conflict, not a successful add.
- Adding a category writes the shared API. Prefix `verify-` and do not delete shop categories you did not create.
- The product-form `New` popover creates a category too; proving only that popover does not prove this page's entry points.
