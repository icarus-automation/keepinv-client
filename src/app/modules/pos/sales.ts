import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, filter, finalize, map, merge } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { AutoCompleteCompleteEvent, AutoCompleteModule, AutoCompleteSelectEvent } from 'primeng/autocomplete';

import { endOfDayIso, startOfDayIso } from '../../../common/dates';
import { httpErrorMessage } from '../../../common/http/http-error-message';
import { MoneyPipe } from '../products/utils/money.pipe';
import { CustomersService } from '../customers/services/customers.service';
import { CustomerListItem } from '../customers/types/customer.types';
import { PosService } from './services/pos.service';
import {
  PAYMENT_METHODS,
  PaymentMethod,
  SaleListItem,
  SaleStatus,
  SaleWithRelations,
  SalesListQuery,
  paymentMethodMeta,
} from './types/pos.types';
import { SaleStatusBadge } from './components/sale-status-badge';
import { SaleDetail } from './detail/sale-detail';

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

/**
 * The sales ledger. Two-pane, mirroring Products: a server-paginated, scanner-
 * searchable table on the left, the selected sale's receipt and void action on the
 * right. Filters map one-to-one to the backend query: free-text across receipt
 * number and item identity, status, payment method, and a completed-date range.
 */
@Component({
  selector: 'app-sales',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MoneyPipe,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    TableModule,
    AutoCompleteModule,
    SaleStatusBadge,
    SaleDetail,
  ],
  templateUrl: './sales.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sales {
  private readonly service = inject(PosService);
  private readonly customersService = inject(CustomersService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sales = signal<SaleListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** Server page size. The backend caps `limit` at 50; 10 keeps each fetch snappy. */
  protected readonly rows = 10;
  protected readonly first = signal(0);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly statusControl = new FormControl<SaleStatus | null>(null);
  protected readonly methodControl = new FormControl<PaymentMethod | null>(null);
  /** Range picker value: [from, to]. */
  protected readonly dateRange = new FormControl<Date[] | null>(null);
  protected readonly customerId = signal<string | null>(null);
  protected readonly customerPick = signal<{ id: string; name: string } | null>(null);
  protected readonly customerSearch = new FormControl('', { nonNullable: true });
  protected readonly customerHits = signal<CustomerListItem[]>([]);

  protected readonly statusOptions: SelectOption<SaleStatus>[] = [
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Voided', value: 'VOIDED' },
  ];
  protected readonly methodOptions: SelectOption<PaymentMethod>[] = PAYMENT_METHODS.map(
    (method) => ({ label: method.label, value: method.value }),
  );

  protected readonly selected = signal<SaleListItem | null>(null);
  /** On narrow screens the detail replaces the list; this toggles between them. */
  protected readonly paneOpenMobile = signal(false);

  protected readonly hasFilters = signal(false);
  /** No sales at all (not merely filtered to nothing). Drives the first-run empty state. */
  protected readonly isEmptyLedger = computed(
    () => !this.loading() && !this.loadError() && this.total() === 0 && !this.hasFilters(),
  );

  /** Sale to open once the filtered page returns. Set from `?saleId=`. */
  private queuedSaleId: string | null = null;
  /** Bumped on every load so a late getSale cannot reopen a sale the operator left. */
  private saleRequest = 0;

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

    merge(this.statusControl.valueChanges, this.methodControl.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

    // A range picker emits [from, null] on the first click; wait for both ends (or a
    // full clear) before querying, so picking a start date doesn't fire a premature load.
    this.dateRange.valueChanges
      .pipe(
        filter((range) => range == null || (range[0] != null && range[1] != null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.applyFilters());

    this.route.queryParamMap
      .pipe(
        map((params) => ({
          customerId: params.get('customerId'),
          saleId: params.get('saleId'),
        })),
        distinctUntilChanged((a, b) => a.customerId === b.customerId && a.saleId === b.saleId),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ customerId, saleId }) => {
        this.customerId.set(customerId);
        this.queuedSaleId = saleId;
        this.syncCustomerLabel(customerId);
        this.first.set(0);
        this.selected.set(null);
        this.load();
      });
  }

  /** See products.ts: the table re-emits onLazyLoad on binding changes; only act on a real page change. */
  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const requestedFirst = event.first ?? 0;
    if (requestedFirst === this.first()) {
      return;
    }
    this.first.set(requestedFirst);
    this.load();
  }

  protected applyFilters(): void {
    this.first.set(0);
    // A new filter may exclude the selected sale; drop it so the detail pane doesn't
    // show a sale that's no longer in the visible ledger.
    this.selected.set(null);
    this.load();
  }

  protected load(): void {
    const request = ++this.saleRequest;
    this.loading.set(true);
    this.loadError.set(null);
    this.hasFilters.set(this.computeHasFilters());

    const range = this.dateRange.value;
    const query: SalesListQuery = {
      page: Math.floor(this.first() / this.rows) + 1,
      limit: this.rows,
      search: this.searchControl.value.trim() || undefined,
      status: this.statusControl.value ?? undefined,
      paymentMethod: this.methodControl.value ?? undefined,
      dateFrom: startOfDayIso(range?.[0]),
      dateTo: endOfDayIso(range?.[1] ?? range?.[0]),
      customerId: this.customerId() ?? undefined,
    };

    this.service
      .listSales(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (request === this.saleRequest) {
            this.loading.set(false);
          }
        }),
      )
      .subscribe({
        next: ({ items, meta }) => {
          if (request !== this.saleRequest) {
            return;
          }
          this.sales.set(items);
          this.total.set(meta.total);
          // Voiding the last row on a page can leave us past the final page; step back.
          if (!items.length && meta.total > 0 && this.first() > 0) {
            this.first.set(Math.max(0, Math.ceil(meta.total / this.rows) - 1) * this.rows);
            this.load();
            return;
          }
          this.syncSelection(items);
        },
        error: (error: unknown) => {
          if (request !== this.saleRequest) {
            return;
          }
          this.loadError.set(httpErrorMessage(error));
        },
      });
  }

  /** Keep the current selection pointed at a fresh row, or open the sale named in the URL. */
  private syncSelection(items: SaleListItem[]): void {
    const saleId = this.queuedSaleId;
    if (saleId) {
      this.queuedSaleId = null;
      const match = items.find((item) => item.id === saleId);
      if (match) {
        this.selectSale(match);
        return;
      }
      this.openQueuedSale(saleId, items);
      return;
    }

    const current = this.selected();
    if (current) {
      const match = items.find((item) => item.id === current.id);
      this.selected.set(match ?? null);
      return;
    }
    if (items.length) {
      this.selected.set(items[0]);
    }
  }

  private openQueuedSale(id: string, items: SaleListItem[]): void {
    const request = this.saleRequest;
    this.service
      .getSale(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sale }) => {
          if (request !== this.saleRequest) {
            return;
          }
          this.selectSale(this.toListItem(sale));
        },
        error: () => {
          if (request !== this.saleRequest) {
            return;
          }
          if (items.length) {
            this.selected.set(items[0]);
          }
        },
      });
  }

  private toListItem(sale: SaleWithRelations): SaleListItem {
    return {
      id: sale.id,
      receiptNo: sale.receiptNo,
      status: sale.status,
      subtotal: sale.subtotal,
      total: sale.total,
      amountTendered: sale.amountTendered,
      changeDue: sale.changeDue,
      creditAmount: sale.creditAmount,
      paymentMethod: sale.paymentMethod,
      note: sale.note,
      completedAt: sale.completedAt,
      voidedAt: sale.voidedAt,
      voidReason: sale.voidReason,
      cashier: sale.cashier,
      voidedBy: sale.voidedBy,
      customer: sale.customer,
      _count: { items: sale.items.length },
    };
  }

  protected clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.statusControl.setValue(null, { emitEvent: false });
    this.methodControl.setValue(null, { emitEvent: false });
    this.dateRange.setValue(null, { emitEvent: false });
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerHits.set([]);
    const params = this.route.snapshot.queryParamMap;
    if (params.has('customerId') || params.has('saleId')) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      return;
    }
    this.customerId.set(null);
    this.customerPick.set(null);
    this.applyFilters();
  }

  protected searchCustomers(event: AutoCompleteCompleteEvent): void {
    const term = event.query.trim();
    if (!term) {
      this.customerHits.set([]);
      return;
    }
    this.customersService
      .list(term)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.customerHits.set(items),
        error: () => this.customerHits.set([]),
      });
  }

  protected chooseCustomer(event: AutoCompleteSelectEvent): void {
    const customer = event.value as CustomerListItem | null;
    if (!customer || typeof customer !== 'object' || !('id' in customer)) {
      return;
    }
    this.customerPick.set({ id: customer.id, name: customer.name });
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerHits.set([]);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { customerId: customer.id, saleId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearCustomer(): void {
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerHits.set([]);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { customerId: null, saleId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected selectSale(sale: SaleListItem): void {
    this.selected.set(sale);
    this.paneOpenMobile.set(true);
  }

  protected onSelectionChange(sale: SaleListItem | null): void {
    if (sale) {
      this.selectSale(sale);
    }
  }

  /** A void changed a sale; refetch the page so the row's status stays truthful. */
  protected onChanged(): void {
    this.load();
  }

  protected backToList(): void {
    this.paneOpenMobile.set(false);
  }

  protected methodLabel(method: PaymentMethod): string {
    return paymentMethodMeta(method).label;
  }

  protected goToPos(): void {
    void this.router.navigate(['/pos']);
  }

  private computeHasFilters(): boolean {
    return (
      !!this.searchControl.value.trim() ||
      this.statusControl.value !== null ||
      this.methodControl.value !== null ||
      (this.dateRange.value?.some(Boolean) ?? false) ||
      this.customerId() !== null
    );
  }

  private syncCustomerLabel(customerId: string | null): void {
    if (!customerId) {
      this.customerPick.set(null);
      return;
    }
    if (this.customerPick()?.id === customerId) {
      return;
    }
    this.customersService
      .get(customerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (customer) => {
          if (this.customerId() === customerId) {
            this.customerPick.set({ id: customer.id, name: customer.name });
          }
        },
        error: () => {
          if (this.customerId() === customerId) {
            this.customerPick.set({ id: customerId, name: 'Customer' });
          }
        },
      });
  }
}
