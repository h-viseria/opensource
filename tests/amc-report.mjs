import { buildAmcDistributionRows, buildAmcSummaryRows, filterAmcSummaryRows } from '../app/application/services/amcReportService.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const schemeRows = [
    { amcName: 'AMC A', investedValue: 100, currentValue: 120 },
    { amcName: 'AMC A', investedValue: 50, currentValue: 55 },
    { amcName: 'AMC B', investedValue: 200, currentValue: 180 },
];

const summary = buildAmcSummaryRows(schemeRows);
const amcA = summary.find((item) => item.amcName === 'AMC A');
const amcB = summary.find((item) => item.amcName === 'AMC B');

assert(summary.length === 2, `Expected 2 AMC rows, got ${summary.length}`);
assert(amcA.investedValue === 150, `AMC A invested mismatch: ${amcA.investedValue}`);
assert(amcA.currentValue === 175, `AMC A current mismatch: ${amcA.currentValue}`);
assert(amcA.returnsValue === 25, `AMC A returns mismatch: ${amcA.returnsValue}`);
assert(amcA.schemeCount === 2, `AMC A scheme count mismatch: ${amcA.schemeCount}`);
assert(amcB.returnsValue === -20, `AMC B returns mismatch: ${amcB.returnsValue}`);

const gainOnly = filterAmcSummaryRows(summary, { query: '', returnMode: 'gain', topN: 0 });
assert(gainOnly.length === 1 && gainOnly[0].amcName === 'AMC A', 'Gain filter mismatch');

const queryOnly = filterAmcSummaryRows(summary, { query: 'amc b', returnMode: 'all', topN: 0 });
assert(queryOnly.length === 1 && queryOnly[0].amcName === 'AMC B', 'Query filter mismatch');

const distribution = buildAmcDistributionRows(summary);
const distA = distribution.find((item) => item.amcName === 'AMC A');
const distB = distribution.find((item) => item.amcName === 'AMC B');
assert(Math.round(distA.investedSharePct) === 43, `AMC A invested share mismatch: ${distA.investedSharePct}`);
assert(Math.round(distB.investedSharePct) === 57, `AMC B invested share mismatch: ${distB.investedSharePct}`);
assert(distA.returnsPctShare > 0 && distB.returnsPctShare > 0, 'Returns pct share should be computed for both AMCs');

console.log('AMC report regression passed.');

