import * as mammoth from 'mammoth';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';

export interface SlideElement {
  id: string;
  type: 'text' | 'shape' | 'image';
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  w: number; // percentage 0..100
  h: number; // percentage 0..100
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  fill?: string;
  shapeType?: 'rect' | 'ellipse';
  imageDataUrl?: string;
}

export interface SlideData {
  id: string;
  background: string;
  transition: 'none' | 'fade' | 'slide';
  layout: 'title' | 'title-body' | 'two-column' | 'blank';
  elements: SlideElement[];
}

export async function docxBufferToHtml(buffer: ArrayBuffer): Promise<{ html: string; warnings: string[] }> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer.slice(0) });
  return {
    html: result.value || '<p></p>',
    warnings: result.messages.map((m) => m.message),
  };
}

export async function odtBufferToHtml(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new Error('Invalid ODT file: missing content.xml.');
  const xmlStr = await contentFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
  const parts: string[] = [];

  const body = xmlDoc.getElementsByTagName('office:text')[0] || xmlDoc.documentElement;
  for (const node of Array.from(body.children)) {
    const tag = node.tagName.toLowerCase();
    const text = (node.textContent || '').trim();
    if (!text) continue;
    if (tag.endsWith(':h')) {
      const level = Math.min(3, Math.max(1, parseInt(node.getAttribute('text:outline-level') || '1', 10) || 1));
      parts.push(`<h${level}>${escapeHtml(text)}</h${level}>`);
    } else if (tag.endsWith(':list')) {
      const items = Array.from(node.getElementsByTagName('text:list-item'))
        .map((li) => `<li>${escapeHtml((li.textContent || '').trim())}</li>`)
        .join('');
      if (items) parts.push(`<ul>${items}</ul>`);
    } else if (tag.endsWith(':table')) {
      const rows = Array.from(node.getElementsByTagName('table:table-row'))
        .map((tr) => {
          const cells = Array.from(tr.getElementsByTagName('table:table-cell'))
            .map((td) => `<td>${escapeHtml((td.textContent || '').trim())}</td>`)
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      if (rows) parts.push(`<table><tbody>${rows}</tbody></table>`);
    } else {
      parts.push(`<p>${escapeHtml(text)}</p>`);
    }
  }
  return parts.length > 0 ? parts.join('') : '<p></p>';
}

export function rtfToHtml(rtf: string): string {
  // Clean RTF control words and extract readable paragraphs
  let text = rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, '    ')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\{\\\*[^}]*\}/g, '')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '');

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return '<p></p>';
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

