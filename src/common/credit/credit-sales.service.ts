import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../responses/api.response';

/** Whether this shop can put a new sale on credit. Off until an owner or admin turns it on. */
export interface CreditSalesSetting {
  enabled: boolean;
}

/**
 * The organization's credit-sales switch. Hydrated with the session so the counter and the
 * customer list can hide credit before first paint. Reads are open to every member. Writes are
 * owner/admin only, and the server enforces that.
 */
@Injectable({ providedIn: 'root' })
export class CreditSalesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/organizations/credit-sales`;

  private readonly state = signal(false);
  readonly enabled = this.state.asReadonly();

  /** Never throws. A failed read stays off, which is the column default. */
  load(): Observable<CreditSalesSetting> {
    return this.http.get<ApiResponse<CreditSalesSetting>>(this.url).pipe(
      map((response) => response.data),
      catchError(() => of({ enabled: false })),
      tap((setting) => this.state.set(setting.enabled)),
    );
  }

  /** Surfaces its error so Settings can say the save failed. */
  update(enabled: boolean): Observable<CreditSalesSetting> {
    return this.http.patch<ApiResponse<CreditSalesSetting>>(this.url, { enabled }).pipe(
      map((response) => response.data),
      tap((setting) => this.state.set(setting.enabled)),
    );
  }
}
