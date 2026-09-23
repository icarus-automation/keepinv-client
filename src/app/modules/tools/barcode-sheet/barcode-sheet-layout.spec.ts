import { Product } from '../../products/types/product.types';
import { buildSheetDefinition, SheetBarcode } from './barcode-sheet-layout';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function product(overrides: Partial<Product>): Product {
  return {
    id: 'p1',
    name: 'Widget',
    description: null,
    sku: 'SKU-001',
    barcode: '4801234567890',
    brand: 'Acme',
    imageUrl: null,
    costPrice: '100',
    sellingPrice: '549.90',
    quantityOnHand: 1,
    reorderPoint: null,
    reorderUrl: null,
    reorderPlatform: null,
    isSerialized: false,
    isArchived: false,
    categoryId: 'c1',
    category: { id: 'c1', name: 'Cat' } as Product['category'],
    supplierId: null,
    supplier: null,
    locationId: null,
    location: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function textsOf(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      textsOf(item, out);
    }
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record['text'] === 'string') {
    out.push(record['text']);
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      textsOf(value, out);
    }
  }
}

function sheetTexts(definition: Record<string, unknown>, page = 1, pages = 1): string[] {
  const out: string[] = [];
  const header = definition['header'];
  const footer = definition['footer'];
  if (typeof header === 'function') {
    textsOf(header(), out);
  }
  if (typeof footer === 'function') {
    textsOf(footer(page, pages), out);
  }
  textsOf(definition['content'], out);
  return out;
}

const barcode: SheetBarcode = { dataUrl: PNG, pixelWidth: 200, pixelHeight: 60 };

describe('barcode sheet document', () => {
  it('prints the title, number, name, brand, and peso as P', () => {
    const images = new Map([['p1', PNG]]);
    const barcodes = new Map([['4801234567890', barcode]]);
    const sheet = buildSheetDefinition(
      [product({})],
      images,
      barcodes,
      { title: 'Shelf labels', subtitle: 'Tape beside the till' },
    );

    expect(sheet.pages).toBe(1);
    expect(sheet.definition['defaultStyle']).toEqual({ font: 'Helvetica' });
    const text = sheetTexts(sheet.definition).join('\n');
    expect(text).toContain('Shelf labels');
    expect(text).toContain('Tape beside the till');
    expect(text).toContain('Page 1 of 1');
    expect(text).toContain('Widget');
    expect(text).toContain('Acme');
    expect(text).toContain('1');
    expect(text).toMatch(/P[\d,]+\.\d{2}/);
    expect(text).not.toContain('₱');
  });

  it('drops the brand when the name wraps to two lines', () => {
    const name = 'Very Long Product Name That Will Not Fit On One Card Line';
    const sheet = buildSheetDefinition(
      [product({ name, brand: 'Acme', barcode: null })],
      new Map(),
      new Map(),
      { title: 'Shelf labels' },
    );
    const text = sheetTexts(sheet.definition).join('\n');
    expect(text).toContain('Very Long Product Name');
    expect(text).not.toContain('Acme');
  });

  it('starts a second page after six cards', () => {
    const products = Array.from({ length: 7 }, (_, index) =>
      product({ id: `p${index}`, name: `Item ${index + 1}`, barcode: null, brand: null }),
    );
    const sheet = buildSheetDefinition(products, new Map(), new Map(), { title: 'Shelf labels' });
    expect(sheet.pages).toBe(2);
    const text = sheetTexts(sheet.definition, 2, 2).join('\n');
    expect(text).toContain('Item 1');
    expect(text).toContain('Item 7');
    expect(text).toContain('Page 2 of 2');
  });

  it('leaves an empty run as one blank page', () => {
    const sheet = buildSheetDefinition([], new Map(), new Map(), { title: 'Shelf labels' });
    expect(sheet.pages).toBe(1);
    expect(sheet.definition['header']).toBeUndefined();
    expect(sheetTexts(sheet.definition).join('\n')).not.toContain('Shelf labels');
  });
});
