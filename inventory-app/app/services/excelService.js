function ensureXlsx() {
    if (!window.XLSX) {
        throw new Error('SheetJS (XLSX) is not loaded.');
    }
}

export async function importExcelRows(file) {
    ensureXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return [];
    const worksheet = workbook.Sheets[firstSheet];
    return window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });
}

export function exportRowsToExcel(rows, sheetName, fileName) {
    ensureXlsx();
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.json_to_sheet(rows || []);
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    window.XLSX.writeFile(wb, fileName);
}

export function exportStoresToExcel(storeRowsMap, fileName = 'inventory-export.xlsx') {
    ensureXlsx();
    const wb = window.XLSX.utils.book_new();
    Object.entries(storeRowsMap).forEach(([sheetName, rows]) => {
        const ws = window.XLSX.utils.json_to_sheet(rows || []);
        window.XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    });
    window.XLSX.writeFile(wb, fileName);
}

