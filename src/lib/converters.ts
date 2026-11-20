import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { extractTextFromPdf, pdfjsLib } from './pdfEngine';
import { runInDocWorker } from './workerClient';
import {
  docxBufferToHtml,
  htmlToDocxBuffer,
  odtBufferToHtml,
  pptxBufferToSlides,
  rtfToHtml,
  SlideData,
} from './officeParsers';

export interface ConversionOutput {
  filename: string;
  mimeType: string;
  data: Uint8Array | Blob;
  previewNote?: string;
}

function sanitizePdfText(text: string): string {
  // WinAnsi encoding in StandardFonts supports Latin-1 / printable ASCII; normalize smart punctuation
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\t/g, '  ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

export async function plainTextToPdf(
  text: string,
  options: { title?: string; monospace?: boolean; fontSize?: number } = {}
): Promise<Uint8Array> {
  const workerPromise = runInDocWorker<Uint8Array>({
    type: 'plainTextToPdf',
    text,
    options,
  });
  if (workerPromise) {
    try {
      return await workerPromise;
    } catch {
      // Fallback
    }
  }
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(
    options.monospace ? StandardFonts.Courier : StandardFonts.Helvetica
  );
  const boldFont = await pdfDoc.embedFont(
    options.monospace ? StandardFonts.CourierBold : StandardFonts.HelveticaBold
  );

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 52;
  const maxWidth = pageWidth - margin * 2;
  const fontSize = options.fontSize ?? (options.monospace ? 9.5 : 11);
  const lineHeight = fontSize * 1.48;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  if (options.title) {
    page.drawText(sanitizePdfText(options.title), {
      x: margin,
      y,
      size: 14,
      font: boldFont,
      color: rgb(0.08, 0.12, 0.2),
    });
    y -= 26;
  }

  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  for (const rawLine of rawLines) {
    const clean = sanitizePdfText(rawLine);
    if (!clean.trim()) {
      y -= lineHeight * 0.7;
      if (y < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      continue;
    }

    // Word-wrap line to fit maxWidth
    const words = clean.split(' ');
    let current = '';
    const wrappedLines: string[] = [];

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) wrappedLines.push(current);
        // Handle single very long token
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) <= maxWidth) {
              chunk += ch;
            } else {
              wrappedLines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) wrappedLines.push(current);

    for (const line of wrappedLines) {
      if (y < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.12, 0.16, 0.23),
      });
      y -= lineHeight;
    }
  }

  return pdfDoc.save({ useObjectStreams: true });
}

