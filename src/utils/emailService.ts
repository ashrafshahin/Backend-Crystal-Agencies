import {
  buildFromAddress,
  getMailer,
  isEmailConfigured,
  isSimulateMode,
} from '../config/emailConfig';
import EmailTemplate from '../models/EmailTemplate';
import type {
  IEmailTemplate,
  IOrder,
  IOrderItem,
  IQuotation,
  IUser,
} from '../types';

const COMPANY_NAME = 'Crystal Agencies';
const COMPANY_SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ?? 'support@crystalagencies.example';

type Variables = Record<string, unknown>;

export interface SendResult {
  ok: boolean;
  simulate: boolean;
  accepted?: string[];
  messageId?: string;
  error?: string;
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(template: string, vars: Variables): string {
  let out = template;
  for (const key of Object.keys(vars)) {
    const value = vars[key];
    const rendered =
      typeof value === 'number' ? String(value) : escapeHtml(value);
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    out = out.replace(pattern, rendered);
  }
  return out;
}

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
  if (d instanceof Date) {
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
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

async function resolveTemplate(
  templateName: string,
  fallback: { subject: string; body: string },
): Promise<{ subject: string; body: string; source: 'db' | 'builtin' }> {
  try {
    const doc = await EmailTemplate.findOne({
      name: templateName,
      isActive: true,
    })
      .lean<IEmailTemplate | null>()
      .exec();
    if (doc) {
      return { subject: doc.subject, body: doc.body, source: 'db' };
    }
  } catch (_err) {
    // fall through to builtin
  }
  return {
    subject: fallback.subject,
    body: fallback.body,
    source: 'builtin',
  };
}

async function sendMailInternal(
  to: string,
  subject: string,
  htmlBody: string,
  options?: { replyTo?: string; cc?: string[]; bcc?: string[] },
): Promise<SendResult> {
  const configured = isEmailConfigured();
  const simulate = !configured;
  // #region debug-point H3:sendMailInternal-entry
  (()=>{const fsM=require('fs'),pM='.dbg/verification-email-not-received.env';let uM='http://127.0.0.1:7778/event',sM='verification-email-not-received';try{const eM=fsM.readFileSync(pM,'utf8');uM=eM.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uM;sM=eM.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sM}catch{}fetch(uM,{method:'POST',body:JSON.stringify({sessionId:sM,runId:'pre',hypothesisId:'H3',location:'emailService.ts:sendMailInternal:entry',msg:'[DEBUG] H3 sendMailInternal entry',data:{to,subject:subject.slice(0,80),configured,simulate,bodyLen:htmlBody.length,hasFrom:Boolean(buildFromAddress())},ts:Date.now()})}).catch(()=>{})})();
  // #endregion
  try {
    const transporter = getMailer();
    // #region debug-point H3:transporter-acquired
    (()=>{const fsN=require('fs'),pN='.dbg/verification-email-not-received.env';let uN='http://127.0.0.1:7778/event',sN='verification-email-not-received';try{const eN=fsN.readFileSync(pN,'utf8');uN=eN.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uN;sN=eN.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sN}catch{}fetch(uN,{method:'POST',body:JSON.stringify({sessionId:sN,runId:'pre',hypothesisId:'H3',location:'emailService.ts:sendMailInternal:transporter',msg:'[DEBUG] H3 transporter acquired',data:{transporterType:transporter?.constructor?.name ?? 'unknown',fromAddress:buildFromAddress()},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    const info = await transporter.sendMail({
      from: buildFromAddress(),
      to,
      replyTo: options?.replyTo,
      cc: options?.cc,
      bcc: options?.bcc,
      subject,
      html: htmlBody,
    });
    if (simulate || isSimulateMode()) {
      // eslint-disable-next-line no-console
      console.log(
        `[EMAIL::SIMULATE] to=${to} subject="${subject}" — SMTP not configured; no email dispatched.`,
      );
      // #region debug-point H3:simulate-return
      (()=>{const fsP=require('fs'),pP='.dbg/verification-email-not-received.env';let uP='http://127.0.0.1:7778/event',sP='verification-email-not-received';try{const eP=fsP.readFileSync(pP,'utf8');uP=eP.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uP;sP=eP.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sP}catch{}fetch(uP,{method:'POST',body:JSON.stringify({sessionId:sP,runId:'post',hypothesisId:'H3',location:'emailService.ts:sendMailInternal:simulate-return',msg:'[DEBUG] H3 simulate path returned',data:{to,subject:subject.slice(0,80),infoKeys:typeof info ==='object'?Object.keys(info):[]},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      return { ok: true, simulate: true };
    }
    const result: SendResult = {
      ok: true,
      simulate: false,
      accepted: Array.isArray(info.accepted) ? (info.accepted as string[]) : [],
      messageId: info.messageId,
    };
    // #region debug-point H3:real-send-success
    (()=>{const fsR3=require('fs'),pR3='.dbg/verification-email-not-received.env';let uR3='http://127.0.0.1:7778/event',sR3='verification-email-not-received';try{const eR3=fsR3.readFileSync(pR3,'utf8');uR3=eR3.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uR3;sR3=eR3.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sR3}catch{}fetch(uR3,{method:'POST',body:JSON.stringify({sessionId:sR3,runId:'post',hypothesisId:'H3',location:'emailService.ts:sendMailInternal:real-send-success',msg:'[DEBUG] H3 real send success returned',data:{to,subject:subject.slice(0,80),messageId:info.messageId,acceptedCount:(info.accepted && Array.isArray(info.accepted))?info.accepted.length:0,rejectedCount:(info.rejected && Array.isArray(info.rejected))?info.rejected.length:0,response:typeof info.response==='string'?info.response.slice(0,200):undefined},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // #region debug-point H3:sendMailInternal-catch
    (()=>{const fsQ=require('fs'),pQ='.dbg/verification-email-not-received.env';let uQ='http://127.0.0.1:7778/event',sQ='verification-email-not-received';try{const eQ=fsQ.readFileSync(pQ,'utf8');uQ=eQ.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uQ;sQ=eQ.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sQ}catch{}fetch(uQ,{method:'POST',body:JSON.stringify({sessionId:sQ,runId:'pre',hypothesisId:'H3',location:'emailService.ts:sendMailInternal:catch',msg:'[DEBUG] H3 sendMailInternal caught error',data:{to,subject:subject.slice(0,80),error:msg,errorClass:err instanceof Error?err.constructor.name:'unknown'},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    // eslint-disable-next-line no-console
    console.error(`[EMAIL::ERROR] to=${to} subject="${subject}" error=${msg}`);
    return { ok: false, simulate, error: msg };
  }
}

export function sendEmail(
  to: string,
  templateName: string,
  vars: Variables,
  fallback: { subject: string; body: string },
  options?: { replyTo?: string; cc?: string[]; bcc?: string[] },
): Promise<SendResult> {
  return (async (): Promise<SendResult> => {
    // #region debug-point H3:sendEmail-entry
    (()=>{const fsS=require('fs'),pS='.dbg/verification-email-not-received.env';let uS='http://127.0.0.1:7778/event',sS='verification-email-not-received';try{const eS=fsS.readFileSync(pS,'utf8');uS=eS.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uS;sS=eS.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sS}catch{}fetch(uS,{method:'POST',body:JSON.stringify({sessionId:sS,runId:'pre',hypothesisId:'H3',location:'emailService.ts:sendEmail:entry',msg:'[DEBUG] H3 sendEmail entry',data:{to,templateName,varKeys:Object.keys(vars),fallbackSubjectLen:fallback.subject.length},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    const resolved = await resolveTemplate(templateName, fallback);
    // #region debug-point H3:template-resolved
    (()=>{const fsT=require('fs'),pT='.dbg/verification-email-not-received.env';let uT='http://127.0.0.1:7778/event',sT='verification-email-not-received';try{const eT=fsT.readFileSync(pT,'utf8');uT=eT.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uT;sT=eT.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sT}catch{}fetch(uT,{method:'POST',body:JSON.stringify({sessionId:sT,runId:'pre',hypothesisId:'H3',location:'emailService.ts:sendEmail:resolved',msg:'[DEBUG] H3 template resolved',data:{source:resolved.source,subjectLen:resolved.subject.length,bodyLen:resolved.body.length},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    const subject = render(resolved.subject, vars);
    const html = render(resolved.body, vars);
    return sendMailInternal(to, subject, html, options);
  })();
}

function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{{subject}}</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #f3f4f6; color: #111827; }
  .container { max-width: 600px; margin: 0 auto; padding: 24px; }
  .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 2px rgba(17,24,39,0.06); }
  .brand { color: #1d4ed8; font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .tagline { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  .h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px 0; color: #111827; }
  .p { font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 12px 0; }
  .muted { color: #6b7280; font-size: 12px; }
  .hr { border-top: 1px solid #e5e7eb; margin: 24px 0; }
  .btn { display: inline-block; padding: 12px 24px; background: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; }
  table.data { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  table.data th, table.data td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: left; }
  table.data th { color: #374151; font-weight: 600; background: #f9fafb; }
  .right { text-align: right; }
  .label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 16px; margin-bottom: 4px; }
  .val { font-size: 15px; font-weight: 600; color: #111827; }
  .footer { margin-top: 24px; color: #6b7280; font-size: 12px; line-height: 1.5; }
  .footer a { color: #1d4ed8; text-decoration: none; }
  .status-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-confirmed { background: #dbeafe; color: #1e40af; }
  .status-shipped { background: #e0e7ff; color: #3730a3; }
  .status-delivered { background: #d1fae5; color: #065f46; }
  .status-cancelled { background: #fee2e2; color: #991b1b; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="brand">${COMPANY_NAME}</div>
    <div class="tagline">Wholesale &amp; Distribution</div>
${content}
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.<br/>
      Contact: <a href="mailto:${COMPANY_SUPPORT_EMAIL}">${COMPANY_SUPPORT_EMAIL}</a>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ---------- Built-in fallback templates ----------

function builtinOrderConfirmationBody(): string {
  return wrapHtml(`
    <h1 class="h1">Thank you for your order, {{customerName}}!</h1>
    <p class="p">Your order has been received and is being processed. Below is a summary of your purchase.</p>

    <div class="label">Order Number</div>
    <div class="val">{{orderNumber}}</div>

    <div class="label">Order Date</div>
    <div class="val">{{orderDate}}</div>

    <div class="label">Status</div>
    <div><span class="status-badge status-{{statusClass}}">{{status}}</span></div>

    <div class="hr"></div>

    <table class="data">
      <thead>
        <tr>
          <th>Item</th>
          <th class="right">Qty</th>
          <th class="right">Unit</th>
          <th class="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {{lineItemsHtml}}
      </tbody>
    </table>

    <div class="hr"></div>

    <div class="label">Shipping Address</div>
    <p class="p">{{shippingAddressHtml}}</p>

    <div class="label">Shipping Method &nbsp;|&nbsp; Payment Method</div>
    <p class="p">{{shippingMethod}} &nbsp;•&nbsp; {{paymentMethod}}</p>

    <table class="data" style="margin-top: 16px;">
      <tbody>
        <tr><td>Subtotal</td><td class="right">{{subtotal}}</td></tr>
        <tr><td>Discount</td><td class="right">{{discount}}</td></tr>
        <tr><td>Tax</td><td class="right">{{tax}}</td></tr>
        <tr><td><strong>Total Paid</strong></td><td class="right"><strong>{{finalAmount}}</strong></td></tr>
      </tbody>
    </table>

    <div class="hr"></div>
    <p class="p muted">If you have questions, reply to this email or contact support.</p>
  `);
}

function builtinQuotationSentBody(): string {
  return wrapHtml(`
    <h1 class="h1">New Quotation Ready, {{customerName}}</h1>
    <p class="p">We've prepared a quotation for your request. Please review before the validity date.</p>

    <div class="label">Quotation #</div>
    <div class="val">{{quotationNumber}}</div>

    {{#if rfqNumber}}
    <div class="label">Related RFQ #</div>
    <div class="val">{{rfqNumber}}</div>
    {{/if}}

    <div class="label">Valid Until</div>
    <div class="val">{{validUntil}}</div>

    <div class="label">Final Amount</div>
    <div class="val" style="color:#1d4ed8;">{{finalAmount}}</div>

    <div class="hr"></div>

    <table class="data">
      <thead>
        <tr>
          <th>Item</th>
          <th class="right">Qty</th>
          <th class="right">Unit</th>
          <th class="right">Discount</th>
          <th class="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {{lineItemsHtml}}
      </tbody>
    </table>

    {{#if notes}}
    <div class="hr"></div>
    <div class="label">Notes / Terms</div>
    <p class="p">{{notes}}</p>
    {{/if}}

    <div class="hr"></div>
    <p class="p">If you accept, log in to your account or contact our sales team.</p>
  `);
}

function builtinOrderStatusBody(): string {
  return wrapHtml(`
    <h1 class="h1">Order Status Updated</h1>
    <p class="p">Hi {{customerName}}, your order status has changed.</p>

    <div class="label">Order Number</div>
    <div class="val">{{orderNumber}}</div>

    <div class="label">New Status</div>
    <div><span class="status-badge status-{{statusClass}}">{{status}}</span></div>

    <div class="label">Updated At</div>
    <div class="val">{{updatedAt}}</div>

    {{#if message}}
    <div class="hr"></div>
    <p class="p">{{message}}</p>
    {{/if}}

    <div class="hr"></div>
    <p class="p muted">Log in to your account to view the full order.</p>
  `);
}

function builtinPasswordResetBody(): string {
  return wrapHtml(`
    <h1 class="h1">Reset your password</h1>
    <p class="p">Hi {{customerName}}, we received a request to reset the password for your account.</p>

    <p class="p">Click the button below to set a new password. This link is valid for 24 hours.</p>

    <p style="margin: 24px 0;">
      <a class="btn" href="{{resetLink}}">Reset Password</a>
    </p>

    <p class="p muted">If the button doesn't work, copy and paste this URL into your browser:</p>
    <p class="p" style="word-break: break-all; color:#1d4ed8;">{{resetLink}}</p>

    <div class="hr"></div>
    <p class="p muted">If you didn't request a password reset, you can safely ignore this email.</p>
  `);
}

function builtinVerificationBody(): string {
  return wrapHtml(`
    <h1 class="h1">Welcome to ${COMPANY_NAME}, {{customerName}}!</h1>
    <p class="p">Thanks for signing up. Please verify your email address to activate your account.</p>

    <p style="margin: 24px 0;">
      <a class="btn" href="{{verificationLink}}">Verify Email Address</a>
    </p>

    <p class="p muted">If the button doesn't work, copy and paste this URL into your browser:</p>
    <p class="p" style="word-break: break-all; color:#1d4ed8;">{{verificationLink}}</p>

    <div class="hr"></div>
    <p class="p muted">If you didn't create an account, you can safely ignore this email.</p>
  `);
}

// ---------- Specific senders ----------

function orderLinesHtml(items: IOrderItem[]): string {
  const rows = items
    .map((it) => {
      const name = it.productName ?? 'Item';
      const sku = it.productSku ? `<span style="color:#6b7280;font-size:11px;">SKU ${escapeHtml(it.productSku)}</span>` : '';
      const qty = String(it.quantity);
      const unit = formatCurrency(it.price);
      const sub = formatCurrency(
        typeof it.subtotal === 'number'
          ? it.subtotal
          : it.price * it.quantity,
      );
      return `<tr>
        <td>
          <div style="font-weight:600;">${escapeHtml(name)}</div>
          ${sku}
        </td>
        <td class="right">${qty}</td>
        <td class="right">${unit}</td>
        <td class="right">${sub}</td>
      </tr>`;
    })
    .join('\n        ');
  return rows;
}

function quotationLinesHtml(items: {
  productName?: string;
  productSku?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  subtotal?: number;
}[]): string {
  const rows = items
    .map((it) => {
      const name = it.productName ?? 'Item';
      const sku = it.productSku ? `<span style="color:#6b7280;font-size:11px;">SKU ${escapeHtml(it.productSku)}</span>` : '';
      const qty = String(it.quantity);
      const unit = formatCurrency(it.unitPrice);
      const lineDisc =
        typeof it.discount === 'number' && it.discount > 0
          ? formatCurrency(it.discount)
          : '—';
      const sub = formatCurrency(
        typeof it.subtotal === 'number'
          ? it.subtotal
          : Math.max(0, it.unitPrice * it.quantity - (it.discount ?? 0)),
      );
      return `<tr>
        <td>
          <div style="font-weight:600;">${escapeHtml(name)}</div>
          ${sku}
        </td>
        <td class="right">${qty}</td>
        <td class="right">${unit}</td>
        <td class="right">${lineDisc}</td>
        <td class="right">${sub}</td>
      </tr>`;
    })
    .join('\n        ');
  return rows;
}

function statusClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'confirmed':
      return 'confirmed';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

interface OrderLike {
  orderNumber: string;
  status: string;
  totalAmount: number;
  discount: number;
  tax: number;
  finalAmount: number;
  createdAt?: unknown;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
    phone?: string;
  };
  shippingMethod: string;
  paymentMethod: string;
  items: IOrderItem[];
}

interface UserLike {
  name: string;
  email: string;
}

function renderHandbarsConditionals(html: string, vars: Variables): string {
  let out = html;
  const ifPattern = /{{#if\s+(\w+)\s*}}([\s\S]*?){{\/if}}/g;
  out = out.replace(ifPattern, (_m, name, body) => {
    const val = vars[name];
    if (val === undefined || val === null || val === false || val === '') {
      return '';
    }
    if (typeof val === 'string' && val.trim().length === 0) return '';
    return body;
  });
  return out;
}

export async function sendOrderConfirmation(
  order: OrderLike,
  user: UserLike,
): Promise<SendResult> {
  const lineItemsHtml = orderLinesHtml(order.items);
  const addrParts = [
    order.shippingAddress.fullName,
    order.shippingAddress.addressLine1,
    order.shippingAddress.addressLine2,
    order.shippingAddress.city,
    order.shippingAddress.state,
    order.shippingAddress.postalCode,
    order.shippingAddress.country,
    order.shippingAddress.phone,
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  const shippingAddressHtml = addrParts
    .map((p) => escapeHtml(p))
    .join('<br/>');
  const vars: Variables = {
    customerName: user.name,
    orderNumber: order.orderNumber,
    orderDate: formatDate(order.createdAt),
    status: order.status,
    statusClass: statusClass(order.status),
    lineItemsHtml,
    shippingAddressHtml,
    shippingMethod: order.shippingMethod,
    paymentMethod: order.paymentMethod,
    subtotal: formatCurrency(order.totalAmount),
    discount: formatCurrency(order.discount),
    tax: formatCurrency(order.tax),
    finalAmount: formatCurrency(order.finalAmount),
    subject: `Order ${order.orderNumber} Confirmation — ${COMPANY_NAME}`,
  };
  const fallback = {
    subject: `Your ${COMPANY_NAME} Order #${order.orderNumber}`,
    body: builtinOrderConfirmationBody(),
  };
  const result = await sendEmail(
    user.email,
    'order-confirmation',
    vars,
    fallback,
  );
  return result;
}

interface QuotationLike {
  quotationNumber: string;
  validUntil: unknown;
  totalAmount: number;
  tax: number;
  finalAmount: number;
  notes?: string;
  items: Array<{
    productName?: string;
    productSku?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    subtotal?: number;
  }>;
}

export async function sendQuotationSent(
  quotation: QuotationLike & { rfqNumber?: string },
  user: UserLike,
): Promise<SendResult> {
  const lineItemsHtml = quotationLinesHtml(quotation.items);
  const vars: Variables = {
    customerName: user.name,
    quotationNumber: quotation.quotationNumber,
    rfqNumber: quotation.rfqNumber ?? '',
    validUntil: formatDate(quotation.validUntil),
    finalAmount: formatCurrency(quotation.finalAmount),
    lineItemsHtml,
    notes: quotation.notes ?? '',
    subject: `Quotation ${quotation.quotationNumber} — ${COMPANY_NAME}`,
  };
  const fallbackSubject = quotation.rfqNumber
    ? `Quotation #${quotation.quotationNumber} (RFQ #${quotation.rfqNumber})`
    : `Your ${COMPANY_NAME} Quotation #${quotation.quotationNumber}`;
  const fallback = {
    subject: fallbackSubject,
    body: renderHandbarsConditionals(builtinQuotationSentBody(), vars),
  };
  return sendEmail(user.email, 'quotation-sent', vars, fallback);
}

export async function sendOrderStatusUpdate(
  order: Pick<OrderLike, 'orderNumber' | 'status'> & {
    updatedAt?: unknown;
  },
  user: UserLike,
  message?: string,
): Promise<SendResult> {
  const vars: Variables = {
    customerName: user.name,
    orderNumber: order.orderNumber,
    status: order.status,
    statusClass: statusClass(order.status),
    updatedAt: formatDate(order.updatedAt ?? new Date()),
    message: message ?? '',
    subject: `Order #${order.orderNumber} is now ${order.status}`,
  };
  const fallback = {
    subject: `Order #${order.orderNumber} — status: ${order.status}`,
    body: renderHandbarsConditionals(builtinOrderStatusBody(), vars),
  };
  return sendEmail(user.email, 'order-status-update', vars, fallback);
}

export async function sendPasswordReset(
  user: UserLike,
  resetLink: string,
): Promise<SendResult> {
  const vars: Variables = {
    customerName: user.name,
    resetLink,
    subject: `Reset your ${COMPANY_NAME} password`,
  };
  const fallback = {
    subject: `Reset your ${COMPANY_NAME} password`,
    body: builtinPasswordResetBody(),
  };
  return sendEmail(user.email, 'password-reset', vars, fallback);
}

export async function sendVerificationEmail(
  user: UserLike,
  verificationLink: string,
): Promise<SendResult> {
  const vars: Variables = {
    customerName: user.name,
    verificationLink,
    subject: `Verify your ${COMPANY_NAME} email`,
  };
  const fallback = {
    subject: `Verify your email for ${COMPANY_NAME}`,
    body: builtinVerificationBody(),
  };
  return sendEmail(user.email, 'email-verification', vars, fallback);
}

export function fireAndForget<T>(
  factory: () => Promise<T>,
  context: string,
): void {
  // #region debug-point H5:fireAndForget-entry
  (()=>{const fs=require('fs'),p='.dbg/verification-email-not-received.env';let u='http://127.0.0.1:7778/event',s='verification-email-not-received';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',body:JSON.stringify({sessionId:s,runId:'pre',hypothesisId:'H5',location:'emailService.ts:fireAndForget:entry',msg:'[DEBUG] H5 fireAndForget entered',data:{context},ts:Date.now()})}).catch(()=>{})})();
  // #endregion
  factory().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    // #region debug-point H5:fireAndForget-catch
    (()=>{const fsR=require('fs'),pR='.dbg/verification-email-not-received.env';let uR='http://127.0.0.1:7778/event',sR='verification-email-not-received';try{const eR=fsR.readFileSync(pR,'utf8');uR=eR.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uR;sR=eR.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sR}catch{}fetch(uR,{method:'POST',body:JSON.stringify({sessionId:sR,runId:'pre',hypothesisId:'H5',location:'emailService.ts:fireAndForget:catch',msg:'[DEBUG] H5 fireAndForget factory threw',data:{context,error:msg,errorClass:err instanceof Error?err.constructor.name:'unknown'},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    // eslint-disable-next-line no-console
    console.error(`[EMAIL::FIRE] ${context} failed: ${msg}`);
  }).then((result) => {
    // #region debug-point H5:fireAndForget-then
    (()=>{const fsR2=require('fs'),pR2='.dbg/verification-email-not-received.env';let uR2='http://127.0.0.1:7778/event',sR2='verification-email-not-received';try{const eR2=fsR2.readFileSync(pR2,'utf8');uR2=eR2.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||uR2;sR2=eR2.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sR2}catch{}fetch(uR2,{method:'POST',body:JSON.stringify({sessionId:sR2,runId:'pre',hypothesisId:'H5',location:'emailService.ts:fireAndForget:then',msg:'[DEBUG] H5 fireAndForget factory resolved',data:{context,resultType:typeof result,resultSummary:result && typeof result === 'object' ? {ok:(result as any).ok,simulate:(result as any).simulate,error:(result as any).error}:undefined},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
  });
}

export type { OrderLike, UserLike };

// Backwards-compatible async void wrappers for authController (matches legacy
// fire-and-forget shape the controller already uses for sendVerificationEmail).
export function sendVerificationEmailAsync(
  user: UserLike,
  verificationLink: string,
): void {
  // #region debug-point H2:sendVerificationEmailAsync-entry
  (()=>{const fs2=require('fs'),p2='.dbg/verification-email-not-received.env';let u2='http://127.0.0.1:7778/event',s2='verification-email-not-received';try{const e2=fs2.readFileSync(p2,'utf8');u2=e2.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u2;s2=e2.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s2}catch{}fetch(u2,{method:'POST',body:JSON.stringify({sessionId:s2,runId:'pre',hypothesisId:'H2',location:'emailService.ts:sendVerificationEmailAsync:entry',msg:'[DEBUG] H2 sendVerificationEmailAsync entered',data:{userEmail:user.email,userName:user.name,verificationLinkLen:verificationLink.length,verificationLink},ts:Date.now()})}).catch(()=>{})})();
  // #endregion
  fireAndForget(
    () => sendVerificationEmail(user, verificationLink),
    'sendVerificationEmail',
  );
}

export function sendPasswordResetAsync(
  user: UserLike,
  resetLink: string,
): void {
  fireAndForget(
    () => sendPasswordReset(user, resetLink),
    'sendPasswordReset',
  );
}

// IOrder unused import guard
export type _OrderShapeRef = IOrder;
export type _UserShapeRef = IUser;
export type _QuotationShapeRef = IQuotation;
export type _OrderItemShapeRef = IOrderItem;
export type _TemplateShapeRef = IEmailTemplate;
