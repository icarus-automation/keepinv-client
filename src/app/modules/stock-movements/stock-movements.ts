import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, catchError, filter, map, merge, of, switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { DatePickerModule } from 'primeng/datepicker';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { endOfDayIso, startOfDayIso } from '../../../common/dates';
import { httpErrorMessage } from '../../../common/http/http-error-message';
import { ProductsService } from '../products/services/products.service';
import { Product } from '../products/types/product.types';
import { StockMovementsService } from './services/stock-movements.service';
import {
  MovementDisplay,
  StockMovement,
  StockMovementListQuery,
  movementDisplay,
} from './types/stock-movement.types';
import { StockMovementType } from '../stock-movement-types/types/stock-movement-type.types';
import { StockMovementTypesService } from '../stock-movement-types/services/stock-movement-types.service';
import { StockMovementRecord } from './record/stock-movement-record';
import { StockMovementDetail } from './detail/stock-movement-detail';

@Component({
  selector: 'app-stock-movements',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    ButtonModule,
    SelectModule,
    AutoCompleteModule,
    DatePickerModule,
    TableModule,
    StockMovementRecord,
    StockMovementDetail,
  ],
  templateUrl: './stock-movements.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockMovements {
  private readonly service = inject(StockMovementsService);
  private readonly products = inject(ProductsService);
  private readonly movementTypes = inject(StockMovementTypesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly movements = signal<StockMovement[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly rows = 10;
  protected readonly first = signal(0);

  protected readonly typeOptions = signal<StockMovementType[]>([]);
  protected readonly productFilter = new FormControl<Product | null>(null);
  /** Filters the ledger to one movement type, by id. */
  protected readonly typeFilter = new FormControl<string | null>(null);
  /** Range picker value: [from, to]. */
  protected readonly dateRange = new FormControl<Date[] | null>(null);
  protected readonly productSuggestions = signal<Product[]>([]);
  private readonly productQuery = new Subject<string>();

  protected readonly selected = signal<StockMovement | null>(null);
  protected readonly mode = signal<'record' | 'view'>('record');
  protected readonly paneOpenMobile = signal(false);

  protected readonly hasFilters = signal(false);

  constructor() {
    merge(this.productFilter.valueChanges, this.typeFilter.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());

    // A range picker emits [from, null] on the first click; wait for both ends
    // (or a full clear) before querying, so picking a start date doesn't fire a
    // premature single-day load that's immediately replaced once the end is set.
    this.dateRange.valueChanges
      .pipe(
        filter((range) => range == null || (range[0] != null && range[1] != null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.applyFilters());

    // Resolve product search through switchMap so a newer query cancels the
    // in-flight one; out-of-order responses can't clobber fresher suggestions.
    this.productQuery
      .pipe(
        switchMap((query) =>
          this.products.list({ page: 1, limit: 10, search: query }).pipe(
            map(({ items }) => items),
            catchError(() => of<Product[]>([])),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.productSuggestions.set(items));

    // Populate the type filter from the tenant's configured types.
    this.movementTypes
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => this.typeOptions.set(items));

    this.load();
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
    // A new filter may exclude the selected movement; drop it so the detail pane
    // doesn't show a record that's no longer in the visible ledger.
    this.selected.set(null);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.hasFilters.set(this.computeHasFilters());

    const range = this.dateRange.value;
    const query: StockMovementListQuery = {
      page: Math.floor(this.first() / this.rows) + 1,
      limit: this.rows,
      productId: this.productFilter.value?.id ?? undefined,
      stockMovementTypeId: this.typeFilter.value ?? undefined,
      dateFrom: startOfDayIso(range?.[0]),
      dateTo: endOfDayIso(range?.[1] ?? range?.[0]),
    };

    this.service
      .list(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items, meta }) => {
          this.movements.set(items);
          this.total.set(meta.total);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loadError.set(httpErrorMessage(error));
          this.loading.set(false);
        },
      });
  }

  protected searchProducts(event: AutoCompleteCompleteEvent): void {
    this.productQuery.next(event.query);
  }

  protected clearFilters(): void {
    this.productFilter.setValue(null, { emitEvent: false });
    this.typeFilter.setValue(null, { emitEvent: false });
    this.dateRange.setValue(null, { emitEvent: false });
    this.applyFilters();
  }

  protected startRecord(): void {
    this.mode.set('record');
    this.selected.set(null);
    this.paneOpenMobile.set(true);
  }

  protected selectMovement(movement: StockMovement): void {
    this.mode.set('view');
    this.selected.set(movement);
    this.paneOpenMobile.set(true);
  }

  protected onSelectionChange(movement: StockMovement | null): void {
    if (movement) {
      this.selectMovement(movement);
    }
  }

  protected onRecorded(): void {
    // Newest entries sort to the top; jump to the first page so it shows.
    this.first.set(0);
    this.load();
  }

  protected backToList(): void {
    this.paneOpenMobile.set(false);
  }

  protected display(movement: StockMovement): MovementDisplay {
    return movementDisplay(movement);
  }

  protected changeLabel(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }

  private computeHasFilters(): boolean {
    return (
      this.productFilter.value !== null ||
      this.typeFilter.value !== null ||
      (this.dateRange.value?.some(Boolean) ?? false)
    );
  }
}
