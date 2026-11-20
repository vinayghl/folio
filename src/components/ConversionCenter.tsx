import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, FileUp, Loader2, AlertTriangle } from 'lucide-react';
import { ConversionId, StoredDocument } from '../types/workspace';
import {
  csvTextToXlsxBytes,
  docxToPdfBytes,
  htmlToPdfBytes,
  imagesToPdfBytes,
  pdfToDocxBytes,
  pdfToImages,
  plainTextToPdf,
  pptxToPdfBytes,
  xlsxBufferToCsv,
} from '../lib/converters';
import { downloadBlob, downloadBuffer, formatBytes, replaceFileExtension } from '../lib/storage';

interface ConversionCenterProps {
  recentDocs: StoredDocument[];
  initialConversionId?: ConversionId;
  onNotify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

interface ConversionRecipe {
  id: ConversionId;
  title: string;
  from: string;
  to: string;
  accept: string;
  multiple?: boolean;
  description: string;
  fidelityNote: string;
}

const RECIPES: ConversionRecipe[] = [
  {
    id: 'pdf-to-docx',
    title: 'PDF to Word',
    from: 'PDF',
    to: 'DOCX',
    accept: '.pdf,application/pdf',
    description: 'Extracts text streams per page into an editable Microsoft Word document.',
    fidelityNote: 'Complex multi-column vector layouts and scanned images are converted as flowing text.',
  },
  {
    id: 'docx-to-pdf',
    title: 'Word to PDF',
    from: 'DOCX',
    to: 'PDF',
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    description: 'Renders headings, paragraphs, tables, and lists into a paginated A4 PDF.',
    fidelityNote: 'Standard Word styles and tables are preserved cleanly; custom macros are ignored.',
  },
  {
    id: 'pdf-to-images',
    title: 'PDF to Images',
    from: 'PDF',
    to: 'PNG / JPG',
    accept: '.pdf,application/pdf',
    description: 'Renders every PDF page at crisp 2x resolution into downloadable image files.',
    fidelityNote: 'Visual fidelity is 100% preserved as rasterized page images.',
  },
  {
    id: 'images-to-pdf',
    title: 'Images to PDF',
    from: 'PNG / JPG / WEBP / SVG',
    to: 'PDF',
    accept: 'image/*',
    multiple: true,
    description: 'Combines one or multiple images into a single multi-page PDF document.',
    fidelityNote: 'Choose A4, US Letter, or Fit-to-Image page sizing.',
  },
  {
    id: 'xlsx-to-csv',
    title: 'Excel to CSV',
    from: 'XLSX / XLS / ODS',
    to: 'CSV',
    accept: '.xlsx,.xls,.ods',
    description: 'Exports the selected worksheet into clean UTF-8 comma-separated values.',
    fidelityNote: 'Evaluated values are exported; multi-sheet styling is omitted in CSV.',
  },
  {
    id: 'csv-to-xlsx',
    title: 'CSV to Excel',
    from: 'CSV',
    to: 'XLSX',
    accept: '.csv,text/csv',
    description: 'Converts comma-separated tabular data into a standard Excel workbook.',
    fidelityNote: 'Preserves numeric types and columns cleanly.',
  },
  {
    id: 'pptx-to-pdf',
    title: 'PowerPoint to PDF',
    from: 'PPTX',
    to: 'PDF',
    accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    description: 'Converts PowerPoint slides into 16:9 widescreen PDF handouts.',
    fidelityNote: 'Slide text boxes and layouts are rendered cleanly; slide animations do not apply in PDF.',
  },
  {
    id: 'html-to-pdf',
    title: 'HTML to PDF',
    from: 'HTML',
    to: 'PDF',
    accept: '.html,.htm,text/html',
    description: 'Renders HTML markup and inline CSS into a paginated A4 PDF.',
    fidelityNote: 'External remote images blocked by CORS may not appear in offline renders.',
  },
  {
    id: 'txt-to-pdf',
    title: 'Plain Text to PDF',
    from: 'TXT',
    to: 'PDF',
    accept: '.txt,text/plain',
    description: 'Typesets plain text with clean margins and automatic word wrapping.',
    fidelityNote: 'Preserves line breaks and paragraph spacing across multi-page A4 output.',
  },
];

export const ConversionCenter: React.FC<ConversionCenterProps> = ({
  recentDocs,
  initialConversionId,
  onNotify,
}) => {
  const [selectedId, setSelectedId] = useState<ConversionId>(initialConversionId || 'images-to-pdf');
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ name: string; blob: Blob; previewUrl?: string }>>([]);

