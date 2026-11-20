import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Moon,
  Redo2,
  RotateCcw,
  Sun,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface ExportOption {
  label: string;
  description?: string;
  onClick: () => void | Promise<void>;
}

interface EditorShellProps {
  title: string;
  formatLabel: string;
  onRename: (newTitle: string) => void;
  onBack: () => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  isDark: boolean;
  onToggleTheme: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetOriginal?: () => void;
  exportOptions: ExportOption[];
  toolbar: React.ReactNode;
  sidebar?: React.ReactNode;
  sidebarTitle?: string;
  children: React.ReactNode;
}

export const EditorShell: React.FC<EditorShellProps> = ({
  title,
  formatLabel,
  onRename,
  onBack,
  saveStatus,
  isDark,
  onToggleTheme,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetOriginal,
  exportOptions,
  toolbar,
  sidebar,
  sidebarTitle = 'Pages',
  children,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(title);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const commitName = () => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    } else {
      setDraftName(title);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Top Editor Bar */}
      <header className="h-14 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 flex items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Back to workspace"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Workspace</span>
          </button>

          <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />

          {editingName ? (
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') {
                  setDraftName(title);
                  setEditingName(false);
                }
              }}
              autoFocus
              className="px-2 py-1 text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-blue-500 rounded outline-none min-w-[140px] max-w-[260px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftName(title);
                setEditingName(true);
              }}
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[140px] sm:max-w-[260px] hover:underline text-left cursor-pointer"
              title="Click to rename file"
            >
              {title}
            </button>
          )}

          <span className="hidden md:inline text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
            · {formatLabel}
          </span>

          <span className="hidden lg:inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 ml-1">
            {saveStatus === 'saved' && (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Cached in browser</span>
              </>
            )}
            {saveStatus === 'saving' && <span>Caching draft...</span>}
            {saveStatus === 'unsaved' && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Not cached — export to save
              </span>
            )}
          </span>
        </div>

        {/* Right Utility & Export Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {sidebar && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen((v) => !v)}
              className="lg:hidden px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {sidebarTitle}
            </button>
          )}

          {(onUndo || onRedo) && (
            <div className="hidden sm:flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo"
                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo"
                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {typeof zoom === 'number' && onZoomIn && onZoomOut && (
            <div className="hidden md:flex items-center border border-slate-200 dark:border-slate-800 rounded-lg px-1 py-0.5 gap-1">
              <button
                type="button"
                onClick={onZoomOut}
                title="Zoom out"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono tabular-nums px-1 min-w-[44px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={onZoomIn}
                title="Zoom in"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {onResetOriginal && (
            <button
              type="button"
              onClick={onResetOriginal}
              title="Revert to original uploaded file"
              className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Revert</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1.5 z-50">
                  {exportOptions.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setExportOpen(false);
                        opt.onClick();
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </div>
                      {opt.description && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {opt.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Secondary Editing Toolbar */}
      <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-1.5 overflow-x-auto">
        {toolbar}
      </div>

      {/* Main Editor Body */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {sidebar && (
          <>
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
              {sidebar}
            </aside>

            {/* Mobile Drawer Sidebar */}
            {mobileSidebarOpen && (
              <div className="lg:hidden fixed inset-0 z-40 flex">
                <div
                  className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
                  onClick={() => setMobileSidebarOpen(false)}
                />
                <aside className="relative z-50 w-68 max-w-[82vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full flex flex-col">
                  <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {sidebarTitle}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobileSidebarOpen(false)}
                      aria-label="Close sidebar"
                      className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">{sidebar}</div>
                </aside>
              </div>
            )}
          </>
        )}

        <main className="flex-1 min-w-0 overflow-auto bg-slate-100 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
};
