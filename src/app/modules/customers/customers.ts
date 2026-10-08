import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';

import { httpErrorMessage } from '../../../common/http/http-error-message';
import { CreditSalesService } from '../../../common/credit/credit-sales.service';
import { MoneyPipe } from '../products/utils/money.pipe';
import { priceToCents } from '../pos/types/pos.types';
import { CustomersService } from './services/customers.service';
import { CustomerListItem } from './types/customer.types';
import { CustomerDetail } from './detail/customer-detail';

/**
 * Customers who buy on account. Server search and a balance filter on the left,
 * contact, purchases, and payments on the right.
 */
@Component({
  selector: 'app-customers',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    TableModule,
    MoneyPipe,
    CustomerDetail,
  ],
  templateUrl: './customers.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Customers {
  private readonly formBuilder = inject(FormBuilder);
  private readonly service = inject(CustomersService);
  private readonly creditSales = inject(CreditSalesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly creditEnabled = this.creditSales.enabled;

  protected showBalance(balance: string): boolean {
    return this.creditEnabled() || priceToCents(balance) > 0;
  }

  private readonly addInput = viewChild<ElementRef<HTMLInputElement>>('addInput');

  protected readonly customers = signal<CustomerListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly searchControl = this.formBuilder.nonNullable.control('');
  protected readonly balanceControl = this.formBuilder.nonNullable.control(false);

  protected readonly addForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  protected readonly creating = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(
    () => this.customers().find((customer) => customer.id === this.selectedId()) ?? null,
  );
  protected readonly detailOpenMobile = signal(false);

  protected readonly hasFilters = signal(false);
  protected readonly isEmpty = computed(
    () => !this.loading() && !this.loadError() && this.customers().length === 0 && !this.hasFilters(),
  );

  private request = 0;
  /** Select this id after the next list returns, if the filter still includes it. */
  private pendingSelectId: string | null = null;

  constructor() {
    afterNextRender(() => this.addInput()?.nativeElement.focus());

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

    this.balanceControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

    this.load();
  }

  protected applyFilters(): void {
    this.selectedId.set(null);
    this.load();
  }

  protected load(): void {
    const request = ++this.request;
    this.loading.set(true);
    this.loadError.set(null);
    this.hasFilters.set(this.computeHasFilters());

    this.service
      .list(this.searchControl.value, this.creditEnabled() && this.balanceControl.value)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (request === this.request) {
            this.loading.set(false);
          }
        }),
      )
      .subscribe({
        next: (items) => {
          if (request !== this.request) {
            return;
          }
          this.customers.set(items);
          const pending = this.pendingSelectId;
          this.pendingSelectId = null;
          if (pending && items.some((customer) => customer.id === pending)) {
            this.selectedId.set(pending);
            this.detailOpenMobile.set(true);
            return;
          }
          this.syncSelection(items);
        },
        error: (error: unknown) => {
          if (request !== this.request) {
            return;
          }
          this.loadError.set(httpErrorMessage(error));
        },
      });
  }

  protected addCustomer(): void {
    const name = this.addForm.controls.name.value.trim();
    this.addError.set(null);
    if (!name) {
      this.addForm.controls.name.markAsTouched();
      return;
    }
    if (this.creating()) {
      return;
    }

    this.creating.set(true);
    this.service
      .create({ name })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: (created) => {
          this.addForm.reset({ name: '' });
          this.pendingSelectId = created.id;
          this.searchControl.setValue('', { emitEvent: false });
          this.balanceControl.setValue(false, { emitEvent: false });
          this.load();
          this.addInput()?.nativeElement.focus();
        },
        error: (error: unknown) => this.addError.set(httpErrorMessage(error, `"${name}"`)),
      });
  }

  protected selectCustomer(customer: CustomerListItem): void {
    this.selectedId.set(customer.id);
    this.detailOpenMobile.set(true);
  }

  protected onSelectionChange(customer: CustomerListItem | null): void {
    if (customer) {
      this.selectCustomer(customer);
    }
  }

  protected backToList(): void {
    this.detailOpenMobile.set(false);
  }

  protected onCustomerUpdated(updated: CustomerListItem): void {
    this.customers.update((list) =>
      list.map((customer) =>
        customer.id === updated.id
          ? {
              id: updated.id,
              name: updated.name,
              phone: updated.phone,
              note: updated.note,
              balance: updated.balance,
            }
          : customer,
      ),
    );
  }

  protected clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.balanceControl.setValue(false, { emitEvent: false });
    this.applyFilters();
  }

  private syncSelection(items: CustomerListItem[]): void {
    const current = this.selectedId();
    if (current && items.some((customer) => customer.id === current)) {
      return;
    }
    this.selectedId.set(items[0]?.id ?? null);
  }

  private computeHasFilters(): boolean {
    return !!this.searchControl.value.trim() || (this.creditEnabled() && this.balanceControl.value);
  }
}
