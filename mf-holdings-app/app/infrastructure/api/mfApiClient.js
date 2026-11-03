const MFAPI_BASE_URL = 'https://api.mfapi.in';

function withCacheBust(url) {
    const parsed = new URL(url);
    parsed.searchParams.set('_ts', String(Date.now()));
    return parsed.toString();
}

async function fetchMfApi(path, { timeoutMs = 20000 } = {}) {
    const url = withCacheBust(`${MFAPI_BASE_URL}${path}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`MFAPI request timed out for ${path}.`);
        }
        throw new Error(`Browser blocked MFAPI for ${path} (CORS/network). Opening the URL in a tab can still work.`);
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`Failed MFAPI request for ${path} (HTTP ${response.status}).`);
    }

    return response.json();
}

export async function fetchAllSchemes() {
    const payload = await fetchMfApi('/mf');
    if (!Array.isArray(payload)) {
        throw new Error('Unexpected scheme master response from MFAPI.');
    }

    return payload;
}

export async function fetchSchemeHistory(schemeCode) {
    const payload = await fetchMfApi(`/mf/${encodeURIComponent(schemeCode)}`);
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
