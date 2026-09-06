import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../responses/api.response';
import { NO_PRICING_DEFAULTS, PricingDefaults, sellingPriceFrom } from './pricing-defaults';

/**
 * The organization's default pricing rule. Source of truth is the backend; this hydrates once at
 * app start (and on login) so the product form can seed a selling price the moment a cost is
 * typed, with no round trip and no calculator.
 *
 * Reads are open to every member, because staff create products. Writes are owner/admin only and
 * server enforces that, so a 403 here is expected for staff rather than a bug.
 */
@Injectable({ providedIn: 'root' })
export class PricingDefaultsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/organizations/pricing-defaults`;

  private readonly state = signal<PricingDefaults>(NO_PRICING_DEFAULTS);
  readonly defaults = this.state.asReadonly();

  readonly basis = computed(() => this.state().pricingBasis);
  readonly percent = computed(() => this.state().defaultPricingPercent);
  /** True once a percentage is set, which is what turns auto-fill on across the app. */
  readonly hasDefault = computed(() => this.state().defaultPricingPercent !== null);

  /** Hydrates the rule for the active org. Never throws; resolves to "no default" on failure. */
  load(): Observable<PricingDefaults> {
    return this.http.get<ApiResponse<PricingDefaults>>(this.url).pipe(
      map((response) => response.data),
      catchError(() => of(NO_PRICING_DEFAULTS)),
      tap((defaults) => this.state.set(defaults)),
    );
  }

  /**
   * Saves the rule. Unlike {@link load} this surfaces its error: the settings form has to tell an
   * owner the save failed rather than silently reverting to the old number.
   */
  update(defaults: PricingDefaults): Observable<PricingDefaults> {
    return this.http.patch<ApiResponse<PricingDefaults>>(this.url, defaults).pipe(
      map((response) => response.data),
      tap((saved) => this.state.set(saved)),
    );
  }

  /** The selling price this org's rule implies for a cost, or null when no default is set. */
  sellingPriceFor(costPrice: number | null | undefined): number | null {
    return sellingPriceFrom(costPrice, this.state());
  }
}
