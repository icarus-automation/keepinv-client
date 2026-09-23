# Point of Sale

Point of Sale lets counter staff scan or search an item into the cart, tender cash or another method, and complete the sale. It exists only on plans that include POS.

## Sub-features

- `pos-gated` hides the rail link and redirects `/pos` home on BASIC plans.
- `pos-open` shows the scan field focused on a POS-enabled plan.
- `pos-search` lists matching items from `id="pos-scan"`.
- `pos-add` puts a chosen item in the cart and updates `Total due`.
- `pos-complete-cash` finishes a cash sale and shows `Sale complete`.
- `pos-new-sale` starts a fresh cart from `New sale`.

## How to get to it (user POV)

- Choose `Point of Sale` in the primary nav (Operations group).
- Open `/pos` while signed in on a POS-enabled plan.
- After a completed sale, choose `New sale`.

## Driving it with Cursor browser

Preconditions:

- Doctor reports `worthDriving` and `authenticatedDrivesOk` at `http://localhost:4320`.
- A session exists for the verify account.
- `pos-open` and later steps need a plan with POS. If the rail has no `Point of Sale` link, run only `pos-gated`.
- Completing a sale deducts real stock on the shared local API. Use a product with known on-hand quantity and prefer a cheap, in-stock `verify-` item. Do not void unless the recipe requires it.

- **Gated plan.** On BASIC, `browser_navigate` to `http://localhost:4320/pos`. The app lands on `/dashboard` (or `/`). The primary nav has no `Point of Sale` link. That is the proof for `pos-gated`.
- **Open.** On a POS plan, choose `Point of Sale` or `browser_navigate` to `http://localhost:4320/pos`. `h1` is `Point of Sale`. The combobox `Scan or search items` (`id="pos-scan"`) is present. Region `Payment` shows `Total due`.
- **Search.** Fill `id="pos-scan"` with a product name or SKU. Run `browser_fill`. A listbox `pos-results` opens with matching options.
- **Add to cart.** Choose a result (Enter on a unique barcode, or click the option). The cart lists that name and `Total due` is no longer zero. `Complete sale` stays disabled until tender is valid.
- **Cash complete.** Choose payment method `Cash` if it is not already pressed (`aria-pressed="true"`). Fill `Amount tendered` (`id="pos-tendered"`) with an amount ≥ total due. Choose `Complete sale`. Heading `Sale complete` appears with `Change due`.
- **New sale.** Choose `New sale`. The scan field returns and the cart is empty.
- **Proof.** For `pos-open`, snapshot the scan field and `Total due`. For `pos-complete-cash`, snapshot `Sale complete` at `evidence/point-of-sale/complete.aria.txt` and `.png`. Include a second read: open `Sales` and find the new receipt.

## Gotchas

- Completing a sale is a real mutation. Do not run `pos-complete-cash` as a casual smoke test against production-like local data.
- `Complete sale` disabled with a hint is not a failure; cash needs tender ≥ total.
- Hardware scanners type into `id="pos-scan"`. Do not steal focus with other fills while proving search.
- Sales and Sales Report are the same POS entitlement. If POS is gated, those rail links are absent too.
