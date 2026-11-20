import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Lock,
  Plus,
  Presentation,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { ConversionId, FORMAT_SPECS, FormatCategory, StoredDocument } from '../types/workspace';
import { DocumentLibrary } from './DocumentLibrary';
import { PdfInitialAction, ToolsCatalog } from './ToolsCatalog';

interface HomeViewProps {
  recentDocs: StoredDocument[];
  onUploadFiles: (files: FileList | null, pdfAction?: PdfInitialAction) => Promise<void>;
  onOpenDoc: (doc: StoredDocument) => void;
  onRenameDoc: (id: string, newName: string) => Promise<void>;
  onToggleStarDoc: (id: string) => Promise<void>;
  onDeleteDoc: (id: string) => Promise<void>;
  onCreateNew: (kind: 'word' | 'spreadsheet' | 'presentation' | 'pdf' | 'txt' | 'html' | 'json') => Promise<void>;
  onNavigate: (view: 'dashboard' | 'convert', conversionId?: ConversionId) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const FORMAT_GROUPS: Array<{
  id: FormatCategory;
  title: string;
}> = [
  { id: 'documents', title: 'Documents' },
  { id: 'spreadsheets', title: 'Spreadsheets' },
  { id: 'presentations', title: 'Presentations' },
  { id: 'images', title: 'Images' },
  { id: 'other', title: 'Code & Web' },
];

export const HomeView: React.FC<HomeViewProps> = ({
  recentDocs,
  onUploadFiles,
  onOpenDoc,
  onRenameDoc,
  onToggleStarDoc,
  onDeleteDoc,
  onCreateNew,
  onNavigate,
  isDark,
  onToggleTheme,
}) => {
  const [dragging, setDragging] = useState(false);
  const [activeGroup, setActiveGroup] = useState<FormatCategory>('documents');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const specsInGroup = Object.values(FORMAT_SPECS).filter((s) => s.category === activeGroup);

  return (
    <div className="space-y-12 sm:space-y-14 pb-14">
      {/* Compact Balanced Hero + Dropzone */}
      <section className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Value Prop + Quick Create */}
            <div className="lg:col-span-7 space-y-5">
              <div className="space-y-3">
                <h1
                  className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.12]"
                  style={{ textWrap: 'balance' }}
                >
                  Every Document. One Workspace.
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                  Open, create, edit, convert, and download PDFs, Word documents, spreadsheets, presentations, and images directly in your browser. Free, with no accounts, no watermarks, and local-first privacy.
                </p>
              </div>

              {/* Quick Create Buttons */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Start from a blank workspace
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onCreateNew('word')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Word Doc</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onCreateNew('spreadsheet')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Spreadsheet</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onCreateNew('presentation')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-amber-500 hover:bg-amber-50/40 dark:hover:bg-amber-950/30 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Presentation className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Presentation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onCreateNew('pdf')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-rose-500 hover:bg-rose-50/40 dark:hover:bg-rose-950/30 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Blank PDF</span>
                  </button>
                </div>
              </div>

              {/* Supported Formats Summary */}
              <div className="pt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <span className="font-medium text-slate-700 dark:text-slate-300">Supported formats:</span>{' '}
                PDF · DOCX / DOC / ODT / RTF / TXT · XLSX / XLS / CSV / ODS · PPTX / PPT / ODP · PNG / JPG / WEBP / GIF / SVG · HTML / JSON / XML
              </div>
            </div>

            {/* Right Compact Drag-and-Drop Upload Area */}
            <div className="lg:col-span-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  onUploadFiles(e.dataTransfer.files);
                }}
                className={`rounded-xl border-2 border-dashed p-6 sm:p-7 text-center transition-colors ${
                  dragging
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-950/60 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-5 h-5" />
                </div>
                <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                  Drop files to open in editor
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Processed locally on your device · Up to 150 MB per file
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Browse Files</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('convert')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Convert Center</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onUploadFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recently Opened Files */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        <DocumentLibrary
          docs={recentDocs}
          title="Recently Opened Files"
          maxItems={8}
          defaultViewMode="table"
          onOpenDoc={onOpenDoc}
          onRenameDoc={onRenameDoc}
          onToggleStarDoc={onToggleStarDoc}
          onDeleteDoc={onDeleteDoc}
          onTriggerUpload={() => fileInputRef.current?.click()}
          onCreateSample={(kind) => onCreateNew(kind)}
        />
      </section>

      {/* Complete Tools Catalog */}
      <section id="tools" className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        <ToolsCatalog
          recentDocs={recentDocs}
          onCreateNew={onCreateNew}
          onUploadAccepted={onUploadFiles}
          onOpenConvert={(recipeId) => onNavigate('convert', recipeId)}
        />
      </section>

      {/* Supported Format Categories Matrix */}
      <section id="formats" className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Supported Format Capabilities</h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Clear capability tiers showing which formats support full editing, PDF annotation, or text extraction.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg w-fit max-w-full overflow-x-auto">
            {FORMAT_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroup(g.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeGroup === g.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {g.title}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                  <th className="py-2.5 px-5">Format</th>
                  <th className="py-2.5 px-5">Support Level</th>
                  <th className="py-2.5 px-5">Export Targets</th>
                  <th className="py-2.5 px-5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {specsInGroup.map((spec) => (
                  <tr key={spec.ext}>
                    <td className="py-3 px-5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      .{spec.ext.toUpperCase()} · {spec.label}
                    </td>
                    <td className="py-3 px-5 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          spec.tier === 'Full Edit'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : spec.tier === 'Annotate & Organize'
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {spec.tier}
                      </span>
                    </td>
                    <td className="py-3 px-5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {spec.canExportAs.join(' · ')}
                    </td>
                    <td className="py-3 px-5 text-slate-600 dark:text-slate-400 max-w-md">
                      {spec.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Privacy & Browser Storage Architecture */}
      <section id="privacy" className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Privacy-First Client-Side Architecture</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Your documents stay on your device.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2.5 leading-relaxed">
              PDF rendering, DOCX editing, spreadsheet formulas, slide generation, and image compression execute locally inside your browser using Web Workers and open-source libraries. No files are uploaded to external servers or AI services.
            </p>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  100% Local Browser Processing
                </div>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                  PDF.js, pdf-lib, Mammoth, docx, SheetJS, PptxGenJS, and Canvas API run directly in browser memory with zero backend dependency.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Original Files Always Preserved
                </div>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                  Edits are saved as non-destructive drafts in local IndexedDB so you can revert to or download your original file anytime.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileCode2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Browser Storage Limitations
                </div>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                  IndexedDB cache lives inside this browser on this device. Clearing site data, switching devices, or closing Private mode removes cached drafts—always download finished files.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clean Footer */}
      <footer className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div>Folio Workspace — Free, client-side document editor & converter.</div>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => onNavigate('convert')}
            className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            Converter
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            {isDark ? 'Light Theme' : 'Dark Theme'}
          </button>
        </div>
      </footer>
    </div>
  );
};
