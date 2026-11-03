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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
        response = await fetch(`${MFAPI_BASE_URL}/mf/${encodeURIComponent(schemeCode)}`, {
            cache: 'no-store',
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`NAV fetch timed out for scheme code ${schemeCode}.`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`Failed NAV fetch for scheme code ${schemeCode} (HTTP ${response.status}).`);
    }

    const payload = await response.json();
    if (payload.status && payload.status !== 'SUCCESS') {
        throw new Error(`MFAPI status ${payload.status} for scheme code ${schemeCode}.`);
    }
    if (!Array.isArray(payload.data)) {
        throw new Error(`Invalid NAV history for scheme code ${schemeCode}.`);
    }

    return {
        schemeName: payload.meta?.scheme_name || null,
        data: payload.data,
    };
}

