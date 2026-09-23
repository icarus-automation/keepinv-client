import { Product } from '../../products/types/product.types';
import { formatPeso } from '../../products/utils/money.pipe';

export interface BarcodeSheetOptions {
  /** Banner title printed at the top of every page. */
  title: string;
  /** Optional line under the title (e.g. an instruction to the cashier). */
  subtitle?: string;
}

/** A barcode raster, sized in pixels so the sheet can keep its aspect ratio. */
export interface SheetBarcode {
  readonly dataUrl: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface SheetDefinition {
  readonly pages: number;
  readonly definition: Record<string, unknown>;
}

// A4 portrait, millimetres. A roomy 2x3 grid = 6 cards per page.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const HEADER_H = 15;
const FOOTER_H = 7;
const COLS = 2;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;
const COL_GAP = 8;
const ROW_GAP = 8;
const TILE_PAD = 6;

const CONTENT_W = PAGE_W - MARGIN * 2;
const CELL_W = (CONTENT_W - (COLS - 1) * COL_GAP) / COLS;
const CONTENT_TOP = MARGIN + HEADER_H;
const CONTENT_BOTTOM = PAGE_H - MARGIN - FOOTER_H;
const CELL_H = (CONTENT_BOTTOM - CONTENT_TOP - (ROWS - 1) * ROW_GAP) / ROWS;

const IMAGE_BAND = 36;
const BARCODE_BAND = 15;
const INNER_W = CELL_W - TILE_PAD * 2;

const INK = '#181b1f';
const MUTED = '#7a828c';
const LINE = '#dfe2e6';
const PLATE = '#f8f9fb';

const MM_TO_PT = 72 / 25.4;

function pt(mm: number): number {
  return mm * MM_TO_PT;
}

/**
 * The printable catalog as a pdfmake document. Photos and barcodes are already rasters.
 * An empty product list is one blank page, matching the previous generator.
 */
export function buildSheetDefinition(
  products: readonly Product[],
  images: ReadonlyMap<string, string>,
  barcodes: ReadonlyMap<string, SheetBarcode>,
  options: BarcodeSheetOptions,
): SheetDefinition {
  const pages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  if (products.length === 0) {
    return {
      pages,
      definition: {
        pageSize: 'A4',
        pageOrientation: 'portrait',
        defaultStyle: { font: 'Helvetica' },
        content: [''],
      },
    };
  }

  const pageBlocks = [];
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const slice = products.slice(pageIndex * PER_PAGE, (pageIndex + 1) * PER_PAGE);
    const rows = [];
    for (let row = 0; row < ROWS; row += 1) {
      const left = slice[row * COLS];
      const right = slice[row * COLS + 1];
      if (!left && !right) {
        break;
      }
      rows.push({
        columns: [
          left
            ? tile(left, pageIndex * PER_PAGE + row * COLS + 1, images, barcodes)
            : { width: pt(CELL_W), text: '' },
          { width: pt(COL_GAP), text: '' },
          right
            ? tile(right, pageIndex * PER_PAGE + row * COLS + 2, images, barcodes)
            : { width: pt(CELL_W), text: '' },
        ],
        columnGap: 0,
        margin: [0, 0, 0, row < ROWS - 1 && slice[row * COLS + COLS] ? pt(ROW_GAP) : 0],
      });
    }
    pageBlocks.push({
      stack: rows,
      unbreakable: true,
      pageBreak: pageIndex > 0 ? 'before' : undefined,
    });
  }

  return {
    pages,
    definition: {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [pt(MARGIN), pt(CONTENT_TOP), pt(MARGIN), pt(MARGIN + FOOTER_H)],
      defaultStyle: { font: 'Helvetica' },
      header: () => header(options),
      footer: (currentPage: number, pageCount: number) => ({
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: MUTED,
        margin: [0, 6, 0, 0],
      }),
      content: pageBlocks,
    },
  };
}

function header(options: BarcodeSheetOptions): Record<string, unknown> {
  const stack: Record<string, unknown>[] = [
    {
      text: options.title,
      alignment: 'center',
      bold: true,
      fontSize: 15,
      color: INK,
    },
  ];
  if (options.subtitle) {
    stack.push({
      text: options.subtitle,
      alignment: 'center',
      fontSize: 9,
      color: MUTED,
      margin: [0, 2, 0, 0],
    });
  }
  stack.push({
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 6,
        x2: pt(CONTENT_W),
        y2: 6,
        lineWidth: 0.4,
        lineColor: LINE,
      },
    ],
  });
  return { margin: [pt(MARGIN), pt(6), pt(MARGIN), 0], stack };
}

