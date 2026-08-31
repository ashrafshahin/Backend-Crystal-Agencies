import type { IProduct, IQuotation, IQuotationItem } from '../types';

function formatCurrency(n: number): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: unknown): string {
  if (!(d instanceof Date)) {
    if (typeof d === 'string' || typeof d === 'number') {
      const parsed = new Date(d);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    }
    return '—';
  }
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type LineWithProduct = {
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
};

interface QuotationPDFContext {
  quotationNumber: string;
  createdAt: unknown;
  validUntil: unknown;
  rfqNumber?: string;
  customer: {
    companyName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    deliveryLocation?: string;
  };
  lines: LineWithProduct[];
  subtotal: number;
  tax: number;
  finalAmount: number;
  paymentTerms?: string;
  notes?: string;
}

function buildContext(
  quotation: IQuotation & { _id: unknown },
  products: Array<unknown>,
  rfq?: {
    companyName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    deliveryLocation?: string;
    rfqNumber?: string;
  } | null,
): QuotationPDFContext {
  const productMap = new Map<string, IProduct & { _id: unknown }>();
  for (const p of products) {
    if (p && typeof p === 'object' && '_id' in (p as object)) {
      const cast = p as IProduct & { _id: unknown };
      productMap.set(String(cast._id), cast);
    }
  }

  const lines: LineWithProduct[] = quotation.items.map((raw) => {
    const item = raw as IQuotationItem & { _id: unknown };
    const pid = String(item.productId);
    const product = productMap.get(pid);
    const name =
      item.productName && item.productName.trim().length > 0
        ? item.productName
        : product?.name && product.name.trim().length > 0
          ? product.name
          : 'Unknown Product';
    const sku =
      item.productSku && item.productSku.trim().length > 0
        ? item.productSku
        : product?.sku && product.sku.trim().length > 0
          ? product.sku
          : 'UNKNOWN';
    const lineDiscount =
      typeof item.discount === 'number' && item.discount > 0 ? item.discount : 0;
    const unitPrice =
      typeof item.unitPrice === 'number' && item.unitPrice >= 0
        ? item.unitPrice
        : 0;
    const quantity =
      typeof item.quantity === 'number' && item.quantity >= 0
        ? item.quantity
        : 0;
    const subtotal =
      typeof item.subtotal === 'number' && item.subtotal >= 0
        ? item.subtotal
        : Math.max(0, unitPrice * quantity - lineDiscount);
    return {
      productName: name,
      productSku: sku,
      quantity,
      unitPrice,
      discount: lineDiscount,
      subtotal,
    };
  });

  const subtotal =
    typeof quotation.totalAmount === 'number' ? quotation.totalAmount : 0;
  const tax = typeof quotation.tax === 'number' ? quotation.tax : 0;
  const finalAmount =
    typeof quotation.finalAmount === 'number'
      ? quotation.finalAmount
      : subtotal + tax;

  return {
    quotationNumber: quotation.quotationNumber,
    createdAt: quotation.createdAt,
    validUntil: quotation.validUntil,
    rfqNumber: rfq?.rfqNumber,
    customer: {
      companyName: rfq?.companyName,
      contactPerson: rfq?.contactPerson,
      email: rfq?.email,
      phone: rfq?.phone,
      deliveryLocation: rfq?.deliveryLocation,
    },
    lines,
    subtotal,
    tax,
    finalAmount,
    paymentTerms: 'Due per quotation terms. Accepted quotation converts to a sales order.',
    notes: quotation.notes,
  };
}

const COMPANY_NAME = 'Crystal Agencies';
const COMPANY_TAGLINE = 'Wholesale & Distribution';
const COMPANY_CONTACT = 'Email: orders@crystalagencies.example  |  Phone: +1-555-0100';
const PAGE_MARGIN = 50;
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#4b5563';
const TEXT_MUTED = '#6b7280';
const ACCENT = '#1d4ed8';
const BORDER_LIGHT = '#e5e7eb';
const HEADER_BG = '#eef2ff';

export async function generateQuotationPDF(
  quotation: IQuotation & { _id: unknown },
  products: Array<unknown>,
  rfq?: {
    companyName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    deliveryLocation?: string;
    rfqNumber?: string;
  } | null,
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require('pdfkit');

  const ctx = buildContext(quotation, products, rfq ?? null);

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc: any = new PDFDocument({
        size: 'LETTER',
        margins: {
          top: PAGE_MARGIN,
          bottom: PAGE_MARGIN,
          left: PAGE_MARGIN,
          right: PAGE_MARGIN,
        },
        bufferPages: true,
        autoFirstPage: true,
      });

      const chunks: Uint8Array[] = [];
      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      doc.on('error', (err: Error) => reject(err));
      doc.on('end', () => {
        resolve(Buffer.concat(chunks as unknown as Buffer[]));
      });

      // --- Header ---
      doc
        .fillColor(TEXT_PRIMARY)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(COMPANY_NAME, PAGE_MARGIN, PAGE_MARGIN - 8, {
          align: 'left',
          continued: false,
        });

      doc
        .fillColor(TEXT_SECONDARY)
        .fontSize(10)
        .font('Helvetica')
        .text(COMPANY_TAGLINE, PAGE_MARGIN, PAGE_MARGIN + 18, {
          align: 'left',
        });

      const pageWidth = doc.page.width - PAGE_MARGIN * 2;

      doc
        .fillColor(ACCENT)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('QUOTATION', PAGE_MARGIN, PAGE_MARGIN - 8, {
          align: 'right',
          width: pageWidth,
        });

      doc
        .fillColor(TEXT_SECONDARY)
        .fontSize(10)
        .font('Helvetica')
        .text(
          `# ${ctx.quotationNumber}   |   Issued: ${formatDate(ctx.createdAt)}`,
          PAGE_MARGIN,
          PAGE_MARGIN + 18,
          { align: 'right', width: pageWidth },
        );

      let y = PAGE_MARGIN + 48;

      doc.strokeColor(BORDER_LIGHT).lineWidth(1).moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + pageWidth, y).stroke();
      y += 14;

      doc
        .fillColor(TEXT_MUTED)
        .fontSize(9)
        .font('Helvetica-Oblique')
        .text(COMPANY_CONTACT, PAGE_MARGIN, y, {
          align: 'center',
          width: pageWidth,
        });
      y += 20;

      // --- Details section (2 cols: RFQ/Customer, ValidUntil) ---
      const colXLeft = PAGE_MARGIN;
      const colXRight = PAGE_MARGIN + pageWidth / 2 + 20;
      const colWidth = pageWidth / 2 - 20;

      function blockLabel(label: string): void {
        doc
          .fillColor(TEXT_MUTED)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(label.toUpperCase());
      }
      function blockValue(v: string | undefined, fallback = '—'): void {
        doc
          .fillColor(TEXT_PRIMARY)
          .fontSize(11)
          .font('Helvetica')
          .text(v && v.trim().length > 0 ? v : fallback);
        doc.moveDown(0.25);
      }

      doc.text('', colXLeft, y, { width: colWidth });
      blockLabel('Request for Quotation');
      blockValue(ctx.rfqNumber ? `# ${ctx.rfqNumber}` : 'None supplied');

      blockLabel('Bill To / Customer');
      blockValue(ctx.customer.companyName);
      blockValue(ctx.customer.contactPerson);
      blockValue(ctx.customer.email);
      if (ctx.customer.phone && ctx.customer.phone.trim().length > 0) {
        blockValue(ctx.customer.phone);
      }
      if (
        ctx.customer.deliveryLocation &&
        ctx.customer.deliveryLocation.trim().length > 0
      ) {
        blockLabel('Delivery Location');
        blockValue(ctx.customer.deliveryLocation);
      }

      const rightStartY = y;
      doc.text('', colXRight, rightStartY, { width: colWidth });
      blockLabel('Quotation #');
      blockValue(ctx.quotationNumber);

      blockLabel('Date Issued');
      blockValue(formatDate(ctx.createdAt));

      blockLabel('Valid Until');
      blockValue(formatDate(ctx.validUntil));

      blockLabel('Currency');
      blockValue('USD ($)');

      // move y to bottom of tallest column
      y = Math.max(doc.y, y + 4);
      doc.moveDown(0.75);
      y = doc.y + 8;

      // --- Table heading row ---
      const tableX = PAGE_MARGIN;
      const tableW = pageWidth;

      const colW = {
        product: tableW * 0.38,
        qty: tableW * 0.08,
        unit: tableW * 0.14,
        discount: tableW * 0.14,
        subtotal: tableW * 0.14,
        spacer: tableW * 0.12,
      };
      // Redistribute any rounding to make sums exact
      const baseCols = [colW.product, colW.qty, colW.unit, colW.discount, colW.subtotal];
      const baseSum = baseCols.reduce((a, b) => a + b, 0);
      const leftover = tableW - baseSum;
      colW.product += leftover;

      const rowHeight = 28;

      doc
        .rect(tableX, y, tableW, rowHeight)
        .fillAndStroke(HEADER_BG, BORDER_LIGHT);
      doc.fillColor(TEXT_PRIMARY).fontSize(10).font('Helvetica-Bold');

      let cursorX = tableX + 8;
      doc.text('Product / SKU', cursorX, y + 9, { width: colW.product - 8 });
      cursorX += colW.product;
      doc.text('Qty', cursorX + 4, y + 9, { width: colW.qty - 8, align: 'right' });
      cursorX += colW.qty;
      doc.text('Unit Price', cursorX + 4, y + 9, { width: colW.unit - 8, align: 'right' });
      cursorX += colW.unit;
      doc.text('Discount', cursorX + 4, y + 9, { width: colW.discount - 8, align: 'right' });
      cursorX += colW.discount;
      doc.text('Subtotal', cursorX + 4, y + 9, { width: colW.subtotal - 8, align: 'right' });

      y += rowHeight;

      const lineRowHeight = 24;
      const stripeAlt = '#fafafa';

      if (ctx.lines.length === 0) {
        doc
          .rect(tableX, y, tableW, lineRowHeight)
          .fillAndStroke('#ffffff', BORDER_LIGHT);
        doc
          .fillColor(TEXT_MUTED)
          .fontSize(10)
          .font('Helvetica-Oblique')
          .text(
            'No items listed on this quotation.',
            tableX + 8,
            y + 7,
            { width: tableW - 16 },
          );
        y += lineRowHeight;
      }

      ctx.lines.forEach((line, idx) => {
        if (y > doc.page.height - PAGE_MARGIN - 100) {
          doc.addPage();
          y = PAGE_MARGIN;
        }

        const rowBg = idx % 2 === 0 ? '#ffffff' : stripeAlt;
        doc.rect(tableX, y, tableW, lineRowHeight).fillAndStroke(rowBg, BORDER_LIGHT);

        const labelLineHeight = 10;
        const descY = y + 6;
        const skuY = y + 6 + labelLineHeight + 1;

        doc
          .fillColor(TEXT_PRIMARY)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(line.productName, tableX + 8, descY, {
            width: colW.product - 16,
            height: labelLineHeight,
            ellipsis: true,
          });
        doc
          .fillColor(TEXT_MUTED)
          .fontSize(8)
          .font('Helvetica-Oblique')
          .text(`SKU: ${line.productSku}`, tableX + 8, skuY, {
            width: colW.product - 16,
          });

        cursorX = tableX + colW.product;

        doc
          .fillColor(TEXT_PRIMARY)
          .fontSize(10)
          .font('Helvetica')
          .text(String(line.quantity), cursorX + 4, y + 8, {
            width: colW.qty - 8,
            align: 'right',
          });
        cursorX += colW.qty;

        doc.text(formatCurrency(line.unitPrice), cursorX + 4, y + 8, {
          width: colW.unit - 8,
          align: 'right',
        });
        cursorX += colW.unit;

        doc.text(
          line.discount > 0 ? formatCurrency(line.discount) : '—',
          cursorX + 4,
          y + 8,
          { width: colW.discount - 8, align: 'right' },
        );
        cursorX += colW.discount;

        doc
          .font('Helvetica-Bold')
          .fillColor(TEXT_PRIMARY)
          .text(formatCurrency(line.subtotal), cursorX + 4, y + 8, {
            width: colW.subtotal - 8,
            align: 'right',
          });

        y += lineRowHeight;
      });

      // --- Totals block ---
      doc.moveDown(0.6);
      y = doc.y;

      const totalsLabelW = tableW * 0.6;
      const totalsValueW = tableW * 0.4;
      const totalsRowH = 22;

      function totalsRow(label: string, value: string, bold = false, bg?: string): void {
        if (y > doc.page.height - PAGE_MARGIN - 60) {
          doc.addPage();
          y = PAGE_MARGIN;
        }
        const rowY = y;
        if (bg) {
          doc.rect(tableX, rowY, tableW, totalsRowH).fillAndStroke(bg, BORDER_LIGHT);
        } else {
          doc.rect(tableX, rowY, tableW, totalsRowH).strokeColor(BORDER_LIGHT).stroke();
        }
        doc
          .fillColor(TEXT_PRIMARY)
          .fontSize(10)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(label, tableX + 8, rowY + 6, { width: totalsLabelW - 16, align: 'right' })
          .fillColor(TEXT_PRIMARY)
          .fontSize(10)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(value, tableX + totalsLabelW + 8, rowY + 6, {
            width: totalsValueW - 16,
            align: 'right',
          });
        y += totalsRowH;
      }

      totalsRow('Subtotal', formatCurrency(ctx.subtotal));
      totalsRow(`Tax${ctx.tax > 0 ? '' : ''}`, formatCurrency(ctx.tax));
      totalsRow('Total (Final Amount)', formatCurrency(ctx.finalAmount), true, HEADER_BG);

      y += 10;

      // --- Footer sections: Payment Terms + Notes ---
      doc
        .fillColor(TEXT_PRIMARY)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Payment Terms', tableX, y, { width: tableW });
      y = doc.y + 2;
      doc
        .fillColor(TEXT_SECONDARY)
        .fontSize(9)
        .font('Helvetica')
        .text(ctx.paymentTerms ?? '—', tableX, y, { width: tableW });
      y = doc.y + 8;

      if (ctx.notes && ctx.notes.trim().length > 0) {
        doc
          .fillColor(TEXT_PRIMARY)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Notes / Terms & Conditions', tableX, y, { width: tableW });
        y = doc.y + 2;
        doc
          .fillColor(TEXT_SECONDARY)
          .fontSize(9)
          .font('Helvetica')
          .text(ctx.notes, tableX, y, { width: tableW });
        y = doc.y + 8;
      }

      // --- Page number footer on every page ---
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - 28;
        doc
          .fillColor(TEXT_MUTED)
          .fontSize(8)
          .font('Helvetica')
          .text(
            `${COMPANY_NAME}  —  Quotation ${ctx.quotationNumber}   |   Page ${i + 1} of ${pageCount}`,
            PAGE_MARGIN,
            footerY,
            { width: pageWidth, align: 'center' },
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
