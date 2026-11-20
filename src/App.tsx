import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Menu, Moon, Plus, Sun, Upload, X } from 'lucide-react';
import { AppView, ConversionId, NotificationToast, StoredDocument } from './types/workspace';
import {
  clearAllStoredDocuments,
  createStoredDocumentFromFile,
  deleteStoredDocument,
  listStoredDocuments,
  saveStoredDocument,
} from './lib/storage';
import { createNewWorkspaceDoc } from './lib/sampleDocs';
import { HomeView } from './components/HomeView';
import { DashboardView } from './components/DashboardView';
import { ConversionCenter } from './components/ConversionCenter';
import { PdfInitialAction } from './components/ToolsCatalog';

// Lazy-load heavy specialized editors so homepage stays fast
const PdfWorkspace = lazy(() =>
  import('./components/workspaces/PdfWorkspace').then((m) => ({ default: m.PdfWorkspace }))
);
const WordWorkspace = lazy(() =>
  import('./components/workspaces/WordWorkspace').then((m) => ({ default: m.WordWorkspace }))
);
const SpreadsheetWorkspace = lazy(() =>
  import('./components/workspaces/SpreadsheetWorkspace').then((m) => ({ default: m.SpreadsheetWorkspace }))
);
const PresentationWorkspace = lazy(() =>
  import('./components/workspaces/PresentationWorkspace').then((m) => ({ default: m.PresentationWorkspace }))
);
const ImageWorkspace = lazy(() =>
  import('./components/workspaces/ImageWorkspace').then((m) => ({ default: m.ImageWorkspace }))
);
const CodeTextWorkspace = lazy(() =>
  import('./components/workspaces/CodeTextWorkspace').then((m) => ({ default: m.CodeTextWorkspace }))
);

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [activeDoc, setActiveDoc] = useState<StoredDocument | null>(null);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [initialConversionId, setInitialConversionId] = useState<ConversionId | undefined>(undefined);
  const [pendingPdfAction, setPendingPdfAction] = useState<PdfInitialAction | undefined>(undefined);
  const globalUploadInputRef = useRef<HTMLInputElement | null>(null);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('folio_theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('folio_theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore storage quota
    }
  }, [isDark]);

  const notify = useCallback(
    (type: NotificationToast['type'], title: string, message?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const refreshDocs = useCallback(async () => {
    try {
      const list = await listStoredDocuments();
      setDocs(list);
    } catch {
      // IndexedDB unavailable in restricted iframe contexts; keep in-memory state
    }
  }, []);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  const handleUploadFiles = async (files: FileList | null, pdfAction?: PdfInitialAction) => {
    if (!files || files.length === 0) return;
    let firstOpened: StoredDocument | null = null;
    for (const file of Array.from(files)) {
      try {
        const stored = await createStoredDocumentFromFile(file);
        setDocs((prev) => [stored, ...prev.filter((d) => d.id !== stored.id)]);
        if (!firstOpened) firstOpened = stored;
      } catch (err) {
        notify('error', 'Upload Rejected', err instanceof Error ? err.message : `Failed to load ${file.name}`);
      }
    }
    if (firstOpened) {
      setPendingPdfAction(firstOpened.workspace === 'pdf' ? pdfAction : undefined);
      setActiveDoc(firstOpened);
      setView('editor');
      setMobileMenuOpen(false);
      notify('success', 'Opened in Workspace', firstOpened.name);
    }
  };

  const handleOpenDoc = (doc: StoredDocument) => {
    setPendingPdfAction(undefined);
    setActiveDoc(doc);
    setView('editor');
    setMobileMenuOpen(false);
  };

  const handleUpdateDoc = async (updated: StoredDocument) => {
    setActiveDoc(updated);
    setDocs((prev) => {
      const exists = prev.some((d) => d.id === updated.id);
      const next = exists ? prev.map((d) => (d.id === updated.id ? updated : d)) : [updated, ...prev];
      return next.sort((a, b) => b.lastModified - a.lastModified);
    });
    const res = await saveStoredDocument(updated);
    if (!res.persisted) {
      notify(
        'warning',
        'Local Storage Warning',
        res.error || 'Could not cache draft in IndexedDB. Download your file to keep changes.'
      );
      throw new Error(res.error || 'Local persistence failed');
    }
  };

  const handleRenameDoc = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const target = docs.find((d) => d.id === id);
    if (!target || target.name === trimmed) return;
    const updated: StoredDocument = { ...target, name: trimmed, lastModified: Date.now() };
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? updated : d)).sort((a, b) => b.lastModified - a.lastModified)
    );
    if (activeDoc?.id === id) setActiveDoc(updated);
    const res = await saveStoredDocument(updated);
    if (!res.persisted) {
      notify('warning', 'Local Storage Warning', res.error || 'Renamed in session only.');
    }
  };

  const handleToggleStarDoc = async (id: string) => {
    const target = docs.find((d) => d.id === id);
    if (!target) return;
    const updated: StoredDocument = { ...target, starred: !target.starred };
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    if (activeDoc?.id === id) setActiveDoc(updated);
    await saveStoredDocument(updated);
  };

  const handleDeleteDoc = async (id: string) => {
    await deleteStoredDocument(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (activeDoc?.id === id) {
      setActiveDoc(null);
      setView('dashboard');
    }
    notify('info', 'Document deleted', 'Removed from browser storage.');
  };

  const handleClearAll = async () => {
    await clearAllStoredDocuments();
    setDocs([]);
    setActiveDoc(null);
    notify('info', 'Local storage cleared', 'All saved drafts have been removed.');
  };

  const handleCreateNew = async (
    kind: 'word' | 'spreadsheet' | 'presentation' | 'pdf' | 'txt' | 'html' | 'json'
  ) => {
    try {
      const created = await createNewWorkspaceDoc(kind);
      setDocs((prev) => [created, ...prev]);
      setPendingPdfAction(undefined);
      setActiveDoc(created);
      setView('editor');
      setNewModalOpen(false);
      setMobileMenuOpen(false);
    } catch (err) {
      notify('error', 'Create Failed', err instanceof Error ? err.message : 'Unable to initialize document.');
    }
  };

  const handleNavigate = (targetView: 'home' | 'dashboard' | 'convert', conversionId?: ConversionId) => {
    setInitialConversionId(conversionId);
    setView(targetView);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (view !== 'home') {
      setView('home');
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Render dedicated full-viewport Editor Interface when active
  if (view === 'editor' && activeDoc) {
    const commonProps = {
      doc: activeDoc,
      onUpdateDoc: handleUpdateDoc,
      onBack: () => {
        setPendingPdfAction(undefined);
        setView('dashboard');
      },
      isDark,
      onToggleTheme: () => setIsDark((d) => !d),
      onNotify: notify,
    };

    return (
      <>
        <Suspense
          fallback={
            <div className="h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Loading {activeDoc.ext.toUpperCase()} workspace...</p>
            </div>
          }
        >
          {activeDoc.workspace === 'pdf' && (
            <PdfWorkspace {...commonProps} initialAction={pendingPdfAction} />
          )}
          {activeDoc.workspace === 'word' && <WordWorkspace {...commonProps} />}
          {activeDoc.workspace === 'spreadsheet' && <SpreadsheetWorkspace {...commonProps} />}
          {activeDoc.workspace === 'presentation' && <PresentationWorkspace {...commonProps} />}
          {activeDoc.workspace === 'image' && <ImageWorkspace {...commonProps} />}
          {activeDoc.workspace === 'code' && <CodeTextWorkspace {...commonProps} />}
        </Suspense>
        <ToastRack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Global Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between gap-4">
          {/* Folio Logo */}
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer group"
          >
            <span className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.1">
                <path d="M6 4h8l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
                <path d="M14 4v4h4" />
                <path d="M9 12h6M9 16h4" />
              </svg>
            </span>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Folio
            </span>
          </button>

          {/* Desktop Center Links */}
          <nav className="hidden lg:flex items-center gap-6 text-[13px] font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => handleNavigate('home')}
              className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'home' ? 'text-slate-900 dark:text-white font-semibold' : ''
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('dashboard')}
              className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'dashboard' ? 'text-slate-900 dark:text-white font-semibold' : ''
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('convert')}
              className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'convert' ? 'text-slate-900 dark:text-white font-semibold' : ''
              }`}
            >
              Convert
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('tools')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              All Tools
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('formats')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Formats
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('privacy')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Privacy
            </button>
          </nav>

          {/* Right Controls: Theme Toggle, New Doc, Upload, Mobile Menu */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={() => globalUploadInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 space-y-1">
            {[
              { label: 'Home', active: view === 'home', onClick: () => handleNavigate('home') },
              { label: 'Dashboard', active: view === 'dashboard', onClick: () => handleNavigate('dashboard') },
              { label: 'Convert', active: view === 'convert', onClick: () => handleNavigate('convert') },
              { label: 'All Tools', active: false, onClick: () => scrollToSection('tools') },
              { label: 'Formats', active: false, onClick: () => scrollToSection('formats') },
              { label: 'Privacy', active: false, onClick: () => scrollToSection('privacy') },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  item.active
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setNewModalOpen(true);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer"
            >
              + Create New Document
            </button>
          </div>
        )}

        <input
          ref={globalUploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleUploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </header>

      {/* Main Page View */}
      <main className="flex-1">
        {view === 'home' && (
          <HomeView
            recentDocs={docs}
            onUploadFiles={handleUploadFiles}
            onOpenDoc={handleOpenDoc}
            onRenameDoc={handleRenameDoc}
            onToggleStarDoc={handleToggleStarDoc}
            onDeleteDoc={handleDeleteDoc}
            onCreateNew={handleCreateNew}
            onNavigate={handleNavigate}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
          />
        )}

        {view === 'dashboard' && (
          <DashboardView
            docs={docs}
            onUploadFiles={handleUploadFiles}
            onOpenDoc={handleOpenDoc}
            onRenameDoc={handleRenameDoc}
            onToggleStarDoc={handleToggleStarDoc}
            onDeleteDoc={handleDeleteDoc}
            onClearAll={handleClearAll}
            onCreateNew={handleCreateNew}
            onGoToConvert={(recipeId) => handleNavigate('convert', recipeId)}
          />
        )}

        {view === 'convert' && (
          <ConversionCenter
            recentDocs={docs}
            initialConversionId={initialConversionId}
            onNotify={notify}
          />
        )}
      </main>

      {/* New Document Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Create New Document</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose a workspace to start from a clean document.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { kind: 'word' as const, title: 'Word Document (.docx)', desc: 'Rich text, tables, images, PDF export' },
                { kind: 'spreadsheet' as const, title: 'Spreadsheet (.xlsx)', desc: 'Formulas, multi-sheet, charts, CSV' },
                { kind: 'presentation' as const, title: 'Presentation (.pptx)', desc: '16:9 slides, shapes, present mode' },
                { kind: 'pdf' as const, title: 'Blank PDF (.pdf)', desc: 'Annotate, sign, merge, split, compress' },
                { kind: 'html' as const, title: 'HTML Page (.html)', desc: 'Code editor with live split preview' },
                { kind: 'json' as const, title: 'JSON / Plain Text', desc: 'Format, validate, and typeset to PDF' },
              ].map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => handleCreateNew(opt.kind)}
                  className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 transition-colors cursor-pointer"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{opt.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ToastRack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </div>
  );
}

const ToastRack: React.FC<{
  toasts: NotificationToast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border p-3.5 shadow-lg bg-white dark:bg-slate-900 flex items-start justify-between gap-3 ${
            t.type === 'error'
              ? 'border-red-300 dark:border-red-900'
              : t.type === 'warning'
              ? 'border-amber-300 dark:border-amber-900'
              : t.type === 'success'
              ? 'border-emerald-300 dark:border-emerald-900'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
            {t.message && (
              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{t.message}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
