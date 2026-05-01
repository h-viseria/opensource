/**
 * Targeted scheme code search for Nippon, Franklin, Kotak, ABSL problem schemes.
 * Run: node ./tests/_find-codes2.mjs
 */
import { fetchAllSchemes } from '../app/infrastructure/api/mfApiClient.js';
import { normalizeSchemeNameForMatch } from '../app/application/services/schemeMatcher.js';

console.log('Fetching scheme master...');
const master = await fetchAllSchemes();

function search(term, limit = 12) {
    const keywords = term.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = master.filter(item => {
        const name = normalizeSchemeNameForMatch(item.schemeName);
        return keywords.every(k => name.includes(k));
    });
    return matches.slice(0, limit);
}

const queries = [
    // ABSL Large Cap (NOT large & mid cap)
    ['absl large cap regular growth (NOT large mid)', 'aditya birla sun life large cap fund regular growth'],
    // DSP Mid Cap Fund - the right one
    ['dsp midcap fund regular growth', 'dsp midcap fund regular growth'],
    // Axis Midcap fund
    ['axis midcap regular growth', 'axis midcap fund regular growth'],
    // Franklin large and mid cap - regular idcw
    ['franklin large mid cap idcw', 'franklin india large mid cap idcw'],
    // Kotak Bond Short Term Regular Growth
    ['kotak bond short term regular growth', 'kotak bond short term regular growth'],
    // Nippon India Growth Mid Cap Regular IDCW
    ['nippon growth mid cap regular idcw', 'nippon india growth mid cap regular idcw'],
    // Nippon India Growth Mid Cap Regular (any)
    ['nippon growth mid cap regular', 'nippon india growth mid cap regular'],
    // Nippon Banking regular
    ['nippon banking financial services regular', 'nippon india banking financial services regular'],
    // Nippon Pharma regular
    ['nippon pharma regular', 'nippon india pharma regular'],
    // Nippon Vision regular idcw
    ['nippon vision regular idcw', 'nippon india vision regular idcw'],
    // Nippon Vision regular
    ['nippon vision large mid cap regular', 'nippon india vision large mid cap regular'],
    // Kotak bond short term growth
    ['kotak bond short term growth', 'kotak bond short term growth'],
];

for (const [label, term] of queries) {
    const results = search(term);
    console.log(`\n[${label}]`);
    if (results.length) {
        results.forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));
    } else {
        console.log('  (none)');
    }
}

// Also list all Nippon Growth Mid Cap Fund entries
console.log('\n[ALL Nippon India Growth Mid Cap Fund entries]');
master.filter(m => normalizeSchemeNameForMatch(m.schemeName).includes('nippon india growth mid cap')).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));

// All Nippon Banking entries
console.log('\n[ALL Nippon India Banking entries]');
master.filter(m => normalizeSchemeNameForMatch(m.schemeName).includes('nippon india banking')).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));

// All Nippon Pharma entries
console.log('\n[ALL Nippon India Pharma entries]');
master.filter(m => normalizeSchemeNameForMatch(m.schemeName).includes('nippon india pharma')).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));

// All Nippon Vision entries
console.log('\n[ALL Nippon India Vision entries]');
master.filter(m => normalizeSchemeNameForMatch(m.schemeName).includes('nippon india vision')).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));

// All ABSL Large Cap entries (excluding large & mid cap)
console.log('\n[ALL ABSL Large Cap entries]');
master.filter(m => normalizeSchemeNameForMatch(m.schemeName).includes('aditya birla sun life large cap')).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));

// All Franklin Large and Mid Cap entries
console.log('\n[ALL Franklin Large and Mid Cap entries]');
master.filter(m => {
    const n = normalizeSchemeNameForMatch(m.schemeName);
    return n.includes('franklin india large') && n.includes('mid cap');
}).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));

// All Kotak Bond Short Term entries
console.log('\n[ALL Kotak Bond Short Term entries]');
master.filter(m => normalizeSchemeNameForMatch(m.schemeName).includes('kotak bond short term')).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));