export function htmlToRtf(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: string[] = [];

  const escapeRtf = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/[^\x20-\x7E]/g, (ch) => `\\u${ch.charCodeAt(0)}?`);

  for (const child of Array.from(doc.body.children)) {
    const tag = child.tagName.toLowerCase();
    const content = (child.textContent || '').trim();
    if (!content) continue;
    if (tag === 'h1') {
      blocks.push(`{\\pard\\sa200\\b\\fs36 ${escapeRtf(content)}\\par}`);
    } else if (tag === 'h2') {
      blocks.push(`{\\pard\\sa160\\b\\fs28 ${escapeRtf(content)}\\par}`);
    } else if (tag === 'h3') {
      blocks.push(`{\\pard\\sa120\\b\\fs24 ${escapeRtf(content)}\\par}`);
    } else if (tag === 'ul' || tag === 'ol') {
      Array.from(child.querySelectorAll('li')).forEach((li, idx) => {
        const prefix = tag === 'ol' ? `${idx + 1}. ` : '• ';
        blocks.push(`{\\pard\\li360\\sa80 ${escapeRtf(prefix + (li.textContent || '').trim())}\\par}`);
      });
    } else {
      blocks.push(`{\\pard\\sa140\\fs22 ${escapeRtf(content)}\\par}`);
    }
  }

  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\n${blocks.join('\n')}\n}`;
}

export function legacyBinaryToLines(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  const extracted: string[] = [];
  // Scan ASCII printable runs of length >= 5
  let run = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      run += String.fromCharCode(b);
    } else {
      if (run.trim().length >= 5) {
        extracted.push(run.trim());
      }
      run = '';
    }
  }
  if (run.trim().length >= 5) extracted.push(run.trim());

  // Filter out common OLE header noise
  const noiseRegex = /^(Root Entry|WordDocument|1Table|0Table|SummaryInformation|DocumentSummaryInformation|Microsoft|PowerPoint Document|Current User)$/i;
  const cleaned = extracted
    .flatMap((chunk) => chunk.split(/\r?\n/))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 4 && !noiseRegex.test(line) && /[a-zA-Z0-9]{2,}/.test(line));

  return Array.from(new Set(cleaned)).slice(0, 400);
}

export async function legacyDocToHtml(buffer: ArrayBuffer): Promise<string> {
  const lines = legacyBinaryToLines(buffer);
  if (lines.length === 0) {
    return '<p>No readable text streams could be extracted from this legacy .doc binary.</p>';
  }
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

function cssColorToHex(color?: string | null): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const clean = trimmed.slice(1);
    if (clean.length === 3) {
      return clean.split('').map((c) => c + c).join('').toUpperCase();
    }
    if (clean.length === 6) return clean.toUpperCase();
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = Number(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = Number(rgbMatch[3]).toString(16).padStart(2, '0');
    return `${r}${g}${b}`.toUpperCase();
  }
  return undefined;
}

function getAlignment(align?: string | null) {
  if (align === 'center') return AlignmentType.CENTER;
  if (align === 'right') return AlignmentType.RIGHT;
  if (align === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  font?: string;
  size?: number; // half-points
}

function collectInlineRuns(node: Node, style: InlineStyle = {}): Array<TextRun | ExternalHyperlink | ImageRun> {
  const runs: Array<TextRun | ExternalHyperlink | ImageRun> = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (text) {
      runs.push(
        new TextRun({
          text,
          bold: style.bold,
          italics: style.italics,
          underline: style.underline ? { type: UnderlineType.SINGLE } : undefined,
          strike: style.strike,
          color: style.color,
          font: style.font,
          size: style.size,
        })
      );
    }
    return runs;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return runs;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    runs.push(new TextRun({ break: 1 }));
    return runs;
  }

  if (tag === 'img') {
    const src = el.getAttribute('src') || '';
    if (src.startsWith('data:image/')) {
      try {
        const base64 = src.split(',')[1];
        const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const imgType = src.includes('image/png') ? 'png' : src.includes('image/gif') ? 'gif' : 'jpg';
        runs.push(
          new ImageRun({
            data: bin,
            transformation: { width: 420, height: 260 },
            type: imgType,
          })
        );
      } catch {
        // Ignore invalid embedded data URL
      }
    }
    return runs;
  }

  const nextStyle: InlineStyle = { ...style };
  if (tag === 'strong' || tag === 'b') nextStyle.bold = true;
  if (tag === 'em' || tag === 'i') nextStyle.italics = true;
  if (tag === 'u') nextStyle.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') nextStyle.strike = true;

  if (el.style.color) {
    const hex = cssColorToHex(el.style.color);
    if (hex) nextStyle.color = hex;
  }
  if (el.style.fontFamily) {
    nextStyle.font = el.style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
  }
  if (el.style.fontSize) {
    const px = parseFloat(el.style.fontSize);
    if (!Number.isNaN(px)) nextStyle.size = Math.round(px * 1.5);
  }

  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    const linkRuns = Array.from(el.childNodes).flatMap((child) =>
      collectInlineRuns(child, { ...nextStyle, underline: true, color: nextStyle.color || '2563EB' })
    );
    const textRuns = linkRuns.filter((r): r is TextRun => r instanceof TextRun);
    if (href && textRuns.length > 0) {
      runs.push(new ExternalHyperlink({ link: href, children: textRuns }));
      return runs;
    }
  }

  for (const child of Array.from(el.childNodes)) {
    runs.push(...collectInlineRuns(child, nextStyle));
  }
  return runs;
}

export async function htmlToDocxBuffer(html: string): Promise<ArrayBuffer> {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const children: Array<Paragraph | Table> = [];

  for (const node of Array.from(parsed.body.children)) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const align = getAlignment(el.style.textAlign);

    if (tag === 'hr') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const heading =
        tag === 'h1' ? HeadingLevel.HEADING_1 : tag === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      children.push(
        new Paragraph({
          heading,
          alignment: align,
          children: collectInlineRuns(el),
        })
      );
    } else if (tag === 'ul' || tag === 'ol') {
      const listItems = Array.from(el.querySelectorAll(':scope > li'));
      listItems.forEach((li, idx) => {
        const prefix = tag === 'ol' ? `${idx + 1}. ` : '• ';
        children.push(
          new Paragraph({
            indent: { left: 480 },
            spacing: { after: 80 },
            children: [new TextRun({ text: prefix }), ...collectInlineRuns(li)],
          })
        );
      });
    } else if (tag === 'table') {
      const trNodes = Array.from(el.querySelectorAll('tr'));
      const rows = trNodes.map((tr) => {
        const cellNodes = Array.from(tr.querySelectorAll('th, td'));
        const cells = cellNodes.map((cell) => {
          const isHeader = cell.tagName.toLowerCase() === 'th';
          return new TableCell({
            children: [
              new Paragraph({
                children: collectInlineRuns(cell, isHeader ? { bold: true } : {}),
              }),
            ],
          });
        });
        return new TableRow({ children: cells });
      });
      if (rows.length > 0) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          })
        );
      }
    } else {
      const runs = collectInlineRuns(el);
      children.push(
        new Paragraph({
          alignment: align,
          spacing: { after: 140 },
          children: runs.length > 0 ? runs : [new TextRun('')],
        })
      );
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun('')] }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  return blob.arrayBuffer();
}

export async function pptxBufferToSlides(buffer: ArrayBuffer): Promise<SlideData[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return numA - numB;
    });

  if (slidePaths.length === 0) {
    throw new Error('No slides found inside PPTX archive.');
  }

  const parser = new DOMParser();
  const slides: SlideData[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const xmlStr = await zip.file(slidePaths[i])!.async('string');
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
    const spNodes = Array.from(xmlDoc.getElementsByTagName('p:sp'));
    const elements: SlideElement[] = [];

    spNodes.forEach((sp, spIdx) => {
      const paragraphs = Array.from(sp.getElementsByTagName('a:p'))
        .map((p) =>
          Array.from(p.getElementsByTagName('a:t'))
            .map((t) => t.textContent || '')
            .join('')
            .trim()
        )
        .filter(Boolean);

      if (paragraphs.length === 0) return;

      const xfrm = sp.getElementsByTagName('a:xfrm')[0];
      const off = xfrm?.getElementsByTagName('a:off')[0];
      const ext = xfrm?.getElementsByTagName('a:ext')[0];

      // Standard 16:9 slide EMU: 9144000 x 5143500 (or 12192000 x 6858000)
      const slideW = 12192000;
      const slideH = 6858000;
      const rawX = parseInt(off?.getAttribute('x') || '0', 10);
      const rawY = parseInt(off?.getAttribute('y') || '0', 10);
      const rawW = parseInt(ext?.getAttribute('cx') || '0', 10);
      const rawH = parseInt(ext?.getAttribute('cy') || '0', 10);

      const hasCoords = rawW > 0 && rawH > 0;
      const x = hasCoords ? Math.max(2, Math.min(85, (rawX / slideW) * 100)) : 8;
      const y = hasCoords ? Math.max(2, Math.min(85, (rawY / slideH) * 100)) : spIdx === 0 ? 12 : 34 + spIdx * 16;
      const w = hasCoords ? Math.max(18, Math.min(92, (rawW / slideW) * 100)) : 84;
      const h = hasCoords ? Math.max(10, Math.min(80, (rawH / slideH) * 100)) : spIdx === 0 ? 16 : 42;

      const isTitle = spIdx === 0 || (sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') || '').includes('title');

      elements.push({
        id: `el_${i}_${spIdx}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'text',
        x,
        y,
        w,
        h,
        text: paragraphs.join('\n'),
        fontSize: isTitle ? 32 : 18,
        bold: isTitle,
        align: 'left',
        color: '#0f172a',
      });
    });

    if (elements.length === 0) {
      elements.push({
        id: `el_${i}_empty`,
        type: 'text',
        x: 10,
        y: 35,
        w: 80,
        h: 20,
        text: `Slide ${i + 1}`,
        fontSize: 28,
        bold: true,
        align: 'center',
        color: '#0f172a',
      });
    }

    slides.push({
      id: `slide_${i}_${Math.random().toString(36).slice(2, 7)}`,
      background: '#ffffff',
      transition: 'fade',
      layout: 'title-body',
      elements,
    });
  }

  return slides;
}

