import zlib from 'node:zlib';

import pdfmake from 'pdfmake';

import { buildSheetDefinition } from '../src/app/modules/tools/barcode-sheet/barcode-sheet-layout.ts';
import { Product } from '../src/app/modules/products/types/product.types.ts';

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

function pdfText(buffer: Buffer): string {
  const latin = buffer.toString('latin1');
  const chunks = latin.split(/stream\r?\n/);
  let inflated = '';
  for (const chunk of chunks.slice(1)) {
    const data = chunk.split(/endstream/)[0].replace(/\r?\n$/, '');
    try {
      inflated += zlib.inflateSync(Buffer.from(data, 'latin1')).toString('latin1');
    } catch {
      inflated += data;
    }
  }
  const pieces: string[] = [];
  for (const match of inflated.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = match[1];
    if (hex.length < 2 || hex.length % 2 !== 0) {
      continue;
    }
    pieces.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return pieces.join('');
}

pdfmake.setFonts({
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
});

const sheet = buildSheetDefinition(
  [product({})],
  new Map([['p1', PNG]]),
  new Map([['4801234567890', { dataUrl: PNG, pixelWidth: 200, pixelHeight: 60 }]]),
  { title: 'Shelf labels', subtitle: 'Tape beside the till' },
);

const buffer = await pdfmake.createPdf(sheet.definition).getBuffer();
const text = pdfText(buffer);
const pageCount = buffer.toString('latin1').match(/\/Type \/Page[^s]/g)?.length ?? 0;

const checks = [
  ['title', text.includes('Shelf labels')],
  ['subtitle', text.includes('Tape beside the till')],
  ['name', text.includes('Widget')],
  ['brand', text.includes('Acme')],
  ['price', /P[\d,]+\.\d{2}/.test(text)],
  ['page', text.includes('Page 1 of 1')],
  ['one page', pageCount === 1],
  ['bytes', buffer.length > 500],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(text);
  console.error('failed', failed.map(([name]) => name).join(', '));
  process.exit(1);
}

console.log(`barcode sheet pdf ok (${buffer.length} bytes, ${pageCount} page)`);
