/**
 * The organization's default pricing rule and the money math that applies it, mirrored from the
 * backend `PricingBasis` enum and `GET /organizations/pricing-defaults`.
 *
 * Both conventions already existed in the product before this rule did: the product detail pane
 * reports margin as a share of price, receipt imports mark up on cost. The tenant picks whichever
 * one they actually price in, so neither screen has to lie about what the number means.
 */
export type PricingBasis = 'MARKUP_ON_COST' | 'MARGIN_ON_PRICE';

export interface PricingDefaults {
  pricingBasis: PricingBasis;
  /** Null means no default is configured, so nothing is auto-filled anywhere. */
  defaultPricingPercent: number | null;
}

/**
 * Used before hydration and whenever the call fails. Fails safe: no percentage means the product
 * form behaves exactly as it did before this feature, rather than guessing a price.
 */
export const NO_PRICING_DEFAULTS: PricingDefaults = {
  pricingBasis: 'MARKUP_ON_COST',
  defaultPricingPercent: null,
};

/** Ceilings mirrored from update-pricing-defaults.dto.ts; the server rejects anything above. */
export const MAX_MARKUP_PERCENT = 1000;
export const MAX_MARGIN_PERCENT = 99.99;

export interface PricingBasisOption {
  readonly id: PricingBasis;
  readonly label: string;
  readonly formula: string;
  readonly hint: string;
}

export const PRICING_BASIS_OPTIONS: readonly PricingBasisOption[] = [
  {
    id: 'MARKUP_ON_COST',
    label: 'Markup on cost',
    formula: 'cost + %',
    hint: 'Added on what you paid. 30% on a ₱100 cost sells at ₱130.00.',
  },
  {
    id: 'MARGIN_ON_PRICE',
    label: 'Margin on price',
    formula: '% of price',
    hint: 'Your cut of the selling price. 30% on a ₱100 cost sells at ₱142.86.',
  },
];

/** The largest percentage this basis accepts. A margin is a share of price, so it stays under 100. */
export function maxPercentFor(basis: PricingBasis): number {
  return basis === 'MARGIN_ON_PRICE' ? MAX_MARGIN_PERCENT : MAX_MARKUP_PERCENT;
}

/**
 * The selling price the default rule implies for a cost price, rounded to the two decimals the
 * money columns store. Null when no default is configured or the cost is unusable, which callers
 * read as "leave the field alone".
 */
export function sellingPriceFrom(
  costPrice: number | null | undefined,
  defaults: PricingDefaults,
): number | null {
  const percent = defaults.defaultPricingPercent;
  if (percent === null || costPrice == null || !Number.isFinite(costPrice) || costPrice < 0) {
    return null;
  }
  if (defaults.pricingBasis === 'MARGIN_ON_PRICE') {
    // At 100 the divisor is zero and beyond it the price flips negative. The server caps the
    // stored value below 100; this guard covers a stale or hand-edited payload.
    if (percent >= 100) {
      return null;
    }
    return round2(costPrice / (1 - percent / 100));
  }
  return round2(costPrice * (1 + percent / 100));
}

/**
 * The same rule expressed as a markup on cost, for the receipt import whose API takes a markup.
 * A margin converts exactly; rounding it to the two decimals that field accepts costs at most a
 * few centavos on a large cost, and the operator reviews every line price before committing.
 *
 * Null when there is nothing sane to prefill: no default set, or a margin so close to 100 that its
 * markup runs past MAX_MARKUP_PERCENT and the import would reject it (a 91% margin is already a
 * 10x markup). Callers read null as "leave the field blank".
 */
export function equivalentMarkupPercent(defaults: PricingDefaults): number | null {
  const percent = defaults.defaultPricingPercent;
  if (percent === null) {
    return null;
  }
  if (defaults.pricingBasis !== 'MARGIN_ON_PRICE') {
    return percent;
  }
  if (percent >= 100) {
    return null;
  }
  const markup = round2((percent / (100 - percent)) * 100);
  return markup > MAX_MARKUP_PERCENT ? null : markup;
}

/**
 * The rule in words, for hints that have to say what a number was derived from, e.g. "30% markup
 * on cost". Null when no default is configured.
 */
export function pricingRuleLabel(defaults: PricingDefaults): string | null {
  const percent = defaults.defaultPricingPercent;
  if (percent === null) {
    return null;
  }
  const basis = defaults.pricingBasis === 'MARGIN_ON_PRICE' ? 'margin on price' : 'markup on cost';
  return `${formatPercent(percent)}% ${basis}`;
}

/** Drops the trailing zeros a 2-decimal column carries, so 30.00 reads as "30". */
export function formatPercent(percent: number): string {
  return String(Number(percent.toFixed(2)));
}

/**
 * Rounds to 2 decimals. `toPrecision(12)` squeezes out binary-float drift (100 / 0.7 lands on
 * 142.85714285714286) before the final round, so values sitting exactly on a half-centavo don't
 * fall to the wrong side.
 */
function round2(value: number): number {
  return Math.round(Number((value * 100).toPrecision(12))) / 100;
}