export async function odpBufferToSlides(buffer: ArrayBuffer): Promise<SlideData[]> {
  const zip = await JSZip.loadAsync(buffer);
  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new Error('Invalid ODP file: missing content.xml.');
  const xmlStr = await contentFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
  const pageNodes = Array.from(xmlDoc.getElementsByTagName('draw:page'));

  if (pageNodes.length === 0) {
    throw new Error('No slides found in ODP archive.');
  }

  return pageNodes.map((page, idx) => {
    const frames = Array.from(page.getElementsByTagName('draw:frame'));
    const elements: SlideElement[] = [];
    frames.forEach((frame, fIdx) => {
      const text = Array.from(frame.getElementsByTagName('text:p'))
        .map((p) => (p.textContent || '').trim())
        .filter(Boolean)
        .join('\n');
      if (!text) return;
      elements.push({
        id: `odp_${idx}_${fIdx}`,
        type: 'text',
        x: 8,
        y: fIdx === 0 ? 12 : 32 + (fIdx - 1) * 20,
        w: 84,
        h: fIdx === 0 ? 15 : 40,
        text,
        fontSize: fIdx === 0 ? 30 : 18,
        bold: fIdx === 0,
        align: 'left',
        color: '#0f172a',
      });
    });

    if (elements.length === 0) {
      elements.push({
        id: `odp_${idx}_fallback`,
        type: 'text',
        x: 10,
        y: 38,
        w: 80,
        h: 20,
        text: `Slide ${idx + 1}`,
        fontSize: 28,
        bold: true,
        align: 'center',
        color: '#0f172a',
      });
    }

    return {
      id: `slide_odp_${idx}`,
      background: '#ffffff',
      transition: 'fade',
      layout: 'title-body',
      elements,
    };
  });
}