export async function htmlToPdfBytes(html: string): Promise<Uint8Array> {
  // Render inside a clean offscreen container and paginate cleanly into A4 PDF pages
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '794px'; // A4 width at 96 DPI
  container.style.padding = '48px 56px';
  container.style.background = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = 'Arial, Helvetica, sans-serif';
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.65';
  container.style.boxSizing = 'border-box';

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    h1 { font-size: 26px; font-weight: 700; margin: 0 0 14px; color: #0f172a; }
    h2 { font-size: 20px; font-weight: 600; margin: 18px 0 10px; color: #0f172a; }
    h3 { font-size: 16px; font-weight: 600; margin: 14px 0 8px; color: #0f172a; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 12px; padding-left: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    img { max-width: 100%; height: auto; }
  `;
  container.appendChild(styleEl);

  const contentWrap = document.createElement('div');
  contentWrap.innerHTML = html;
  container.appendChild(contentWrap);
  document.body.appendChild(container);

  try {
    const fullCanvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const pdfDoc = await PDFDocument.create();
    const a4W = 595.28;
    const a4H = 841.89;
    const pagePixelHeight = Math.floor((fullCanvas.width * a4H) / a4W);
    const totalSlices = Math.max(1, Math.ceil(fullCanvas.height / pagePixelHeight));

    for (let s = 0; s < totalSlices; s++) {
      const sy = s * pagePixelHeight;
      const sh = Math.min(pagePixelHeight, fullCanvas.height - sy);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = fullCanvas.width;
      sliceCanvas.height = pagePixelHeight;
      const ctx = sliceCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(fullCanvas, 0, sy, fullCanvas.width, sh, 0, 0, fullCanvas.width, sh);

      const jpgDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.92);
      const base64 = jpgDataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const img = await pdfDoc.embedJpg(bytes);
      const page = pdfDoc.addPage([a4W, a4H]);
      page.drawImage(img, { x: 0, y: 0, width: a4W, height: a4H });
    }

    return pdfDoc.save({ useObjectStreams: true });
  } finally {
    document.body.removeChild(container);
  }
}

export async function pdfToDocxBytes(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const pages = await extractTextFromPdf(buffer);
  const htmlParts = pages.map((p, idx) => {
    const paras = p.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
      .join('');
    const divider = idx < pages.length - 1 ? '<hr />' : '';
    return (paras || '<p></p>') + divider;
  });
  return htmlToDocxBuffer(htmlParts.join(''));
}

export async function docxToPdfBytes(buffer: ArrayBuffer): Promise<Uint8Array> {
  const { html } = await docxBufferToHtml(buffer);
  return htmlToPdfBytes(html);
}

export async function odtToPdfBytes(buffer: ArrayBuffer): Promise<Uint8Array> {
  const html = await odtBufferToHtml(buffer);
  return htmlToPdfBytes(html);
}

export async function rtfToPdfBytes(rtfText: string): Promise<Uint8Array> {
  const html = rtfToHtml(rtfText);
  return htmlToPdfBytes(html);
}

export async function pdfToImages(
  buffer: ArrayBuffer,
  format: 'png' | 'jpg',
  scale = 2,
  onProgress?: (pct: number) => void
): Promise<Array<{ page: number; dataUrl: string; blob: Blob }>> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
  const pdf = await loadingTask.promise;
  const outputs: Array<{ page: number; dataUrl: string; blob: Blob }> = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, 0.92);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), mime, 0.92));
    outputs.push({ page: i, dataUrl, blob });
    onProgress?.(Math.round((i / pdf.numPages) * 100));
  }
  return outputs;
}

export async function imagesToPdfBytes(
  files: Array<{ name: string; buffer: ArrayBuffer; mimeType: string }>,
  pageSize: 'fit' | 'a4' | 'letter' = 'a4'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const item of files) {
    // Normalize any image (PNG, JPG, WEBP, GIF, SVG) via Image + Canvas into clean PNG/JPG bytes
    const blob = new Blob([item.buffer], { type: item.mimeType || 'image/png' });
    const url = URL.createObjectURL(blob);
    try {
      const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not decode image "${item.name}".`));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth || 1200;
      canvas.height = imgEl.naturalHeight || 900;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

      const jpgUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64 = jpgUrl.split(',')[1];
      const jpgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const embedded = await pdfDoc.embedJpg(jpgBytes);

      if (pageSize === 'fit') {
        const page = pdfDoc.addPage([canvas.width, canvas.height]);
        page.drawImage(embedded, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      } else {
        const [pw, ph] = pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
        const margin = 36;
        const maxW = pw - margin * 2;
        const maxH = ph - margin * 2;
        const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
        const drawW = canvas.width * ratio;
        const drawH = canvas.height * ratio;
        const page = pdfDoc.addPage([pw, ph]);
        page.drawImage(embedded, {
          x: (pw - drawW) / 2,
          y: (ph - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return pdfDoc.save({ useObjectStreams: true });
}

export function xlsxBufferToCsv(buffer: ArrayBuffer, sheetIndex = 0): { csv: string; sheetNames: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[Math.min(sheetIndex, wb.SheetNames.length - 1)];
  const ws = wb.Sheets[sheetName];
  return {
    csv: XLSX.utils.sheet_to_csv(ws),
    sheetNames: wb.SheetNames,
  };
}

export function csvTextToXlsxBytes(csvText: string, sheetName = 'Sheet1'): Uint8Array {
  const wb = XLSX.read(csvText, { type: 'string' });
  const firstSheet = wb.SheetNames[0];
  if (firstSheet && firstSheet !== sheetName) {
    wb.Sheets[sheetName] = wb.Sheets[firstSheet];
    wb.SheetNames[0] = sheetName;
    delete wb.Sheets[firstSheet];
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

export async function slidesToPdfBytes(slides: SlideData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const pageW = 960;
  const pageH = 540;

  for (const slide of slides) {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    ctx.fillStyle = slide.background || '#ffffff';
    ctx.fillRect(0, 0, pageW, pageH);

    for (const el of slide.elements) {
      const x = (el.x / 100) * pageW;
      const y = (el.y / 100) * pageH;
      const w = (el.w / 100) * pageW;
      const h = (el.h / 100) * pageH;

      if (el.type === 'shape') {
        ctx.fillStyle = el.fill || '#dbeafe';
        ctx.strokeStyle = el.color || '#2563eb';
        ctx.lineWidth = 2;
        if (el.shapeType === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        }
      } else if (el.type === 'image' && el.imageDataUrl) {
        try {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = el.imageDataUrl!;
          });
          ctx.drawImage(img, x, y, w, h);
        } catch {
          // ignore broken embedded slide image
        }
      } else if (el.type === 'text') {
        const fontSize = el.fontSize || 18;
        ctx.fillStyle = el.color || '#0f172a';
        ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? '700' : '400'} ${fontSize}px Arial, sans-serif`;
        ctx.textBaseline = 'top';
        const lines = (el.text || '').split('\n');
        let lineY = y + 6;
        for (const rawLine of lines) {
          const words = rawLine.split(' ');
          let curr = '';
          for (const word of words) {
            const test = curr ? `${curr} ${word}` : word;
            if (ctx.measureText(test).width <= w - 12) {
              curr = test;
            } else {
              if (curr) {
                drawAlignedText(ctx, curr, x + 6, lineY, w - 12, el.align || 'left');
                lineY += fontSize * 1.35;
              }
              curr = word;
            }
          }
          if (curr) {
            drawAlignedText(ctx, curr, x + 6, lineY, w - 12, el.align || 'left');
            lineY += fontSize * 1.35;
          }
        }
      }
    }

    const jpgUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = jpgUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const embedded = await pdfDoc.embedJpg(bytes);
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
  }

  return pdfDoc.save({ useObjectStreams: true });
}

function drawAlignedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  align: 'left' | 'center' | 'right'
) {
  const width = ctx.measureText(text).width;
  let drawX = x;
  if (align === 'center') drawX = x + Math.max(0, (maxW - width) / 2);
  if (align === 'right') drawX = x + Math.max(0, maxW - width);
  ctx.fillText(text, drawX, y);
}

export async function pptxToPdfBytes(buffer: ArrayBuffer): Promise<Uint8Array> {
  const slides = await pptxBufferToSlides(buffer);
  return slidesToPdfBytes(slides);
}
