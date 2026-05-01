/**
 * Search MFAPI for correct scheme codes for mismatched schemes.
 * Run: node ./tests/_find-codes.mjs
 */
import { fetchAllSchemes } from '../app/infrastructure/api/mfApiClient.js';
import { normalizeSchemeNameForMatch } from '../app/application/services/schemeMatcher.js';

const searchTerms = [
    'aditya birla sun life large cap fund regular',
    'dsp mid cap fund regular',
    'axis mid cap fund regular',
    'franklin india large mid cap regular idcw',
    'kotak bond short term regular',
    'nippon india growth mid cap fund regular idcw',
    'nippon india banking financial services regular growth',
    'nippon india pharma fund regular growth',
    'nippon india vision large mid cap regular idcw',
    'nippon india banking financial direct',
];

console.log('Fetching scheme master...');
const master = await fetchAllSchemes();

for (const term of searchTerms) {
    const keywords = term.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = master.filter(item => {
        const name = normalizeSchemeNameForMatch(item.schemeName);
        return keywords.every(k => name.includes(k));
    });
    console.log(`\n--- Search: "${term}" ---`);
    if (!matches.length) {
        // try partial: all but last keyword
        const partial = master.filter(item => {
            const name = normalizeSchemeNameForMatch(item.schemeName);
            return keywords.slice(0,-1).every(k => name.includes(k));
        });
        partial.slice(0,8).forEach(m => console.log(`  [partial] ${m.schemeCode}  ${m.schemeName}`));
    } else {
        matches.slice(0,8).forEach(m => console.log(`  ${m.schemeCode}  ${m.schemeName}`));
    }
}