export function legacyPptToSlides(buffer: ArrayBuffer): SlideData[] {
  const lines = legacyBinaryToLines(buffer);
  if (lines.length === 0) {
    return [
      {
        id: 'legacy_ppt_1',
        background: '#ffffff',
        transition: 'none',
        layout: 'title-body',
        elements: [
          {
            id: 'legacy_el_1',
            type: 'text',
            x: 8,
            y: 16,
            w: 84,
            h: 20,
            text: 'Legacy PPT Presentation',
            fontSize: 30,
            bold: true,
            color: '#0f172a',
          },
          {
            id: 'legacy_el_2',
            type: 'text',
            x: 8,
            y: 38,
            w: 84,
            h: 40,
            text: 'No readable text streams were found inside this binary .ppt file.',
            fontSize: 16,
            color: '#475569',
          },
        ],
      },
    ];
  }

  // Group into slides of ~5 lines each
  const slides: SlideData[] = [];
  for (let i = 0; i < lines.length; i += 5) {
    const chunk = lines.slice(i, i + 5);
    slides.push({
      id: `ppt_slide_${slides.length + 1}`,
      background: '#ffffff',
      transition: 'fade',
      layout: 'title-body',
      elements: [
        {
          id: `ppt_title_${slides.length}`,
          type: 'text',
          x: 8,
          y: 12,
          w: 84,
          h: 16,
          text: chunk[0] || `Slide ${slides.length + 1}`,
          fontSize: 28,
          bold: true,
          color: '#0f172a',
        },
        {
          id: `ppt_body_${slides.length}`,
          type: 'text',
          x: 8,
          y: 32,
          w: 84,
          h: 55,
          text: chunk.slice(1).join('\n'),
          fontSize: 18,
          color: '#1e293b',
        },
      ],
    });
  }
  return slides;
}

export async function slidesToPptxBuffer(slides: SlideData[], deckTitle: string): Promise<ArrayBuffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deckTitle;

  const slideWidthIn = 10;
  const slideHeightIn = 5.625;

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    if (slideData.background && slideData.background.startsWith('#')) {
      slide.background = { color: slideData.background.replace('#', '') };
    }

    for (const el of slideData.elements) {
      const x = (el.x / 100) * slideWidthIn;
      const y = (el.y / 100) * slideHeightIn;
      const w = Math.max(0.5, (el.w / 100) * slideWidthIn);
      const h = Math.max(0.4, (el.h / 100) * slideHeightIn);

      if (el.type === 'text') {
        slide.addText(el.text || '', {
          x,
          y,
          w,
          h,
          fontSize: Math.max(10, Math.round((el.fontSize || 18) * 0.75)),
          bold: Boolean(el.bold),
          italic: Boolean(el.italic),
          align: el.align || 'left',
          color: (el.color || '#0f172a').replace('#', ''),
          valign: 'top',
        });
      } else if (el.type === 'shape') {
        const shapeName = el.shapeType === 'ellipse' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect;
        slide.addShape(shapeName, {
          x,
          y,
          w,
          h,
          fill: { color: (el.fill || '#dbeafe').replace('#', '') },
          line: { color: (el.color || '#2563eb').replace('#', ''), width: 1.5 },
        });
      } else if (el.type === 'image' && el.imageDataUrl) {
        slide.addImage({
          data: el.imageDataUrl,
          x,
          y,
          w,
          h,
        });
      }
    }
  }

  const output = await pptx.write({ outputType: 'arraybuffer' });
  return output as ArrayBuffer;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
