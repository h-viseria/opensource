/**
 * Default tax codes seeded per book (spec §11).
 */

/** @type {{ name: string, code: string, taxType: string, component: string, rate: number, ledgerName: string }[]} */
export const DEFAULT_TAX_CODES = [
  {
    name: 'GST 18% Output',
    code: 'GST18-OUT',
    taxType: 'GST',
    component: 'Output',
    rate: 18,
    ledgerName: 'Output Tax',
  },
  {
    name: 'GST 18% Input',
    code: 'GST18-IN',
    taxType: 'GST',
    component: 'Input',
    rate: 18,
    ledgerName: 'Input Tax',
  },
  {
    name: 'GST 5% Output',
    code: 'GST5-OUT',
    taxType: 'GST',
    component: 'Output',
    rate: 5,
    ledgerName: 'Output Tax',
  },
  {
    name: 'GST 5% Input',
    code: 'GST5-IN',
    taxType: 'GST',
    component: 'Input',
    rate: 5,
    ledgerName: 'Input Tax',
  },
  {
    name: 'VAT 5% Output',
    code: 'VAT5-OUT',
    taxType: 'VAT',
    component: 'Output',
    rate: 5,
    ledgerName: 'Output Tax',
  },
  {
    name: 'VAT 5% Input',
    code: 'VAT5-IN',
    taxType: 'VAT',
    component: 'Input',
    rate: 5,
    ledgerName: 'Input Tax',
  },
  {
    name: 'Sales Tax 10% Output',
    code: 'ST10-OUT',
    taxType: 'Sales Tax',
    component: 'Output',
    rate: 10,
    ledgerName: 'Output Tax',
  },
];
