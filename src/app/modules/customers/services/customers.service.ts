import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../../common/responses/api.response';
import {
  CustomerDetail,
  CustomerIdentity,
  CustomerListItem,
  CustomerPayment,
  CustomerPaymentRequest,
  CustomerRequest,
} from '../types/customer.types';

/** Talks to the customers API. The auth interceptor attaches the token; this unwraps `data`. */
@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/customers`;

  list(search?: string, hasBalance = false): Observable<CustomerListItem[]> {
    let params = new HttpParams();
    const term = search?.trim();
    if (term) {
      params = params.set('search', term);
    }
    if (hasBalance) {
      params = params.set('hasBalance', 'true');
    }
    return this.http
      .get<ApiResponse<CustomerListItem[]>>(this.baseUrl, { params })
      .pipe(map((response) => response.data));
  }

  get(id: string): Observable<CustomerDetail> {
    return this.http
      .get<ApiResponse<CustomerDetail>>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data));
  }

  create(body: CustomerRequest): Observable<CustomerIdentity> {
    return this.http
      .post<ApiResponse<CustomerIdentity>>(this.baseUrl, body)
      .pipe(map((response) => response.data));
  }

  update(id: string, body: CustomerRequest): Observable<CustomerDetail> {
    return this.http
      .patch<ApiResponse<CustomerDetail>>(`${this.baseUrl}/${id}`, body)
      .pipe(map((response) => response.data));
  }

  recordPayment(id: string, body: CustomerPaymentRequest): Observable<CustomerPayment> {
    return this.http
      .post<ApiResponse<CustomerPayment>>(`${this.baseUrl}/${id}/payments`, body)
      .pipe(map((response) => response.data));
  }
}