  // Options
  const [imageFormat, setImageFormat] = useState<'png' | 'jpg'>('png');
  const [pdfPageSize, setPdfPageSize] = useState<'a4' | 'letter' | 'fit'>('a4');
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialConversionId) {
      setSelectedId(initialConversionId);
      setFiles([]);
      setResults([]);
      setError(null);
      setProgress(0);
    }
  }, [initialConversionId]);

  const recipe = RECIPES.find((r) => r.id === selectedId) || RECIPES[0];

  const handleSelectRecipe = (id: ConversionId) => {
    setSelectedId(id);
    setFiles([]);
    setResults([]);
    setError(null);
    setProgress(0);
    setSheetNames([]);
  };

  const handleFilesSelected = async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const arr = Array.from(incoming);
    setFiles(recipe.multiple ? arr : [arr[0]]);
    setResults([]);
    setError(null);

    if (recipe.id === 'xlsx-to-csv' && arr[0]) {
      try {
        const buf = await arr[0].arrayBuffer();
        const info = xlsxBufferToCsv(buf, 0);
        setSheetNames(info.sheetNames);
        setSelectedSheetIdx(0);
      } catch {
        setSheetNames([]);
      }
    }
  };

  const runConversion = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setProgress(10);
    setError(null);
    setResults([]);

    try {
      const primary = files[0];
      if (recipe.id === 'pdf-to-docx') {
        const buf = await primary.arrayBuffer();
        setProgress(45);
        const docxBuf = await pdfToDocxBytes(buf);
        const blob = new Blob([docxBuf], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        setResults([{ name: replaceFileExtension(primary.name, 'docx'), blob }]);
      } else if (recipe.id === 'docx-to-pdf') {
        const buf = await primary.arrayBuffer();
        setProgress(45);
        const pdfBytes = await docxToPdfBytes(buf);
        const copy = new Uint8Array(pdfBytes);
        setResults([
          {
            name: replaceFileExtension(primary.name, 'pdf'),
            blob: new Blob([copy], { type: 'application/pdf' }),
          },
        ]);
      } else if (recipe.id === 'pdf-to-images') {
        const buf = await primary.arrayBuffer();
        const imgs = await pdfToImages(buf, imageFormat, 2, (pct) => setProgress(pct));
        const base = primary.name.replace(/\.pdf$/i, '');
        setResults(
          imgs.map((im) => ({
            name: `${base}_page_${im.page}.${imageFormat}`,
            blob: im.blob,
            previewUrl: im.dataUrl,
          }))
        );
      } else if (recipe.id === 'images-to-pdf') {
        const items = await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            buffer: await f.arrayBuffer(),
            mimeType: f.type || 'image/png',
          }))
        );
        setProgress(55);
        const pdfBytes = await imagesToPdfBytes(items, pdfPageSize);
        const copy = new Uint8Array(pdfBytes);
        const outName = files.length === 1 ? replaceFileExtension(primary.name, 'pdf') : 'combined-images.pdf';
        setResults([{ name: outName, blob: new Blob([copy], { type: 'application/pdf' }) }]);
      } else if (recipe.id === 'xlsx-to-csv') {
        const buf = await primary.arrayBuffer();
        const { csv } = xlsxBufferToCsv(buf, selectedSheetIdx);
        setResults([
          {
            name: replaceFileExtension(primary.name, 'csv'),
            blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          },
        ]);
      } else if (recipe.id === 'csv-to-xlsx') {
        const txt = await primary.text();
        const xlsxBytes = csvTextToXlsxBytes(txt);
        const copy = new Uint8Array(xlsxBytes);
        setResults([
          {
            name: replaceFileExtension(primary.name, 'xlsx'),
            blob: new Blob([copy], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
          },
        ]);
      } else if (recipe.id === 'pptx-to-pdf') {
        const buf = await primary.arrayBuffer();
        setProgress(50);
        const pdfBytes = await pptxToPdfBytes(buf);
        const copy = new Uint8Array(pdfBytes);
        setResults([
          {
            name: replaceFileExtension(primary.name, 'pdf'),
            blob: new Blob([copy], { type: 'application/pdf' }),
          },
        ]);
      } else if (recipe.id === 'html-to-pdf') {
        const html = await primary.text();
        setProgress(45);
        const pdfBytes = await htmlToPdfBytes(html);
        const copy = new Uint8Array(pdfBytes);
        setResults([
          {
            name: replaceFileExtension(primary.name, 'pdf'),
            blob: new Blob([copy], { type: 'application/pdf' }),
          },
        ]);
      } else if (recipe.id === 'txt-to-pdf') {
        const txt = await primary.text();
        setProgress(50);
        const pdfBytes = await plainTextToPdf(txt, { title: primary.name });
        const copy = new Uint8Array(pdfBytes);
        setResults([
          {
            name: replaceFileExtension(primary.name, 'pdf'),
            blob: new Blob([copy], { type: 'application/pdf' }),
          },
        ]);
      }

      setProgress(100);
      onNotify('success', 'Conversion Complete', `${recipe.title} finished locally.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Conversion failed. Ensure the file is valid.';
      setError(msg);
      onNotify('error', 'Conversion Error', msg);
    } finally {
      setProcessing(false);
    }
  };

  // Matching workspace docs user can reuse without re-uploading
  const matchingWorkspaceDocs = recentDocs.filter((d) => {
    const ext = `.${d.ext.toLowerCase()}`;
    if (recipe.id === 'images-to-pdf') return d.category === 'images';
    return recipe.accept.toLowerCase().includes(ext);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Conversion Center</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-2xl">
          Every conversion runs locally in your browser without file limits, watermarks, or server uploads.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Recipe Selector */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
          {RECIPES.map((r) => {
            const active = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => handleSelectRecipe(r.id)}
                className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-900 border-blue-600 ring-1 ring-blue-600'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {r.title}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    <span>{r.from}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{r.to}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{r.description}</p>
              </button>
            );
          })}
        </div>

        {/* Right Conversion Workbench */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{recipe.title}</h2>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {recipe.from} → {recipe.to}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{recipe.description}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span>{recipe.fidelityNote}</span>
          </div>

          {/* Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFilesSelected(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/60 dark:bg-slate-950/40"
          >
            <FileUp className="w-8 h-8 mx-auto text-blue-600 dark:text-blue-400 mb-2.5" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? 's' : ''} ready: ${files.map((f) => f.name).join(', ')}`
                : `Drop ${recipe.from} file${recipe.multiple ? '(s)' : ''} here or click to browse`}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Processed entirely on your device
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={recipe.accept}
              multiple={Boolean(recipe.multiple)}
              className="hidden"
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* Quick Pick from Recent Workspace Docs */}
          {matchingWorkspaceDocs.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Or select from your recent workspace files:
              </div>
              <div className="flex flex-wrap gap-2">
                {matchingWorkspaceDocs.slice(0, 4).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      const file = new File([d.originalData], d.name);
                      setFiles([file]);
                      setResults([]);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:border-blue-500 hover:text-blue-600 cursor-pointer truncate max-w-[220px]"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recipe-specific options */}
          {recipe.id === 'pdf-to-images' && (
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">Output Format:</span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['png', 'jpg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setImageFormat(fmt)}
                    className={`px-3 py-1 rounded-md font-medium uppercase cursor-pointer ${
                      imageFormat === fmt ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600' : ''
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recipe.id === 'images-to-pdf' && (
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">Page Size:</span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {[
                  { id: 'a4' as const, label: 'A4' },
                  { id: 'letter' as const, label: 'US Letter' },
                  { id: 'fit' as const, label: 'Fit Image' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPdfPageSize(opt.id)}
                    className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                      pdfPageSize === opt.id ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600' : ''
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recipe.id === 'xlsx-to-csv' && sheetNames.length > 1 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">Worksheet:</span>
              <select
                value={selectedSheetIdx}
                onChange={(e) => setSelectedSheetIdx(parseInt(e.target.value, 10))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {sheetNames.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={files.length === 0 || processing}
              onClick={runConversion}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-45 disabled:pointer-events-none text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{processing ? 'Converting...' : `Convert to ${recipe.to}`}</span>
            </button>

            {processing && (
              <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Output Results */}
          {results.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Ready to Download ({results.length} file{results.length > 1 ? 's' : ''})</span>
                </div>
                {results.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      results.forEach((r, idx) => {
                        setTimeout(() => downloadBlob(r.blob, r.name), idx * 220);
                      });
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    Download All
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {results.map((res, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {res.previewUrl && (
                        <img
                          src={res.previewUrl}
                          alt={res.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 object-cover rounded border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{res.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {formatBytes(res.blob.size)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadBlob(res.blob, res.name)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
