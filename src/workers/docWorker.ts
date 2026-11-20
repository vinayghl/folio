import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';

export type WorkerRequest =
  | { id: string; type: 'mergePdfs'; buffers: ArrayBuffer[] }
  | { id: string; type: 'extractPdfPages'; buffer: ArrayBuffer; oneBasedPages: number[] }
  | { id: string; type: 'splitPdf'; buffer: ArrayBuffer; pagesPerChunk: number }
  | { id: string; type: 'losslessCompressPdf'; buffer: ArrayBuffer }
  | {
      id: string;
      type: 'plainTextToPdf';
      text: string;
      options: { title?: string; monospace?: boolean; fontSize?: number };
    }
  | { id: string; type: 'xlsxToCsv'; buffer: ArrayBuffer; sheetIndex: number }
  | { id: string; type: 'csvToXlsx'; csvText: string; sheetName: string }
  | { id: string; type: 'legacyBinaryLines'; buffer: ArrayBuffer };

export type WorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

function sanitizePdfText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\t/g, '  ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

async function handleMessage(req: WorkerRequest): Promise<unknown> {
  switch (req.type) {
    case 'mergePdfs': {
      const merged = await PDFDocument.create();
      for (const buf of req.buffers) {
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      return merged.save({ useObjectStreams: true });
    }

    case 'extractPdfPages': {
      const src = await PDFDocument.load(req.buffer, { ignoreEncryption: true });
      const total = src.getPageCount();
      const validIndices = req.oneBasedPages
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

    case 'splitPdf': {
      const src = await PDFDocument.load(req.buffer, { ignoreEncryption: true });
      const total = src.getPageCount();
      const step = Math.max(1, req.pagesPerChunk);
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

    case 'losslessCompressPdf': {
      const doc = await PDFDocument.load(req.buffer, { ignoreEncryption: true });
      doc.setTitle('');
      doc.setProducer('Folio Workspace');
      return doc.save({ useObjectStreams: true, addDefaultPage: false });
    }

    case 'plainTextToPdf': {
      const { text, options } = req;
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

        const words = clean.split(' ');
        let current = '';
        const wrappedLines: string[] = [];

        for (const word of words) {
          const candidate = current ? `${current} ${word}` : word;
          if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
            current = candidate;
          } else {
            if (current) wrappedLines.push(current);
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

    case 'xlsxToCsv': {
      const wb = XLSX.read(req.buffer, { type: 'array' });
      const sheetName = wb.SheetNames[Math.min(req.sheetIndex, wb.SheetNames.length - 1)];
      const ws = wb.Sheets[sheetName];
      return {
        csv: XLSX.utils.sheet_to_csv(ws),
        sheetNames: wb.SheetNames,
      };
    }

    case 'csvToXlsx': {
      const wb = XLSX.read(req.csvText, { type: 'string' });
      const firstSheet = wb.SheetNames[0];
      if (firstSheet && firstSheet !== req.sheetName) {
        wb.Sheets[req.sheetName] = wb.Sheets[firstSheet];
        wb.SheetNames[0] = req.sheetName;
        delete wb.Sheets[firstSheet];
      }
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      return new Uint8Array(out);
    }

    case 'legacyBinaryLines': {
      const bytes = new Uint8Array(req.buffer);
      const extracted: string[] = [];
      let run = '';
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
          run += String.fromCharCode(b);
        } else {
          if (run.trim().length >= 5) extracted.push(run.trim());
          run = '';
        }
      }
      if (run.trim().length >= 5) extracted.push(run.trim());
      const noiseRegex =
        /^(Root Entry|WordDocument|1Table|0Table|SummaryInformation|DocumentSummaryInformation|Microsoft|PowerPoint Document|Current User)$/i;
      const cleaned = extracted
        .flatMap((chunk) => chunk.split(/\r?\n/))
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length >= 4 && !noiseRegex.test(line) && /[a-zA-Z0-9]{2,}/.test(line));
      return Array.from(new Set(cleaned)).slice(0, 400);
    }
  }
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const result = await handleMessage(req);
    const resp: WorkerResponse = { id: req.id, ok: true, result };
    self.postMessage(resp);
  } catch (err) {
    const resp: WorkerResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Worker processing failed.',
    };
    self.postMessage(resp);
  }
});
