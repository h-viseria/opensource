/**
 * Generates PNG icon files for the MF Holdings Lite PWA.
 * Creates 96x96, 192x192, and 512x512 PNG icons using pure Node.js (no dependencies).
 * Run: node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    // Background: #162238 (dark navy)
    const BG  = { r: 22,  g: 34,  b: 56  };
    // Accent:     #45a6ff (bright blue)
    const ACC = { r: 69,  g: 166, b: 255 };
    // Circle border slightly lighter
    const CIR = { r: 45,  g: 100, b: 180 };

    const width  = size;
    const height = size;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.44;   // outer circle border radius
    const innerR = size * 0.41;   // inner circle fill radius (dark)

    // For the "MF" letters we'll draw simple pixel rectangles
    const charH     = Math.round(size * 0.30);   // char height
    const charW     = Math.round(size * 0.14);   // stroke width for M/F
    const stroke    = Math.max(2, Math.round(size * 0.055));  // line thickness
    const textY     = Math.round(cy - charH / 2 + size * 0.02);
    const textLeft  = Math.round(cx - charW * 1.6);
    const textRight = Math.round(cx + stroke * 0.5);

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

    // Draw outer circle (border ring)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx, dy = y - cy;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d <= outerR && d > innerR) {
                setPixel(x, y, CIR.r, CIR.g, CIR.b);
            }
        }
    }

    // ── Draw "M" ─────────────────────────────────────────────────────────────
    // Two outer strokes + two diagonal strokes (simplified as rectangles)
    const mLeft  = textLeft;
    const mRight = textLeft + charW * 2;
    const mTop   = textY;
    const mBot   = textY + charH;
    const mMid   = textY + Math.round(charH * 0.45);

    // Left vertical bar of M
    for (let y = mTop; y <= mBot; y++) {
        for (let x = mLeft; x < mLeft + stroke; x++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
    }
    // Right vertical bar of M
    for (let y = mTop; y <= mBot; y++) {
        for (let x = mRight - stroke; x <= mRight; x++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
    }
    // Left diagonal (going down-right from top-left to midpoint)
    const mCenterX = mLeft + Math.round(charW);
    for (let y = mTop; y <= mMid; y++) {
        const frac = (y - mTop) / (mMid - mTop);
        const xStart = mLeft + Math.round(frac * (mCenterX - mLeft));
        for (let xx = xStart; xx <= xStart + stroke; xx++) setPixel(xx, y, ACC.r, ACC.g, ACC.b);
    }
    // Right diagonal (going down-left from top-right to midpoint)
    for (let y = mTop; y <= mMid; y++) {
        const frac = (y - mTop) / (mMid - mTop);
        const xEnd = mRight - Math.round(frac * (mRight - mCenterX));
        for (let xx = xEnd - stroke; xx <= xEnd; xx++) setPixel(xx, y, ACC.r, ACC.g, ACC.b);
    }

    // ── Draw "F" ─────────────────────────────────────────────────────────────
    const fLeft  = textRight;
    const fRight = textRight + charW * 1.5;
    const fMid   = textY + Math.round(charH * 0.48);

    // Left vertical bar of F
    for (let y = textY; y <= textY + charH; y++) {
        for (let x = fLeft; x < fLeft + stroke; x++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
    }
    // Top horizontal bar of F
    for (let x = fLeft; x <= fRight; x++) {
        for (let y = textY; y < textY + stroke; y++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
    }
    // Middle horizontal bar of F
    for (let x = fLeft; x <= Math.round(fLeft + (fRight - fLeft) * 0.8); x++) {
        for (let y = fMid; y < fMid + stroke; y++) setPixel(x, y, ACC.r, ACC.g, ACC.b);
    }

    // ── Encode PNG ───────────────────────────────────────────────────────────
    const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR
    const ihdrData = Buffer.allocUnsafe(13);
    ihdrData.writeUInt32BE(width,  0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8]  = 8;   // bit depth
    ihdrData[9]  = 2;   // color type: RGB (no alpha for solid backgrounds)
    ihdrData[10] = 0;   // compression method
    ihdrData[11] = 0;   // filter method
    ihdrData[12] = 0;   // interlace method

    // Build raw image rows (filter byte 0 = None, then RGB triplets)
    const rowSize   = 1 + width * 3;
    const rawPixels = Buffer.allocUnsafe(height * rowSize);
    for (let y = 0; y < height; y++) {
        rawPixels[y * rowSize] = 0; // filter type None
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;
            const dstIdx = y * rowSize + 1 + x * 3;
            rawPixels[dstIdx]     = pixels[srcIdx];     // R
            rawPixels[dstIdx + 1] = pixels[srcIdx + 1]; // G
            rawPixels[dstIdx + 2] = pixels[srcIdx + 2]; // B
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
    const filePath = path.join(rootDir, `icon-${size}.png`);
    writeFileSync(filePath, pngData);
    console.log(`✓ Generated: icon-${size}.png (${pngData.length} bytes)`);

    // Also write maskable version (same content — Android masks it anyway)
    if (size === 192 || size === 512) {
        const maskablePath = path.join(rootDir, `icon-${size}-maskable.png`);
        writeFileSync(maskablePath, pngData);
        console.log(`✓ Generated: icon-${size}-maskable.png`);
    }
}

console.log('\nAll icons generated successfully!');
console.log('Icons are located in the project root: icon-96.png, icon-192.png, icon-192-maskable.png, icon-512.png, icon-512-maskable.png');

