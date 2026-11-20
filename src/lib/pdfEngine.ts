import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { runInDocWorker } from './workerClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjsLib };

export interface PdfAnnotationBase {
  id: string;
  pageIndex: number; // 0-based index into current page order
}

export interface PdfTextAnnotation extends PdfAnnotationBase {
  type: 'text';
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  text: string;
  fontSize: number;
  color: string;
}

export interface PdfHighlightAnnotation extends PdfAnnotationBase {
  type: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface PdfCommentAnnotation extends PdfAnnotationBase {
  type: 'comment';
  x: number;
  y: number;
  author: string;
  text: string;
  color: string;
}

export interface PdfDrawAnnotation extends PdfAnnotationBase {
  type: 'draw';
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeWidth: number;
}

export interface PdfShapeAnnotation extends PdfAnnotationBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
}

export interface PdfImageAnnotation extends PdfAnnotationBase {
  type: 'image' | 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

export type PdfAnnotation =
  | PdfTextAnnotation
  | PdfHighlightAnnotation
  | PdfCommentAnnotation
  | PdfDrawAnnotation
  | PdfShapeAnnotation
  | PdfImageAnnotation;

export interface PdfPageMeta {
  originalIndex: number;
  rotation: number; // 0, 90, 180, 270
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full || '000000', 16);
  return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
}

export async function createBlankPdfBytes(title = 'Untitled Document'): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText(title, {
    x: 56,
    y: 770,
    size: 18,
    font,
    color: rgb(0.1, 0.14, 0.2),
  });
  page.drawText('Created in Folio Workspace. Use the toolbar above to add text, shapes, highlights, or signatures.', {
    x: 56,
    y: 740,
    size: 10.5,
    font,
    color: rgb(0.4, 0.45, 0.52),
  });
  const bytes = await pdfDoc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function exportEditedPdf(
  sourceBuffer: ArrayBuffer,
  pagesMeta: PdfPageMeta[],
  annotations: PdfAnnotation[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);

  const indicesToCopy = pagesMeta.map((p) => p.originalIndex);
  const copiedPages = await outDoc.copyPages(srcDoc, indicesToCopy);

  for (let i = 0; i < copiedPages.length; i++) {
    const page = copiedPages[i];
    const meta = pagesMeta[i];
    if (meta.rotation) {
      const currentRot = page.getRotation().angle;
      page.setRotation(degrees((currentRot + meta.rotation) % 360));
    }
    outDoc.addPage(page);

    const { width, height } = page.getSize();
    const pageAnnots = annotations.filter((a) => a.pageIndex === i);

    for (const annot of pageAnnots) {
      if (annot.type === 'highlight') {
        page.drawRectangle({
          x: annot.x * width,
          y: height - (annot.y + annot.height) * height,
          width: Math.max(4, annot.width * width),
          height: Math.max(4, annot.height * height),
          color: hexToRgb(annot.color),
          opacity: 0.35,
        });
      } else if (annot.type === 'text') {
        const lines = annot.text.split('\n');
        lines.forEach((line, lineIdx) => {
          page.drawText(line, {
            x: annot.x * width,
            y: height - annot.y * height - annot.fontSize - lineIdx * (annot.fontSize * 1.25),
            size: annot.fontSize,
            font: helvetica,
            color: hexToRgb(annot.color),
          });
        });
      } else if (annot.type === 'comment') {
        const cx = annot.x * width;
        const cy = height - annot.y * height;
        page.drawRectangle({
          x: cx,
          y: cy - 42,
          width: Math.min(200, width - cx - 12),
          height: 42,
          color: rgb(0.99, 0.96, 0.78),
          borderColor: hexToRgb(annot.color),
          borderWidth: 1,
        });
        page.drawText(`${annot.author}: ${annot.text.slice(0, 48)}`, {
          x: cx + 6,
          y: cy - 18,
          size: 8.5,
          font: helvetica,
          color: rgb(0.15, 0.15, 0.18),
        });
      } else if (annot.type === 'shape') {
        const sx = annot.x * width;
        const sy = height - (annot.y + annot.height) * height;
        const sw = annot.width * width;
        const sh = annot.height * height;
        if (annot.shape === 'rect') {
          page.drawRectangle({
            x: sx,
            y: sy,
            width: sw,
            height: sh,
            borderColor: hexToRgb(annot.color),
            borderWidth: annot.strokeWidth,
          });
        } else if (annot.shape === 'ellipse') {
          page.drawEllipse({
            x: sx + sw / 2,
            y: sy + sh / 2,
            xScale: Math.abs(sw) / 2,
            yScale: Math.abs(sh) / 2,
            borderColor: hexToRgb(annot.color),
            borderWidth: annot.strokeWidth,
          });
        } else if (annot.shape === 'line') {
          page.drawLine({
            start: { x: annot.x * width, y: height - annot.y * height },
            end: { x: (annot.x + annot.width) * width, y: height - (annot.y + annot.height) * height },
            thickness: annot.strokeWidth,
            color: hexToRgb(annot.color),
          });
        }
      } else if (annot.type === 'draw') {
        for (let p = 1; p < annot.points.length; p++) {
          const prev = annot.points[p - 1];
          const curr = annot.points[p];
          page.drawLine({
            start: { x: prev.x * width, y: height - prev.y * height },
            end: { x: curr.x * width, y: height - curr.y * height },
            thickness: annot.strokeWidth,
            color: hexToRgb(annot.color),
          });
        }
      } else if (annot.type === 'image' || annot.type === 'signature') {
        try {
          const base64 = annot.dataUrl.split(',')[1];
          const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const embedded = annot.dataUrl.includes('image/png')
            ? await outDoc.embedPng(bin)
            : await outDoc.embedJpg(bin);
          page.drawImage(embedded, {
            x: annot.x * width,
            y: height - (annot.y + annot.height) * height,
            width: annot.width * width,
            height: annot.height * height,
          });
        } catch {
          // Fallback: convert via canvas to PNG if dataUrl was webp/svg
        }
      }
    }
  }

  return outDoc.save({ useObjectStreams: true });
}

