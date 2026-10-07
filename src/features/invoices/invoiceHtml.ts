import type { Invoice } from '@/services/invoice.service';
import {
  formatInvoiceAmount,
  formatInvoiceDate,
  formatPhoneNumber,
} from '@/features/invoices/invoiceFormat';

// A4 at 72 PPI, the unit expo-print's width/height options use.
export const INVOICE_PAGE = { width: 595, height: 842 } as const;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// The customer's name is free text they typed, and it lands in markup here.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function getInvoiceCustomerName(invoice: Invoice): string {
  return invoice.customer.name ?? `${invoice.appName} User`;
}

const STYLES = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 48px 44px;
    font-family: 'Noto Sans', Roboto, -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10px;
    line-height: 1.55;
    color: #111111;
  }
  .muted { color: #555555; }
  .row { display: flex; justify-content: space-between; }
  .brand { display: flex; align-items: center; font-size: 17px; font-weight: 700; }
  .logo {
    width: 22px; height: 22px; margin-right: 8px; border-radius: 5px;
    background: #F28C1E; color: #ffffff; font-size: 12px; font-weight: 700;
    text-align: center; line-height: 22px;
  }
  .legal-name { margin: 10px 0 4px; font-size: 12.5px; font-weight: 700; }
  .summary { text-align: right; }
  .doc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.4px; color: #333333; }
  .pill {
    display: inline-block; margin: 6px 0 4px; padding: 3px 20px; border-radius: 6px;
    border: 1px solid #CFE6D6; background: #E6F4EA; color: #1E7B3A;
    font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
  }
  .amount { margin-bottom: 6px; font-size: 22px; font-weight: 700; }
  hr { margin: 18px 0 14px; border: 0; border-top: 1px solid #BBBBBB; }
  .boxes { display: flex; }
  .box { flex: 1; padding: 12px 14px 14px; border: 1px solid #CCCCCC; border-radius: 8px; }
  .box + .box { margin-left: 12px; }
  .label { font-size: 8.5px; font-weight: 700; letter-spacing: 0.5px; color: #666666; }
  .box-title { margin: 6px 0 4px; font-size: 15px; font-weight: 700; word-break: break-word; }
  .box-line { font-size: 10.5px; color: #333333; }
  table { width: 100%; margin-top: 16px; border-collapse: collapse; }
  th {
    padding-bottom: 6px; border-bottom: 2px solid #111111; text-align: left;
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.5px; color: #666666;
  }
  td { padding: 10px 0 12px; border-bottom: 1px solid #BBBBBB; vertical-align: top; font-weight: 700; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  th.qty, td.qty { width: 50px; }
  th.money, td.money { width: 80px; }
  .item-title { font-size: 11.5px; }
  .item-line { font-weight: 400; color: #555555; word-break: break-all; }
  .totals { width: 62%; margin: 18px 0 0 auto; }
  .totals .row { padding: 5px 0; font-size: 11.5px; }
  .totals .grand {
    margin-top: 4px; padding: 9px 10px; border-radius: 6px;
    background: #111111; color: #ffffff; font-weight: 700;
  }
  .ref { margin-top: 22px; padding-bottom: 5px; border-bottom: 1px solid #999999; font-size: 8.5px; color: #333333; word-break: break-all; }
  .footer { margin-top: 12px; font-size: 7.5px; color: #777777; }
`;

/** The printable tax invoice, as a self-contained HTML document for expo-print. */
export function buildInvoiceHtml(invoice: Invoice): string {
  const { seller } = invoice;
  const amount = formatInvoiceAmount(invoice.amount);
  const paidOn = formatInvoiceDate(invoice.paidAt);
  const gstRate = `${invoice.halfGstRatePercent}%`;

  const itemLines = [
    invoice.subscriptionId
      ? `Razorpay Subscription ID: ${escapeHtml(invoice.subscriptionId)}`
      : null,
    `Payment ID: ${escapeHtml(invoice.paymentId)}`,
    `Period ${formatInvoiceDate(invoice.periodStart)} &ndash; ${formatInvoiceDate(invoice.periodEnd)}`,
    `SAC ${invoice.sac.code} &middot; ${escapeHtml(invoice.sac.description)}`,
  ].filter((line) => line !== null);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(invoice.invoiceNumber)}</title>
<style>${STYLES}</style>
</head>
<body>
  <div class="row">
    <div>
      <div class="brand"><span class="logo">${escapeHtml(seller.brandName.charAt(0))}</span>${escapeHtml(seller.brandName)}</div>
      <div class="legal-name">${escapeHtml(seller.legalName)}</div>
      ${seller.addressLines.map((line) => `<div class="muted">${escapeHtml(line)}</div>`).join('\n      ')}
      <div class="muted">GSTIN ${escapeHtml(seller.gstin)} &middot; State ${escapeHtml(seller.state)} (${escapeHtml(seller.stateCode)}) &middot; ${escapeHtml(seller.supportEmail)}</div>
    </div>
    <div class="summary">
      <div class="doc-title">TAX INVOICE</div>
      <div class="pill">PAID</div>
      <div class="amount">${amount}</div>
      <div class="muted">Invoice no. ${escapeHtml(invoice.invoiceNumber)}</div>
      <div class="muted">Invoice date ${paidOn}</div>
    </div>
  </div>

  <hr />

  <div class="boxes">
    <div class="box">
      <div class="label">BILLED TO</div>
      <div class="box-title">${escapeHtml(getInvoiceCustomerName(invoice))}</div>
      <div class="box-line">${escapeHtml(formatPhoneNumber(invoice.customer.phoneNumber))}</div>
    </div>
    <div class="box">
      <div class="label">SERVICE</div>
      <div class="box-title">${escapeHtml(invoice.appName)}</div>
      <div class="box-line">${escapeHtml(invoice.description)}</div>
      <div class="box-line">Delivered digitally in the app</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>DESCRIPTION</th>
        <th class="num qty">QTY</th>
        <th class="num money">RATE</th>
        <th class="num money">AMOUNT</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="item-title">${escapeHtml(invoice.description)}</div>
          ${itemLines.map((line) => `<div class="item-line">${line}</div>`).join('\n          ')}
        </td>
        <td class="num qty">1</td>
        <td class="num money">${amount}</td>
        <td class="num money">${amount}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Taxable value</span><span>${formatInvoiceAmount(invoice.taxableValue)}</span></div>
    <div class="row"><span>CGST @ ${gstRate}</span><span>${formatInvoiceAmount(invoice.cgst)}</span></div>
    <div class="row"><span>SGST @ ${gstRate}</span><span>${formatInvoiceAmount(invoice.sgst)}</span></div>
    <div class="row grand"><span>Total paid</span><span>${amount}</span></div>
  </div>

  <div class="ref">Ref ${escapeHtml(invoice.paymentId)} &middot; razorpay &middot; ${paidOn} &middot; This is a computer-generated invoice.</div>
  <div class="row footer">
    <span>${escapeHtml(seller.legalName)} . ${escapeHtml(seller.gstin)}</span>
    <span>${escapeHtml(invoice.invoiceNumber)}</span>
  </div>
</body>
</html>`;
}
