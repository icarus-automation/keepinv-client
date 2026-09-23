import pdfMake from 'pdfmake/build/pdfmake';
import helvetica from 'pdfmake/build/standard-fonts/Helvetica';
import JsBarcode from 'jsbarcode';

import { Product, PRODUCT_IMAGE_PLACEHOLDER } from '../../products/types/product.types';
import {
  BarcodeSheetOptions,
  SheetBarcode,
  buildSheetDefinition,
} from './barcode-sheet-layout';

export type { BarcodeSheetOptions } from './barcode-sheet-layout';

/** Result of building a sheet: the PDF blob, an object URL for preview/print, and its page count. */
export interface GeneratedSheet {
  blob: Blob;
  url: string;
  pages: number;
}

/** Rasterised at this many px per side, on white, for a crisp tile photo. */
const IMAGE_RASTER_PX = 440;

let fontsReady = false;

function ensureHelvetica(): void {
  if (fontsReady) {
    return;
  }
  pdfMake.addFontContainer(unwrapDefault(helvetica));
  fontsReady = true;
}

function unwrapDefault(module: unknown): unknown {
  if (module && typeof module === 'object' && 'default' in module && !('fonts' in module)) {
    return module.default;
  }
  return module;
}

/**
 * Build the printable barcode catalog sheet. Photos are fetched and re-rasterised onto a white
 * square (so any source format and any leftover transparency render consistently), and each
 * barcode is drawn with JsBarcode. Returns a PDF blob plus an object URL the caller owns and must
 * revoke when done.
 */
export async function buildBarcodeSheet(
  products: Product[],
  options: BarcodeSheetOptions,
): Promise<GeneratedSheet> {
  ensureHelvetica();
  const images = await loadImages(products);
  const barcodes = barcodeImages(products);
  const sheet = buildSheetDefinition(products, images, barcodes, options);
  const blob = await pdfMake.createPdf(sheet.definition).getBlob();
  return { blob, url: URL.createObjectURL(blob), pages: sheet.pages };
}

function barcodeImages(products: readonly Product[]): Map<string, SheetBarcode> {
  const barcodes = new Map<string, SheetBarcode>();
  for (const product of products) {
    if (!product.barcode || barcodes.has(product.barcode)) {
      continue;
    }
    const canvas = barcodeCanvas(product.barcode);
    if (!canvas) {
      continue;
    }
    barcodes.set(product.barcode, {
      dataUrl: canvas.toDataURL('image/png'),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
    });
  }
  return barcodes;
}

const barcodeCache = new Map<string, HTMLCanvasElement | null>();

function barcodeCanvas(value: string): HTMLCanvasElement | null {
  const cached = barcodeCache.get(value);
  if (cached !== undefined) {
    return cached;
  }
  let canvas: HTMLCanvasElement | null = document.createElement('canvas');
  try {
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 2,
      height: 60,
      margin: 0,
      displayValue: true,
      fontSize: 18,
      textMargin: 2,
    });
  } catch {
    // An unencodable value should skip the barcode rather than fail the whole sheet.
    canvas = null;
  }
  barcodeCache.set(value, canvas);
  return canvas;
}

/** Fetch and rasterise every product photo (deduped by URL) into a white-square JPEG data URL. */
async function loadImages(products: Product[]): Promise<Map<string, string>> {
  const byProduct = new Map<string, string>();
  const byUrl = new Map<string, Promise<string | null>>();

  await Promise.all(
    products.map(async (product) => {
      const source = product.imageUrl ?? PRODUCT_IMAGE_PLACEHOLDER;
      if (!byUrl.has(source)) {
        byUrl.set(source, rasterizeSquare(source));
      }
      const data = await byUrl.get(source)!;
      const resolved = data ?? (await placeholderData());
      if (resolved) {
        byProduct.set(product.id, resolved);
      }
    }),
  );

  return byProduct;
}

let placeholderPromise: Promise<string | null> | null = null;

/** The bundled placeholder, rasterised once and reused for every photo-less product. */
function placeholderData(): Promise<string | null> {
  placeholderPromise ??= rasterizeSquare(PRODUCT_IMAGE_PLACEHOLDER);
  return placeholderPromise;
}

/**
 * Fetch an image and draw it centered (object-contain) on a white square canvas, returning a JPEG
 * data URL. Normalises any source format and guarantees a white background for the PDF. Resolves
 * to null on any failure so one bad photo never breaks the sheet.
 */
async function rasterizeSquare(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      return null;
    }
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = IMAGE_RASTER_PX;
    canvas.height = IMAGE_RASTER_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, IMAGE_RASTER_PX, IMAGE_RASTER_PX);
    const scale = Math.min(IMAGE_RASTER_PX / bitmap.width, IMAGE_RASTER_PX / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (IMAGE_RASTER_PX - w) / 2, (IMAGE_RASTER_PX - h) / 2, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}
