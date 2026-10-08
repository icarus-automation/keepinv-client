import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { httpErrorMessage } from '../../../../common/http/http-error-message';
import { CreditSalesService } from '../../../../common/credit/credit-sales.service';
import { MoneyPipe } from '../../products/utils/money.pipe';
import {
  PAYMENT_METHODS,
  PaymentMethod,
  PaymentMethodMeta,
  paymentMethodMeta,
  priceToCents,
} from '../../pos/types/pos.types';
import { SaleStatusBadge } from '../../pos/components/sale-status-badge';
import { CustomersService } from '../services/customers.service';
import { CustomerDetail as CustomerRecord, CustomerListItem } from '../types/customer.types';

/**
 * One customer's contact, balance, purchases, and payments. The list row paints
 * the header immediately; purchases and payments load with the full record.
 */
@Component({
  selector: 'app-customer-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    MoneyPipe,
    SaleStatusBadge,
  ],
  templateUrl: './customer-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'cancelEdit()' },
})
export class CustomerDetail {
  private readonly formBuilder = inject(FormBuilder);
  private readonly service = inject(CustomersService);
  private readonly creditSales = inject(CreditSalesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly customer = input.required<CustomerListItem>();
  readonly updated = output<CustomerListItem>();

  private readonly editNameInput = viewChild<ElementRef<HTMLInputElement>>('editNameInput');

  protected readonly methods: readonly PaymentMethodMeta[] = PAYMENT_METHODS;
  protected readonly detail = signal<CustomerRecord | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    phone: ['', [Validators.maxLength(32)]],
    note: ['', [Validators.maxLength(255)]],
  });

  protected readonly paymentMethod = signal<PaymentMethod>('CASH');
  protected readonly paymentAmount = new FormControl<number | null>(null);
  protected readonly paymentNote = new FormControl('', { nonNullable: true });
  protected readonly recording = signal(false);
  protected readonly paymentError = signal<string | null>(null);

  protected readonly contact = computed(() => this.detail() ?? this.customer());
  protected readonly balance = computed(() => this.contact().balance);
  protected readonly owes = computed(() => priceToCents(this.balance()) > 0);
  protected readonly creditEnabled = this.creditSales.enabled;
  /** Balance and Record payment stay up for an existing debt after credit is turned off. */
  protected readonly showAccount = computed(() => this.creditEnabled() || this.owes());
  protected readonly sales = computed(() => this.detail()?.sales ?? []);
  protected readonly payments = computed(() => this.detail()?.payments ?? []);

  private loadedId: string | null = null;
  private loadRequest = 0;

  constructor() {
    effect(() => {
      const id = this.customer().id;
      if (id === this.loadedId) {
        return;
      }
      this.loadedId = id;
      this.resetTransient();
      this.load(id);
    });

    effect(() => {
      if (this.editing()) {
        this.editNameInput()?.nativeElement.focus();
      }
    });
  }

  protected load(id = this.customer().id): void {
    const request = ++this.loadRequest;
    this.loading.set(true);
    this.loadError.set(null);
    this.service
      .get(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (request === this.loadRequest) {
            this.loading.set(false);
          }
        }),
      )
      .subscribe({
        next: (detail) => {
          if (request !== this.loadRequest) {
            return;
          }
          this.detail.set(detail);
          this.updated.emit(detail);
        },
        error: (error: unknown) => {
          if (request !== this.loadRequest) {
            return;
          }
          this.loadError.set(httpErrorMessage(error));
        },
      });
  }

  protected startEdit(): void {
    const customer = this.detail() ?? this.customer();
    this.editError.set(null);
    this.editForm.setValue({
      name: customer.name,
      phone: customer.phone ?? '',
      note: customer.note ?? '',
    });
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.editError.set(null);
  }

  protected saveEdit(): void {
    if (this.saving()) {
      return;
    }
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const raw = this.editForm.getRawValue();
    const name = raw.name.trim();
    if (!name) {
      this.editForm.controls.name.markAsTouched();
      return;
    }

    this.saving.set(true);
    this.editError.set(null);
    this.service
      .update(this.customer().id, {
        name,
        phone: raw.phone.trim(),
        note: raw.note.trim(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (detail) => {
          this.loadedId = detail.id;
          this.detail.set(detail);
          this.editing.set(false);
          this.updated.emit(detail);
        },
        error: (error: unknown) => this.editError.set(httpErrorMessage(error)),
      });
  }

  protected setPaymentMethod(method: PaymentMethod): void {
    this.paymentMethod.set(method);
  }

  protected recordPayment(event?: Event): void {
    event?.preventDefault();
    if (this.recording() || !this.owes()) {
      return;
    }
    const amount = this.paymentAmount.value;
    if (amount == null || amount <= 0) {
      this.paymentError.set('Enter the amount received.');
      return;
    }

    this.recording.set(true);
    this.paymentError.set(null);
    const note = this.paymentNote.value.trim();
    this.service
      .recordPayment(this.customer().id, {
        amount,
        paymentMethod: this.paymentMethod(),
        note: note || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.recording.set(false)),
      )
      .subscribe({
        next: () => {
          this.paymentAmount.setValue(null);
          this.paymentNote.setValue('');
          this.load();
        },
        error: (error: unknown) => this.paymentError.set(httpErrorMessage(error)),
      });
  }

  protected hasCredit(amount: string): boolean {
    return priceToCents(amount) > 0;
  }

  protected methodLabel(method: PaymentMethod): string {
    return paymentMethodMeta(method).label;
  }

  private resetTransient(): void {
    this.editing.set(false);
    this.editError.set(null);
    this.paymentError.set(null);
    this.paymentMethod.set('CASH');
    this.paymentAmount.setValue(null);
    this.paymentNote.setValue('');
    this.detail.set(null);
  }
}
