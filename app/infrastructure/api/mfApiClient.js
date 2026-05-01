const MFAPI_BASE_URL = 'https://api.mfapi.in';

export async function fetchAllSchemes() {
    const response = await fetch(`${MFAPI_BASE_URL}/mf`);
    if (!response.ok) {
        throw new Error('Failed to load scheme master from MFAPI.');
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
        throw new Error('Unexpected scheme master response from MFAPI.');
    }

    return payload;
}

export async function fetchSchemeHistory(schemeCode) {
    const response = await fetch(`${MFAPI_BASE_URL}/mf/${encodeURIComponent(schemeCode)}`);
    if (!response.ok) {
        throw new Error(`Failed NAV fetch for scheme code ${schemeCode}.`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload.data)) {
        throw new Error(`Invalid NAV history for scheme code ${schemeCode}.`);
    }

    return {
        schemeName: payload.meta?.scheme_name || null,
        data: payload.data,
    };
}

