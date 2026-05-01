export function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function nowIso() {
    return new Date().toISOString();
}

export function paginate(items, page = 1, pageSize = 10) {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.max(1, Number(pageSize) || 10);
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const start = (safePage - 1) * safePageSize;
    return {
        items: items.slice(start, start + safePageSize),
        page: Math.min(safePage, totalPages),
        pageSize: safePageSize,
        total,
        totalPages,
    };
}

export function withRetry(taskFn, retries = 2, delayMs = 120) {
    return new Promise(async (resolve, reject) => {
        let lastError;
        for (let i = 0; i <= retries; i += 1) {
            try {
                const result = await taskFn();
                resolve(result);
                return;
            } catch (error) {
                lastError = error;
                if (i < retries) {
                    await wait(delayMs * (i + 1));
                }
            }
        }
        reject(lastError);
    });
}

export function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeText(value) {
    return String(value || '').trim();
}

export function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function generateId(prefix, existingIds = []) {
    const used = new Set(existingIds.map((id) => String(id || '').toUpperCase()));
    let counter = 1;
    while (counter < 1000000) {
        const candidate = `${prefix}${String(counter).padStart(3, '0')}`;
        if (!used.has(candidate)) {
            return candidate;
        }
        counter += 1;
    }
    throw new Error(`Failed to generate ID for ${prefix}.`);
}

