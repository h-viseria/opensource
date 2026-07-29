/**
 * Smoke test for bank transaction table extraction.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBankTxnTable } from './extract.js';

describe('extractBankTxnTable', () => {
  it('parses HDFC-style debit/credit rows and merges wrapped narration', () => {
    const sample = `Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance
02/04/26 IB SS FUNDS TRANSFER DR-55000004308194 NB3N7XZBIRFLZA71 02/04/26 100,000.00 715,793.18
02/04/26 ACH C- NHAI SR 22-NHSR22006881 0000002107628569 02/04/26 25,000.00 740,793.18
03/04/26 UPI-INDIAN RAILWAY
CATER-INDIANRAILWAYCA
0000609317602335 03/04/26 1,063.60 739,729.58
15/04/26 ACH C- IRFC LIMITED-TAX FRE-1704729 0000002167335375 15/04/26 8,650.00 714,449.78
20/04/26 NEFT CR-HSBC0560002-HSBC BANK PLC-SOMEONE HSBCN11038951727 20/04/26 25,136.87 739,586.65
Page No .: 1 Statement of account
Account No : 50100032681335 Imperia
`;
    const table = extractBankTxnTable(sample);
    assert.ok(table);
    assert.equal(table.headers.length, 7);
    assert.ok(table.rows.length >= 5);

    const debit = table.rows.find((r) => r[2] === 'NB3N7XZBIRFLZA71');
    assert.ok(debit);
    assert.equal(debit[4], '100,000.00'); // withdrawal
    assert.equal(debit[5], ''); // deposit
    assert.equal(debit[6], '715,793.18');

    const credit = table.rows.find((r) => r[2] === 'HSBCN11038951727');
    assert.ok(credit);
    assert.equal(credit[4], '');
    assert.equal(credit[5], '25,136.87');
  });
});
