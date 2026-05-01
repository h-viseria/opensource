/**
 * Icon generator for Generic PWA Wrapper
 * Creates PNG icons with a "W" for Wrapper
 * Run: node generate-icons.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ── CRC32 table ──────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(typeStr, data) {
    const type = Buffer.from(typeStr, 'ascii');
    const len  = Buffer.allocUnsafe(4);
    len.writeUInt32BE(data.length, 0);
    const crc  = Buffer.allocUnsafe(4);
    crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
    return Buffer.concat([len, type, data, crc]);
}

function generatePng(size) {
    // Background: #1a1a1a (dark)
    const BG  = { r: 26,  g: 26,  b: 26  };
    // Accent:     #00d4ff (cyan)
    const ACC = { r: 0,   g: 212, b: 255 };

    const width  = size;
    const height = size;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.44;
    const innerR = size * 0.41;

    // Build RGBA pixel array
    const pixels = new Uint8Array(width * height * 4);

    function setPixel(x, y, r, g, b, a = 255) {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        const i = (y * width + x) * 4;
        pixels[i]     = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = a;
    }

    // Fill background
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            setPixel(x, y, BG.r, BG.g, BG.b);
        }
    }

    // Draw circle border
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx, dy = y - cy;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d <= outerR && d > innerR) {
                setPixel(x, y, ACC.r, ACC.g, ACC.b);
            }
        }
    }

    // ── Draw "W" ─────────────────────────────────────────────────────────────
    const charH     = Math.round(size * 0.30);
    const charW     = Math.round(size * 0.12);
    const stroke    = Math.max(2, Math.round(size * 0.055));
    const textY     = Math.round(cy - charH / 2 + size * 0.02);
    const wLeft     = Math.round(cx - charW * 2.2);

    // Two outer vertical strokes of W
    for (let y = textY; y <= textY + charH; y++) {
        for (let x = wLeft; x < wLeft + stroke; x++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
        for (let x = wLeft + charW * 4; x <= wLeft + charW * 4 + stroke; x++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
    }

    // Two middle verticals
    for (let y = textY; y <= textY + charH; y++) {
        for (let x = wLeft + charW * 1.8; x < wLeft + charW * 1.8 + stroke; x++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
        for (let x = wLeft + charW * 2.8; x <= wLeft + charW * 2.8 + stroke; x++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
    }

    // Diagonals: down-right from left to middle
    const charMid = textY + Math.round(charH * 0.5);
    for (let y = textY; y <= charMid; y++) {
        const frac = (y - textY) / (charMid - textY);
        const x1 = wLeft + Math.round(frac * charW * 0.9);
        for (let xx = x1; xx <= x1 + stroke; xx++) setPixel(xx, y, ACC.r, ACC.g, ACC.b);
    }

    // Diagonals: down-left from middle to next middle
    for (let y = charMid; y <= textY + charH; y++) {
        const frac = (y - charMid) / (textY + charH - charMid);
        const x2 = wLeft + charW * 1.8 - Math.round(frac * charW * 0.9);
        for (let xx = x2; xx <= x2 + stroke; xx++) setPixel(xx, y, ACC.r, ACC.g, ACC.b);
    }

    // Similar diagonal for right side
    for (let y = textY; y <= charMid; y++) {
        const frac = (y - textY) / (charMid - textY);
        const x3 = wLeft + charW * 2.8 + Math.round(frac * charW * 0.9);
        for (let xx = x3; xx <= x3 + stroke; xx++) setPixel(xx, y, ACC.r, ACC.g, ACC.b);
    }

    for (let y = charMid; y <= textY + charH; y++) {
        const frac = (y - charMid) / (textY + charH - charMid);
        const x4 = wLeft + charW * 4 - Math.round(frac * charW * 0.9);
        for (let xx = x4; xx <= x4 + stroke; xx++) setPixel(xx, y, ACC.r, ACC.g, ACC.b);
    }

    // ── Encode PNG ───────────────────────────────────────────────────────────
    const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrData = Buffer.allocUnsafe(13);
    ihdrData.writeUInt32BE(width,  0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8]  = 8;
    ihdrData[9]  = 2;
    ihdrData[10] = 0;
    ihdrData[11] = 0;
    ihdrData[12] = 0;

    const rowSize   = 1 + width * 3;
    const rawPixels = Buffer.allocUnsafe(height * rowSize);
    for (let y = 0; y < height; y++) {
        rawPixels[y * rowSize] = 0;
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;
            const dstIdx = y * rowSize + 1 + x * 3;
            rawPixels[dstIdx]     = pixels[srcIdx];
            rawPixels[dstIdx + 1] = pixels[srcIdx + 1];
            rawPixels[dstIdx + 2] = pixels[srcIdx + 2];
        }
    }

    const compressed = deflateSync(rawPixels);

    return Buffer.concat([
        PNG_SIGNATURE,
        pngChunk('IHDR', ihdrData),
        pngChunk('IDAT', compressed),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

const sizes = [96, 192, 512];

for (const size of sizes) {
    const pngData = generatePng(size);
    const filePath = `./icon-${size}.png`;
    writeFileSync(filePath, pngData);
    console.log(`✓ Generated: icon-${size}.png (${pngData.length} bytes)`);

    if (size === 192 || size === 512) {
        const maskablePath = `./icon-${size}-maskable.png`;
        writeFileSync(maskablePath, pngData);
        console.log(`✓ Generated: icon-${size}-maskable.png`);
    }
}

console.log('\n✓ All icons generated successfully!');

