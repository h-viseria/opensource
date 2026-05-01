export class NavService {
    constructor(fetchImpl = fetch) {
        this.fetchImpl = fetchImpl;
    }

    async fetchLatestForSchemeCode(schemeCode) {
        const response = await this.fetchImpl(`https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`);
        if (!response.ok) {
            throw new Error(`NAV request failed for ${schemeCode}.`);
        }

        const payload = await response.json();
        const latest = Array.isArray(payload.data) && payload.data.length > 0 ? payload.data[0] : null;
        if (!latest || !latest.nav) {
            throw new Error(`NAV not found for ${schemeCode}.`);
        }

        const nav = Number(latest.nav);
        if (!Number.isFinite(nav)) {
            throw new Error(`Invalid NAV received for ${schemeCode}.`);
        }

        return {
            schemeCode,
            schemeName: payload.meta?.scheme_name || null,
            nav,
            navDate: latest.date || null,
        };
    }

    async fetchLatestForHoldings(holdings) {
        const quoteEntries = await Promise.all(
            holdings.map(async (holding) => {
                try {
                    const quote = await this.fetchLatestForSchemeCode(holding.schemeCode);
                    return [holding.schemeCode, quote];
                } catch (error) {
                    return [holding.schemeCode, { error: error.message }];
                }
            })
        );

        return Object.fromEntries(quoteEntries);
    }
}