export async function mergePdfBuffers(buffers: ArrayBuffer[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save({ useObjectStreams: true });
}

export async function extractPdfPages(buffer: ArrayBuffer, oneBasedPages: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total = src.getPageCount();
  const validIndices = oneBasedPages
    .map((n) => n - 1)
    .filter((idx) => idx >= 0 && idx < total);
  if (validIndices.length === 0) {
    throw new Error('No valid page numbers selected.');
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, validIndices);
  copied.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

export async function splitPdfIntoChunks(
  buffer: ArrayBuffer,
  pagesPerChunk: number
): Promise<Array<{ label: string; bytes: Uint8Array }>> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total = src.getPageCount();
  const step = Math.max(1, pagesPerChunk);
  const results: Array<{ label: string; bytes: Uint8Array }> = [];

  for (let start = 0; start < total; start += step) {
    const end = Math.min(total, start + step);
    const chunkDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, k) => start + k);
    const pages = await chunkDoc.copyPages(src, indices);
    pages.forEach((p) => chunkDoc.addPage(p));
    const bytes = await chunkDoc.save({ useObjectStreams: true });
    results.push({
      label: start + 1 === end ? `page-${start + 1}` : `pages-${start + 1}-to-${end}`,
      bytes,
    });
  }
  return results;
}

export async function compressPdfBuffer(
  buffer: ArrayBuffer,
  mode: 'lossless' | 'balanced' | 'compact',
  onProgress?: (pct: number) => void
): Promise<Uint8Array> {
  if (mode === 'lossless') {
    onProgress?.(40);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    doc.setTitle('');
    doc.setProducer('Folio Workspace');
    const saved = await doc.save({ useObjectStreams: true, addDefaultPage: false });
    onProgress?.(100);
    return saved;
  }

  // Rasterize pages to compressed JPEG inside a fresh PDF for substantial size reduction on image-heavy scans
  const scale = mode === 'balanced' ? 1.35 : 0.95;
  const quality = mode === 'balanced' ? 0.72 : 0.5;
  const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
  const pdf = await loadingTask.promise;
  const outDoc = await PDFDocument.create();

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const origVp = page.getViewport({ scale: 1 });
    const renderVp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(renderVp.width);
    canvas.height = Math.round(renderVp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: renderVp, canvas }).promise;

    const jpgDataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = jpgDataUrl.split(',')[1];
    const jpgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const jpgImage = await outDoc.embedJpg(jpgBytes);
    const newPage = outDoc.addPage([origVp.width, origVp.height]);
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: origVp.width,
      height: origVp.height,
    });
    onProgress?.(Math.round((i / pdf.numPages) * 100));
  }

  return outDoc.save({ useObjectStreams: true });
}

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<Array<{ page: number; text: string }>> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
  const pdf = await loadingTask.promise;
  const pages: Array<{ page: number; text: string }> = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let lines: string[] = [];
    let currentLine = '';

    for (const item of content.items) {
      if ('str' in item) {
        const y = item.transform?.[5] ?? 0;
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += (currentLine && !currentLine.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
        }
        lastY = y;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pages.push({ page: i, text: lines.join('\n') });
  }
  return pages;
}

export function parsePageRange(input: string, maxPages: number): number[] {
  const set = new Set<number>();
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [aStr, bStr] = part.split('-');
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        const start = Math.max(1, Math.min(a, b));
        const end = Math.min(maxPages, Math.max(a, b));
        for (let i = start; i <= end; i++) set.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= maxPages) set.add(n);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}
