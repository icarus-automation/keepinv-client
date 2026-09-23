import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';

import { httpErrorMessage } from '../../../common/http/http-error-message';
import { PricingDefaultsService } from '../../../common/pricing/pricing-defaults.service';
import {
  PRICING_BASIS_OPTIONS,
  PricingBasis,
  PricingDefaults,
  formatPercent,
  maxPercentFor,
  pricingRuleLabel,
  sellingPriceFrom,
} from '../../../common/pricing/pricing-defaults';
import { OrganizationService } from '../organization/services/organization.service';
import { formatPeso } from '../products/utils/money.pipe';

/** The cost the worked example prices, chosen so the arithmetic reads at a glance. */
const EXAMPLE_COST = 100;

/**
 * The organization's default pricing rule, for owners and admins on the Settings page. Saving it
 * is what lets the product form fill in a selling price from a cost, so nobody has to work one out
 * on a calculator mid-form. Staff see the rule read-only: it still governs the prices suggested to
 * them, so hiding it outright would be worse than showing it.
 */
@Component({
  selector: 'app-pricing-defaults-form',
  imports: [ReactiveFormsModule, ButtonModule, InputNumberModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canManage()) {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <fieldset>
          <legend class="text-sm font-medium text-ink">How you price</legend>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            @for (option of basisOptions; track option.id) {
              <label
                class="flex cursor-pointer flex-col gap-1 rounded-md border border-line bg-panel px-3 py-3 outline-none transition-colors hover:border-field has-[:checked]:border-signal has-[:checked]:bg-signal/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-counter"
              >
                <span class="flex items-center gap-2">
                  <input
                    type="radio"
                    class="sr-only"
                    formControlName="pricingBasis"
                    [value]="option.id"
                  />
                  <span
                    class="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-field"
                    aria-hidden="true"
                  >
                    @if (basis() === option.id) {
                      <span class="h-2 w-2 rounded-full bg-signal"></span>
                    }
                  </span>
                  <span class="text-sm font-medium text-ink">{{ option.label }}</span>
                </span>
                <span class="pl-6 text-xs text-muted">{{ option.hint }}</span>
              </label>
            }
          </div>
        </fieldset>

        <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div class="sm:w-44">
            <label for="pricing-percent" class="block text-sm font-medium text-ink">
              Percentage
            </label>
            <p-inputnumber
              inputId="pricing-percent"
              formControlName="defaultPricingPercent"
              suffix="%"
              placeholder="Off"
              [min]="0"
              [max]="maxPercent()"
              [minFractionDigits]="0"
              [maxFractionDigits]="2"
              [showClear]="true"
              [invalid]="percentError() !== null"
              [ariaDescribedBy]="percentError() ? 'pricing-percent-error' : 'pricing-percent-help'"
              styleClass="mt-2 w-full"
              inputStyleClass="w-full text-sm tabular-nums"
            />
          </div>
          <p-button
            type="submit"
            [label]="saving() ? 'Saving…' : 'Save'"
            [loading]="saving()"
            [disabled]="saving() || form.pristine || percentError() !== null"
            styleClass="font-semibold"
          />
        </div>

        @if (percentError(); as message) {
          <p id="pricing-percent-error" role="alert" class="mt-1.5 text-xs text-danger">
            {{ message }}
          </p>
        } @else {
          <p id="pricing-percent-help" class="mt-1.5 text-xs text-muted">{{ preview() }}</p>
        }

        <p class="mt-2 min-h-4 text-xs" role="status" aria-live="polite">
          @if (saveError(); as message) {
            <span class="text-danger">{{ message }}</span>
          } @else if (saved()) {
            <span class="inline-flex items-center gap-1 text-success">
              <i class="pi pi-check text-[0.7rem]" aria-hidden="true"></i> Saved
            </span>
          }
        </p>
      </form>
    } @else {
      <p class="text-sm text-ink">{{ savedRuleSummary() }}</p>
      <p class="mt-1 max-w-prose text-sm text-muted">
        Only owners and admins can change the pricing default.
      </p>
    }
  `,
})
export class PricingDefaultsForm {
  private readonly formBuilder = inject(FormBuilder);
  private readonly pricingDefaults = inject(PricingDefaultsService);
  private readonly destroyRef = inject(DestroyRef);

  /** Owners and admins may save; the server enforces the same split and 403s anyone else. */
  protected readonly canManage = inject(OrganizationService).canManage;

  protected readonly basisOptions = PRICING_BASIS_OPTIONS;

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly form = this.formBuilder.group({
    pricingBasis: this.formBuilder.nonNullable.control<PricingBasis>('MARKUP_ON_COST'),
    defaultPricingPercent: this.formBuilder.control<number | null>(null),
  });

  /**
   * Live form value, so the preview and the range check recompute as the operator types. Kept by
   * hand rather than from `valueChanges`, because seeding the form has to stay silent: an emitted
   * seed would clear the "Saved" badge the moment a save landed.
   */
  private readonly value = signal<PricingDefaults>(this.form.getRawValue());

  protected readonly basis = computed(() => this.value().pricingBasis);
  protected readonly maxPercent = computed(() => maxPercentFor(this.basis()));

  /**
   * Non-null when the percentage is out of range for the basis beside it, which is reachable by
   * switching a 300% markup over to a margin. This is the only validity rule on the form, so the
   * message, the invalid ring, and the disabled Save all read from it.
   */
  protected readonly percentError = computed(() => {
    const percent = this.value().defaultPricingPercent;
    if (percent === null) {
      return null;
    }
    if (!Number.isFinite(percent) || percent < 0) {
      return 'Enter a percentage of 0 or more.';
    }
    const max = this.maxPercent();
    if (percent <= max) {
      return null;
    }
    return this.basis() === 'MARGIN_ON_PRICE'
      ? `Margin must stay under 100%. Use ${formatPercent(max)}% or less.`
      : `Enter a percentage between 0 and ${formatPercent(max)}.`;
  });

  /** Worked example on a round cost, so the gap between the two bases is unmistakable. */
  protected readonly preview = computed(() => {
    const percent = this.value().defaultPricingPercent;
    if (percent === null) {
      return 'Off. Enter a percentage to price new products from cost.';
    }
    const sellingPrice = sellingPriceFrom(EXAMPLE_COST, {
      pricingBasis: this.basis(),
      defaultPricingPercent: percent,
    });
    return sellingPrice === null
      ? 'Enter a percentage this basis accepts to see what it prices at.'
      : `A ${formatPeso(EXAMPLE_COST)} cost is priced at ${formatPeso(sellingPrice)}.`;
  });

  /** The rule as saved, for the read-only view staff get. */
  protected readonly savedRuleSummary = computed(() => {
    const rule = pricingRuleLabel(this.pricingDefaults.defaults());
    return rule === null
      ? 'No default. New products start with a blank selling price.'
      : `New products are priced at ${rule}.`;
  });

  constructor() {
    // Seed from the hydrated rule, but never clobber an edit in progress (pristine guard).
    effect(() => {
      const { pricingBasis, defaultPricingPercent } = this.pricingDefaults.defaults();
      if (this.form.pristine) {
        this.form.setValue({ pricingBasis, defaultPricingPercent }, { emitEvent: false });
        this.value.set({ pricingBasis, defaultPricingPercent });
      }
    });

    // Only the operator's own edits reach here, so this is also where a stale save outcome clears.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.value.set(this.form.getRawValue());
      if (this.saved()) {
        this.saved.set(false);
      }
      if (this.saveError()) {
        this.saveError.set(null);
      }
    });
  }

  protected save(): void {
    if (this.saving() || !this.canManage() || this.percentError() !== null) {
      return;
    }

    const { pricingBasis, defaultPricingPercent } = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    this.saved.set(false);

    this.pricingDefaults
      .update({ pricingBasis, defaultPricingPercent: defaultPricingPercent ?? null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
          this.form.markAsPristine();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.saveError.set(httpErrorMessage(error));
        },
      });
  }
}
