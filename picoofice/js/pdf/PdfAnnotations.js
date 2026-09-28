import {
  PDFArray, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString,
  StandardFonts, rgb,
} from '../../vendor/pdf-lib.esm.min.js';

function colorArray(context, color = '#c45c26') {
  const value = color.replace('#', '');
  const channels = value.length === 3
    ? value.split('').map((c) => parseInt(c + c, 16) / 255)
    : [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  return context.obj(channels);
}

function ensureAnnots(pdf, page) {
  let annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
  if (!annots) {
    annots = pdf.context.obj([]);
    page.node.set(PDFName.of('Annots'), annots);
  }
  return annots;
}

function rectFor(page, mark) {
  const { width, height } = page.getSize();
  const x1 = mark.x * width;
  const x2 = (mark.x + mark.width) * width;
  const y1 = height - (mark.y + mark.height) * height;
  const y2 = height - mark.y * height;
  return [x1, y1, x2, y2];
}

export async function applyAnnotations(bytes, marks) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const mark of marks) {
    const page = pdf.getPage(mark.page - 1);
    if (!page) continue;
    const rect = rectFor(page, mark);
    const annots = ensureAnnots(pdf, page);
    const base = {
      Type: PDFName.of('Annot'),
      Rect: pdf.context.obj(rect),
      C: colorArray(pdf.context, mark.color),
      F: PDFNumber.of(4),
      NM: PDFString.of(mark.id || crypto.randomUUID()),
      M: PDFString.of(new Date().toISOString()),
      Contents: PDFHexString.fromText(mark.text || ''),
    };
    let annotation;
    if (['highlight', 'underline', 'strikeout'].includes(mark.type)) {
      const [x1, y1, x2, y2] = rect;
      annotation = pdf.context.obj({
        ...base,
        Subtype: PDFName.of(mark.type === 'highlight' ? 'Highlight' : mark.type === 'underline' ? 'Underline' : 'StrikeOut'),
        QuadPoints: pdf.context.obj([x1, y2, x2, y2, x1, y1, x2, y1]),
        CA: PDFNumber.of(mark.opacity ?? 0.45),
      });
    } else if (mark.type === 'note') {
      annotation = pdf.context.obj({ ...base, Subtype: PDFName.of('Text'), Name: PDFName.of('Note'), Open: false });
    } else if (mark.type === 'freeText') {
      annotation = pdf.context.obj({
        ...base, Subtype: PDFName.of('FreeText'),
        DA: PDFString.of('/Helv 12 Tf 0 0 0 rg'),
        Q: PDFNumber.of(0),
      });
    } else if (mark.type === 'ink') {
      const { width, height } = page.getSize();
      const inkPoints = (mark.points?.length ? mark.points : [
        { x: mark.x, y: mark.y },
        { x: mark.x + mark.width, y: mark.y + mark.height },
      ]).flatMap((point) => [point.x * width, height - point.y * height]);
      annotation = pdf.context.obj({
        ...base, Subtype: PDFName.of('Ink'),
        InkList: pdf.context.obj([inkPoints]),
        BS: pdf.context.obj({ W: mark.widthPx || 2 }),
      });
    } else if (mark.type === 'circle') {
      annotation = pdf.context.obj({ ...base, Subtype: PDFName.of('Circle'), BS: pdf.context.obj({ W: mark.widthPx || 2 }) });
    } else if (mark.type === 'line' || mark.type === 'arrow') {
      const [x1, y1, x2, y2] = rect;
      annotation = pdf.context.obj({
        ...base, Subtype: PDFName.of('Line'), L: pdf.context.obj([x1, y2, x2, y1]),
        LE: pdf.context.obj([PDFName.of('None'), PDFName.of(mark.type === 'arrow' ? 'ClosedArrow' : 'None')]),
        BS: pdf.context.obj({ W: mark.widthPx || 2 }),
      });
    } else {
      annotation = pdf.context.obj({ ...base, Subtype: PDFName.of('Square'), BS: pdf.context.obj({ W: mark.widthPx || 2 }) });
    }
    annots.push(pdf.context.register(annotation));
  }
  return pdf.save({ useObjectStreams: true });
}

export async function placeSignature(bytes, signature) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = pdf.getPage(signature.page - 1);
  const { width, height } = page.getSize();
  const x = signature.x * width;
  const y = height - (signature.y + signature.height) * height;
  const drawWidth = signature.width * width;
  const drawHeight = signature.height * height;
  if (signature.dataUrl) {
    const pngBytes = Uint8Array.from(atob(signature.dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const image = await pdf.embedPng(pngBytes);
    page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
  } else {
    const font = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    page.drawText(signature.text || 'Signature', { x, y: y + drawHeight * 0.25, size: Math.min(drawHeight * 0.65, 36), font, color: rgb(0.05, 0.1, 0.25) });
  }
  return pdf.save({ useObjectStreams: true });
}
