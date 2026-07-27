/**
 * Minimal ZIP read/write for DOCX/ODT template fill (STORE or DEFLATE entries).
 * Write path uses STORE only (no compression) which Word/LibreOffice accept.
 */

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('Not a valid ZIP file');

  const entryCount = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const nameBytes = bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);

    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compressed.slice();
    } else if (method === 8) {
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }
    files.set(name, data);
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/**
 * Build an uncompressed ZIP from a map of path → bytes.
 * @param {Map<string, Uint8Array>|Record<string, Uint8Array>} files
 * @returns {ArrayBuffer}
 */
export function zipStore(files) {
  return buildZip(files, false);
}

/**
 * Build a DEFLATE-compressed ZIP (falls back to STORE if CompressionStream missing).
 * @param {Map<string, Uint8Array>|Record<string, Uint8Array>} files
 * @returns {Promise<ArrayBuffer>}
 */
export async function zipDeflate(files) {
  return buildZip(files, true);
}

/**
 * @param {Map<string, Uint8Array>|Record<string, Uint8Array>} files
 * @param {boolean} preferDeflate
 * @returns {Promise<ArrayBuffer>|ArrayBuffer}
 */
function buildZip(files, preferDeflate) {
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files);

  if (!preferDeflate) {
    return assembleZip(entries.map(([name, data]) => ({ name, data, method: 0, compressed: data })));
  }

  return (async () => {
    /** @type {{ name: string, data: Uint8Array, method: number, compressed: Uint8Array }[]} */
    const prepared = [];
    for (const [name, data] of entries) {
      let method = 0;
      let compressed = data;
      try {
        compressed = await deflateRaw(data);
        method = 8;
        // Prefer STORE if deflate did not shrink
        if (compressed.length >= data.length) {
          method = 0;
          compressed = data;
        }
      } catch {
        method = 0;
        compressed = data;
      }
      prepared.push({ name, data, method, compressed });
    }
    return assembleZip(prepared);
  })();
}

/**
 * @param {{ name: string, data: Uint8Array, method: number, compressed: Uint8Array }[]} entries
 * @returns {ArrayBuffer}
 */
function assembleZip(entries) {
  /** @type {Uint8Array[]} */
  const parts = [];
  /** @type {{ name: string, offset: number, size: number, compSize: number, method: number, crc: number }[]} */
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, entry.method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.compressed.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local, entry.compressed);
    centrals.push({
      name: entry.name,
      offset,
      size: entry.data.length,
      compSize: entry.compressed.length,
      method: entry.method,
      crc,
    });
    offset += local.length + entry.compressed.length;
  }

  /** @type {Uint8Array[]} */
  const cdParts = [];
  let cdSize = 0;
  for (const c of centrals) {
    const nameBytes = new TextEncoder().encode(c.name);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, c.method, true);
    cv.setUint32(16, c.crc, true);
    cv.setUint32(20, c.compSize, true);
    cv.setUint32(24, c.size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, c.offset, true);
    cd.set(nameBytes, 46);
    cdParts.push(cd);
    cdSize += cd.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  for (const p of cdParts) {
    out.set(p, pos);
    pos += p.length;
  }
  out.set(eocd, pos);
  return out.buffer;
}

/**
 * @param {Uint8Array} data
 */
async function deflateRaw(data) {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream unavailable');
  }
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * @param {Uint8Array} bytes
 */
function findEndOfCentralDirectory(bytes) {
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * @param {Uint8Array} data
 */
async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read compressed ZIP entries (DecompressionStream missing)');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/**
 * @param {Uint8Array} buf
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