function tile(
  product: Product,
  number: number,
  images: ReadonlyMap<string, string>,
  barcodes: ReadonlyMap<string, SheetBarcode>,
): Record<string, unknown> {
  const image = images.get(product.id);
  const barcode = product.barcode ? barcodes.get(product.barcode) : undefined;
  const nameLines = wrapLines(product.name, INNER_W, 11, true, 2);
  const showBrand = !!product.brand && nameLines.length === 1;
  const textHeight =
    nameLines.length * 4.6 + (showBrand ? 4.2 : 0) + 5.2;
  const gap = CELL_H - TILE_PAD * 2 - IMAGE_BAND - (barcode ? BARCODE_BAND : 0);
  const spacer = Math.max(1.5, (gap - textHeight) / 2);

  const stack: Record<string, unknown>[] = [
    badge(number),
    plate(image),
    {
      text: nameLines.join('\n'),
      alignment: 'center',
      bold: true,
      fontSize: 11,
      color: INK,
      margin: [0, pt(spacer), 0, 0],
    },
  ];
  if (showBrand && product.brand) {
    stack.push({
      text: truncate(product.brand, INNER_W, 8, false),
      alignment: 'center',
      fontSize: 8,
      color: MUTED,
      margin: [0, 1, 0, 0],
    });
  }
  // Standard PDF fonts can't render the peso glyph. Keep the plain "P" prefix.
  stack.push({
    text: formatPeso(product.sellingPrice).replace('₱', 'P'),
    alignment: 'center',
    bold: true,
    fontSize: 11,
    color: INK,
    margin: [0, 2, 0, 0],
  });
  if (barcode && barcode.pixelWidth > 0) {
    const placed = fitBarcode(barcode);
    stack.push({
      image: barcode.dataUrl,
      width: pt(placed.widthMm),
      height: pt(placed.heightMm),
      alignment: 'center',
      margin: [0, pt(spacer), 0, 0],
    });
  }

  return {
    width: pt(CELL_W),
    table: {
      widths: ['*'],
      heights: [pt(CELL_H)],
      body: [[{ stack }]],
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => LINE,
      vLineColor: () => LINE,
      paddingLeft: () => pt(TILE_PAD),
      paddingRight: () => pt(TILE_PAD),
      paddingTop: () => pt(TILE_PAD),
      paddingBottom: () => pt(TILE_PAD),
      fillColor: () => '#ffffff',
    },
  };
}

function badge(number: number): Record<string, unknown> {
  return {
    relativePosition: { x: 0, y: 0 },
    table: {
      widths: [pt(7)],
      body: [
        [
          {
            text: String(number),
            color: '#ffffff',
            fillColor: INK,
            alignment: 'center',
            bold: true,
            fontSize: 9,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 1,
      paddingBottom: () => 1,
    },
  };
}

function plate(image: string | undefined): Record<string, unknown> {
  const cell: Record<string, unknown> = image
    ? {
        image,
        fit: [pt(IMAGE_BAND - 3.2), pt(IMAGE_BAND - 3.2)],
        alignment: 'center',
      }
    : { text: '' };
  return {
    table: {
      widths: [pt(IMAGE_BAND)],
      heights: [pt(IMAGE_BAND)],
      body: [[cell]],
    },
    alignment: 'center',
    layout: {
      hLineWidth: () => 0.3,
      vLineWidth: () => 0.3,
      hLineColor: () => LINE,
      vLineColor: () => LINE,
      fillColor: () => PLATE,
      paddingLeft: () => pt(1.6),
      paddingRight: () => pt(1.6),
      paddingTop: () => pt(1.6),
      paddingBottom: () => pt(1.6),
    },
  };
}

function fitBarcode(barcode: SheetBarcode): { widthMm: number; heightMm: number } {
  const ratio = barcode.pixelHeight / barcode.pixelWidth;
  let widthMm = INNER_W;
  let heightMm = widthMm * ratio;
  if (heightMm > BARCODE_BAND) {
    heightMm = BARCODE_BAND;
    widthMm = heightMm / ratio;
  }
  return { widthMm, heightMm };
}

function wrapLines(text: string, maxWidthMm: number, sizePt: number, bold: boolean, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidthMm(next, sizePt, bold) <= maxWidthMm) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
    if (lines.length === maxLines) {
      return lines;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

function truncate(text: string, maxWidthMm: number, sizePt: number, bold: boolean): string {
  if (textWidthMm(text, sizePt, bold) <= maxWidthMm) {
    return text;
  }
  let trimmed = text;
  while (trimmed.length > 1 && textWidthMm(`${trimmed}...`, sizePt, bold) > maxWidthMm) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidthMm(text: string, sizePt: number, bold: boolean): number {
  if (measureCtx === undefined && typeof document !== 'undefined') {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (measureCtx) {
    measureCtx.font = `${bold ? 'bold ' : ''}${sizePt}pt Helvetica, Arial, sans-serif`;
    return (measureCtx.measureText(text).width * 25.4) / 96;
  }
  const average = bold ? 0.52 : 0.5;
  return text.length * sizePt * average * (25.4 / 72);
}
