/**
 * Built-in sample invoice Word templates for a small single-shop business.
 */

import { zipStore } from '../utils/zip.js';

/**
 * @param {'Sales'|'Purchase'} invoiceType
 * @returns {{ bytes: ArrayBuffer, fileName: string, mime: string, name: string, appliesTo: string }}
 */
export function buildSampleInvoiceDocx(invoiceType) {
  const isSales = invoiceType === 'Sales';
  const title = isSales ? 'TAX INVOICE' : 'PURCHASE INVOICE';
  const partyLabel = isSales ? 'Bill to (Customer)' : 'Supplier';
  const thanks = isSales
    ? 'Thank you for your purchase. Please settle any outstanding amount as agreed.'
    : 'Goods received against this purchase. Please verify quantities and rates.';
  const fileName = isSales
    ? 'sample-sales-invoice-template.docx'
    : 'sample-purchase-invoice-template.docx';

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${p(title, { bold: true, size: 32, center: true })}
    ${p('{{book_name}}', { bold: true, size: 24, center: true })}
    ${p('Small shop invoice · {{currency}}', { size: 18, center: true, color: '666666' })}
    ${spacer()}
    ${p('Invoice no.  {{invoice_number}}', { bold: true })}
    ${p('Date  {{invoice_date}}')}
    ${p('Type  {{invoice_type}}')}
    ${p('Warehouse  {{warehouse_name}}')}
    ${spacer()}
    ${p(partyLabel, { bold: true, size: 20 })}
    ${p('{{party_name}}', { size: 22 })}
    ${spacer()}
    ${p('Items', { bold: true, size: 20 })}
    ${p('No. | Item | Qty | Rate | Amount | Tax | Line total', { bold: true, size: 16 })}
    ${p('{{#lines}}')}
    ${p('{{line_no}} | {{item_name}} {{item_code}} | {{qty}} {{unit}} | {{rate}} | {{amount}} | {{tax_rate}} {{tax_amount}} | {{line_total}}', { size: 16 })}
    ${p('{{/lines}}')}
    ${spacer()}
    ${p('Subtotal    {{subtotal}}', { bold: true })}
    ${p('Tax         {{tax_total}}', { bold: true })}
    ${p('Grand total {{grand_total}}', { bold: true, size: 24 })}
    ${spacer()}
    ${p('Notes', { bold: true, size: 18 })}
    ${p('{{narration}}')}
    ${spacer()}
    ${p(thanks, { size: 16, color: '555555' })}
    ${p('Generated with PicoERP · Line count: {{line_count}}', { size: 14, color: '888888' })}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const enc = new TextEncoder();
  const files = new Map([
    ['[Content_Types].xml', enc.encode(contentTypes)],
    ['_rels/.rels', enc.encode(rels)],
    ['word/document.xml', enc.encode(documentXml)],
    ['word/_rels/document.xml.rels', enc.encode(docRels)],
  ]);

  return {
    bytes: zipStore(files),
    fileName,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: isSales ? 'Sample sales invoice (shop)' : 'Sample purchase invoice (shop)',
    appliesTo: invoiceType,
  };
}

/**
 * @param {string} text
 * @param {{ bold?: boolean, size?: number, center?: boolean, color?: string }} [opts]
 */
function p(text, opts = {}) {
  const size = opts.size || 20;
  const bold = opts.bold ? '<w:b/>' : '';
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : '';
  const align = opts.center ? '<w:jc w:val="center"/>' : '';
  return `<w:p>
    <w:pPr>${align}<w:spacing w:after="80"/></w:pPr>
    <w:r>
      <w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${color}</w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function spacer() {
  return `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t></w:t></w:r></w:p>`;
}

/** @param {string} s */
function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
