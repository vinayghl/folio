import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Circle,
  Copy,
  ImagePlus,
  Italic,
  LayoutTemplate,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  Type,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { StoredDocument } from '../../types/workspace';
import { EditorShell, ExportOption } from '../EditorShell';
import {
  legacyPptToSlides,
  odpBufferToSlides,
  pptxBufferToSlides,
  SlideData,
  SlideElement,
  slidesToPptxBuffer,
} from '../../lib/officeParsers';
import { slidesToPdfBytes } from '../../lib/converters';
import { downloadBuffer, replaceFileExtension } from '../../lib/storage';

interface PresentationWorkspaceProps {
  doc: StoredDocument;
  onUpdateDoc: (updated: StoredDocument) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onNotify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const PresentationWorkspace: React.FC<PresentationWorkspaceProps> = ({
  doc,
  onUpdateDoc,
  onBack,
  isDark,
  onToggleTheme,
  onNotify,
}) => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [editingElId, setEditingElId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [warningNotice, setWarningNotice] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [presentMode, setPresentMode] = useState(false);
  const [presentIdx, setPresentIdx] = useState(0);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const dragStateRef = useRef<{
    elId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setWarningNotice(null);
      try {
        let loaded: SlideData[] = [];
        if (typeof doc.workingDraft === 'string') {
          loaded = JSON.parse(doc.workingDraft) as SlideData[];
        } else if (doc.ext === 'pptx') {
          loaded = await pptxBufferToSlides(doc.originalData);
        } else if (doc.ext === 'odp') {
          loaded = await odpBufferToSlides(doc.originalData);
          setWarningNotice('ODP imported: slide text extracted into editable frames.');
        } else if (doc.ext === 'ppt') {
          loaded = legacyPptToSlides(doc.originalData);
          setWarningNotice(
            'Legacy binary .ppt detected: text content extracted. Export as .pptx or .pdf to save.'
          );
        }
        if (!cancelled) {
          setSlides(
            loaded.length > 0
              ? loaded
              : [
                  {
                    id: 'slide_default_1',
                    background: '#ffffff',
                    transition: 'fade',
                    layout: 'title',
                    elements: [],
                  },
                ]
          );
          setActiveSlideIdx(0);
        }
      } catch (err) {
        if (!cancelled) {
          onNotify('error', 'Import Error', err instanceof Error ? err.message : 'Unable to parse presentation.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  // Keyboard navigation in Presentation Mode
  useEffect(() => {
    if (!presentMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMode(false);
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setPresentIdx((i) => Math.min(slides.length - 1, i + 1));
      }
      if (e.key === 'ArrowLeft') {
        setPresentIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentMode, slides.length]);

  const persistSlides = useCallback(
    (next: SlideData[]) => {
      setSlides(next);
      setSaveStatus('saving');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          await onUpdateDoc({
            ...docRef.current,
            lastModified: Date.now(),
            workingDraft: JSON.stringify(next),
          });
          setSaveStatus('saved');
        } catch {
          setSaveStatus('unsaved');
        }
      }, 500);
    },
    [onUpdateDoc]
  );

  const activeSlide = slides[activeSlideIdx];
  const selectedEl = activeSlide?.elements.find((e) => e.id === selectedElId) || null;

  const updateActiveSlide = (patch: Partial<SlideData>) => {
    const next = slides.map((s, idx) => (idx === activeSlideIdx ? { ...s, ...patch } : s));
    persistSlides(next);
  };

  const updateElement = (elId: string, patch: Partial<SlideElement>) => {
    if (!activeSlide) return;
    updateActiveSlide({
      elements: activeSlide.elements.map((el) => (el.id === elId ? { ...el, ...patch } : el)),
    });
  };

  const addSlide = (layout: SlideData['layout'] = 'title-body') => {
    const id = `slide_${Date.now()}`;
    const elements: SlideElement[] = [];
    if (layout === 'title') {
      elements.push(
        {
          id: `t_${Date.now()}`,
          type: 'text',
          x: 10,
          y: 30,
          w: 80,
          h: 18,
          text: 'Section Title',
          fontSize: 38,
          bold: true,
          align: 'center',
          color: '#0f172a',
        },
        {
          id: `s_${Date.now() + 1}`,
          type: 'text',
          x: 15,
          y: 52,
          w: 70,
          h: 15,
          text: 'Add subtitle text',
          fontSize: 20,
          align: 'center',
          color: '#475569',
        }
      );
    } else if (layout === 'title-body') {
      elements.push(
        {
          id: `t_${Date.now()}`,
          type: 'text',
          x: 8,
          y: 10,
          w: 84,
          h: 14,
          text: 'Slide Heading',
          fontSize: 30,
          bold: true,
          align: 'left',
          color: '#0f172a',
        },
        {
          id: `b_${Date.now() + 1}`,
          type: 'text',
          x: 8,
          y: 28,
          w: 84,
          h: 56,
          text: '• Key point one\n• Key point two\n• Key point three',
          fontSize: 18,
          align: 'left',
          color: '#334155',
        }
      );
    } else if (layout === 'two-column') {
      elements.push(
        {
          id: `t_${Date.now()}`,
          type: 'text',
          x: 8,
          y: 10,
          w: 84,
          h: 14,
          text: 'Comparison',
          fontSize: 30,
          bold: true,
          align: 'left',
          color: '#0f172a',
        },
        {
          id: `c1_${Date.now() + 1}`,
          type: 'text',
          x: 8,
          y: 28,
          w: 40,
          h: 56,
          text: 'Left Column\n\nAdd supporting notes here.',
          fontSize: 18,
          align: 'left',
          color: '#334155',
        },
        {
          id: `c2_${Date.now() + 2}`,
          type: 'text',
          x: 52,
          y: 28,
          w: 40,
          h: 56,
          text: 'Right Column\n\nAdd supporting notes here.',
          fontSize: 18,
          align: 'left',
          color: '#334155',
        }
      );
    }

    const newSlide: SlideData = {
      id,
      background: '#ffffff',
      transition: 'fade',
      layout,
      elements,
    };
    const next = [...slides];
    next.splice(activeSlideIdx + 1, 0, newSlide);
    persistSlides(next);
    setActiveSlideIdx(activeSlideIdx + 1);
    setSelectedElId(null);
  };

  const duplicateSlide = (idx: number) => {
    const src = slides[idx];
    const copy: SlideData = {
      ...src,
      id: `slide_${Date.now()}`,
      elements: src.elements.map((e, i) => ({ ...e, id: `el_${Date.now()}_${i}` })),
    };
    const next = [...slides];
    next.splice(idx + 1, 0, copy);
    persistSlides(next);
    setActiveSlideIdx(idx + 1);
  };

  const deleteSlide = (idx: number) => {
    if (slides.length <= 1) {
      onNotify('warning', 'Cannot delete', 'A presentation must have at least one slide.');
      return;
    }
    const next = slides.filter((_, i) => i !== idx);
    persistSlides(next);
    setActiveSlideIdx(Math.max(0, Math.min(idx, next.length - 1)));
  };

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    persistSlides(next);
    setActiveSlideIdx(target);
  };

  const handleAddImage = (file: File) => {
    if (!activeSlide) return;
    const reader = new FileReader();
    reader.onload = () => {
      const el: SlideElement = {
        id: `img_${Date.now()}`,
        type: 'image',
        x: 25,
        y: 25,
        w: 45,
        h: 45,
        imageDataUrl: reader.result as string,
      };
      updateActiveSlide({ elements: [...activeSlide.elements, el] });
      setSelectedElId(el.id);
    };
    reader.readAsDataURL(file);
  };

  const exportOptions: ExportOption[] = [
    {
      label: 'Download PowerPoint (.pptx)',
      description: 'Standard 16:9 PowerPoint presentation',
      onClick: async () => {
        setBusyMessage('Building PPTX...');
        try {
          const buf = await slidesToPptxBuffer(slides, doc.name);
          downloadBuffer(
            buf,
            replaceFileExtension(doc.name, 'pptx'),
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          );
          onNotify('success', 'PPTX Downloaded');
        } catch (err) {
          onNotify('error', 'Export Failed', err instanceof Error ? err.message : 'Unable to export PPTX.');
        } finally {
          setBusyMessage(null);
        }
      },
    },
    {
      label: 'Export Slides as PDF (.pdf)',
      description: '16:9 widescreen PDF handouts',
      onClick: async () => {
        setBusyMessage('Rendering PDF...');
        try {
          const pdf = await slidesToPdfBytes(slides);
          downloadBuffer(pdf, replaceFileExtension(doc.name, 'pdf'), 'application/pdf');
          onNotify('success', 'PDF Downloaded');
        } catch (err) {
          onNotify('error', 'PDF Export Failed', err instanceof Error ? err.message : 'Unable to export PDF.');
        } finally {
          setBusyMessage(null);
        }
      },
    },
  ];

  const toolbar = activeSlide ? (
    <div className="flex items-center gap-1.5 min-w-max">
      <button
        type="button"
        onClick={() => addSlide('title-body')}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>New Slide</span>
      </button>

      <select
        value={activeSlide.layout}
        onChange={(e) => {
          const layout = e.target.value as SlideData['layout'];
          updateActiveSlide({ layout });
        }}
        title="Slide layout tag"
        className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none cursor-pointer"
      >
        <option value="title">Title Layout</option>
        <option value="title-body">Title + Body</option>
        <option value="two-column">Two Columns</option>
        <option value="blank">Blank</option>
      </select>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      <button
        type="button"
        onClick={() => {
          const el: SlideElement = {
            id: `txt_${Date.now()}`,
            type: 'text',
            x: 15,
            y: 25,
            w: 50,
            h: 22,
            text: 'New text box',
            fontSize: 20,
            color: '#0f172a',
            align: 'left',
          };
          updateActiveSlide({ elements: [...activeSlide.elements, el] });
          setSelectedElId(el.id);
        }}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Type className="w-3.5 h-3.5" />
        <span>Text</span>
      </button>

      <button
        type="button"
        onClick={() => {
          const el: SlideElement = {
            id: `shp_${Date.now()}`,
            type: 'shape',
            shapeType: 'rect',
            x: 30,
            y: 30,
            w: 24,
            h: 28,
            fill: '#dbeafe',
            color: '#2563eb',
          };
          updateActiveSlide({ elements: [...activeSlide.elements, el] });
          setSelectedElId(el.id);
        }}
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Square className="w-3.5 h-3.5" />
        <span>Rect</span>
      </button>

      <button
        type="button"
        onClick={() => {
          const el: SlideElement = {
            id: `elp_${Date.now()}`,
            type: 'shape',
            shapeType: 'ellipse',
            x: 35,
            y: 30,
            w: 20,
            h: 32,
            fill: '#fef3c7',
            color: '#d97706',
          };
          updateActiveSlide({ elements: [...activeSlide.elements, el] });
          setSelectedElId(el.id);
        }}
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Circle className="w-3.5 h-3.5" />
        <span>Circle</span>
      </button>

      <button
        type="button"
        onClick={() => imageInputRef.current?.click()}
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <ImagePlus className="w-3.5 h-3.5" />
        <span>Image</span>
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAddImage(f);
          e.target.value = '';
        }}
      />

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer">
        <span className="text-slate-600 dark:text-slate-300">Bg</span>
        <input
          type="color"
          value={activeSlide.background}
          onChange={(e) => updateActiveSlide({ background: e.target.value })}
          className="w-4 h-4 p-0 border-0 cursor-pointer"
        />
      </label>

      <select
        value={activeSlide.transition}
        onChange={(e) => updateActiveSlide({ transition: e.target.value as SlideData['transition'] })}
        title="Slide transition"
        className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none cursor-pointer"
      >
        <option value="none">Transition: None</option>
        <option value="fade">Transition: Fade</option>
        <option value="slide">Transition: Slide</option>
      </select>

      {selectedEl && (
        <>
          <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />
          {selectedEl.type === 'text' && (
            <>
              <button
                type="button"
                onClick={() => updateElement(selectedEl.id, { bold: !selectedEl.bold })}
                className={`p-1.5 rounded cursor-pointer ${
                  selectedEl.bold ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60' : ''
                }`}
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateElement(selectedEl.id, { italic: !selectedEl.italic })}
                className={`p-1.5 rounded cursor-pointer ${
                  selectedEl.italic ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60' : ''
                }`}
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min={10}
                max={72}
                value={selectedEl.fontSize || 18}
                onChange={(e) =>
                  updateElement(selectedEl.id, { fontSize: Math.max(10, parseInt(e.target.value || '18', 10)) })
                }
                className="w-14 px-1.5 py-1 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </>
          )}
          <input
            type="color"
            value={selectedEl.type === 'shape' ? selectedEl.fill || '#dbeafe' : selectedEl.color || '#0f172a'}
            onChange={(e) =>
              updateElement(
                selectedEl.id,
                selectedEl.type === 'shape' ? { fill: e.target.value } : { color: e.target.value }
              )
            }
            title="Element color"
            className="w-5 h-5 p-0 border-0 cursor-pointer"
          />
          <button
            type="button"
            onClick={() => {
              updateActiveSlide({
                elements: activeSlide.elements.filter((el) => el.id !== selectedEl.id),
              });
              setSelectedElId(null);
            }}
            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer"
            title="Delete element"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      <button
        type="button"
        onClick={() => {
          setPresentIdx(activeSlideIdx);
          setPresentMode(true);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
      >
        <Play className="w-3.5 h-3.5" />
        <span>Present</span>
      </button>
    </div>
  ) : null;

  const sidebar = (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
        <span>Slides ({slides.length})</span>
        <button
          type="button"
          onClick={() => addSlide('title-body')}
          className="inline-flex items-center gap-1 text-blue-600 hover:underline cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>
      <div className="space-y-2">
        {slides.map((s, idx) => (
          <div
            key={s.id}
            onClick={() => {
              setActiveSlideIdx(idx);
              setSelectedElId(null);
            }}
            className={`group rounded-lg p-2 border cursor-pointer transition-colors ${
              idx === activeSlideIdx
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div
              className="aspect-video rounded border border-slate-200/80 dark:border-slate-700 relative overflow-hidden"
              style={{ backgroundColor: s.background }}
            >
              {s.elements.slice(0, 4).map((el) => (
                <div
                  key={el.id}
                  className="absolute overflow-hidden text-[6px] leading-tight pointer-events-none"
                  style={{
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.w}%`,
                    height: `${el.h}%`,
                    color: el.color || '#0f172a',
                    backgroundColor: el.type === 'shape' ? el.fill : undefined,
                  }}
                >
                  {el.type === 'text' ? el.text : null}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span className="tabular-nums font-medium">Slide {idx + 1}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveSlide(idx, -1);
                  }}
                  disabled={idx === 0}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveSlide(idx, 1);
                  }}
                  disabled={idx === slides.length - 1}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateSlide(idx);
                  }}
                  title="Duplicate slide"
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSlide(idx);
                  }}
                  title="Delete slide"
                  className="p-0.5 rounded text-red-600 hover:bg-red-100 dark:hover:bg-red-950 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <EditorShell
      title={doc.name}
      formatLabel="Presentation"
      onRename={(newName) => onUpdateDoc({ ...doc, name: newName, lastModified: Date.now() })}
      onBack={onBack}
      saveStatus={saveStatus}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      exportOptions={exportOptions}
      toolbar={toolbar}
      sidebar={sidebar}
      sidebarTitle="Slides"
    >
      {warningNotice && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
          {warningNotice}
        </div>
      )}

      {busyMessage && (
        <div className="bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-900 px-4 py-2 flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{busyMessage}</span>
        </div>
      )}

      {loading || !activeSlide ? (
        <div className="flex flex-col items-center justify-center h-96 gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-sm">Loading presentation...</p>
        </div>
      ) : (
        <div className="p-4 sm:p-10 flex flex-col items-center justify-center min-h-full gap-4">
          {/* 16:9 Slide Canvas */}
          <div
            ref={canvasRef}
            onClick={() => {
              setSelectedElId(null);
              setEditingElId(null);
            }}
            onPointerMove={(e) => {
              const drag = dragStateRef.current;
              if (!drag || !canvasRef.current) return;
              const rect = canvasRef.current.getBoundingClientRect();
              const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
              const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
              updateElement(drag.elId, {
                x: Math.max(0, Math.min(90, drag.origX + dxPct)),
                y: Math.max(0, Math.min(90, drag.origY + dyPct)),
              });
            }}
            onPointerUp={() => {
              dragStateRef.current = null;
            }}
            className="w-full max-w-4xl aspect-video rounded-md shadow-md border border-slate-200 dark:border-slate-800 relative overflow-hidden select-none"
            style={{ backgroundColor: activeSlide.background }}
          >
            {activeSlide.elements.map((el) => {
              const isSelected = el.id === selectedElId;
              const isEditing = el.id === editingElId;
              return (
                <div
                  key={el.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedElId(el.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (el.type === 'text') setEditingElId(el.id);
                  }}
                  onPointerDown={(e) => {
                    if (isEditing) return;
                    e.stopPropagation();
                    setSelectedElId(el.id);
                    dragStateRef.current = {
                      elId: el.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: el.x,
                      origY: el.y,
                    };
                  }}
                  style={{
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.w}%`,
                    height: `${el.h}%`,
                  }}
                  className={`absolute cursor-move ${
                    isSelected ? 'ring-2 ring-blue-600' : 'hover:ring-1 hover:ring-blue-400/60'
                  }`}
                >
                  {el.type === 'text' && (
                    isEditing ? (
                      <textarea
                        value={el.text || ''}
                        autoFocus
                        onChange={(e) => updateElement(el.id, { text: e.target.value })}
                        onBlur={() => setEditingElId(null)}
                        style={{
                          fontSize: `${el.fontSize || 18}px`,
                          color: el.color || '#0f172a',
                          textAlign: el.align || 'left',
                        }}
                        className={`w-full h-full bg-white/85 outline-none resize-none p-1 rounded ${
                          el.bold ? 'font-bold' : ''
                        } ${el.italic ? 'italic' : ''}`}
                      />
                    ) : (
                      <div
                        style={{
                          fontSize: `clamp(11px, ${(el.fontSize || 18) * 0.09}vw, ${el.fontSize || 18}px)`,
                          color: el.color || '#0f172a',
                          textAlign: el.align || 'left',
                        }}
                        className={`w-full h-full whitespace-pre-wrap p-1 ${el.bold ? 'font-bold' : ''} ${
                          el.italic ? 'italic' : ''
                        }`}
                      >
                        {el.text}
                      </div>
                    )
                  )}

                  {el.type === 'shape' && (
                    <div
                      className={`w-full h-full ${el.shapeType === 'ellipse' ? 'rounded-full' : 'rounded-sm'}`}
                      style={{
                        backgroundColor: el.fill || '#dbeafe',
                        border: `2px solid ${el.color || '#2563eb'}`,
                      }}
                    />
                  )}

                  {el.type === 'image' && el.imageDataUrl && (
                    <img
                      src={el.imageDataUrl}
                      alt="Slide visual"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tip: Click to drag elements, double-click any text frame to edit copy.
          </p>
        </div>
      )}

      {/* Fullscreen Presentation Mode */}
      {presentMode && slides[presentIdx] && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-10">
          <button
            type="button"
            onClick={() => setPresentMode(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-slate-800/80 text-white hover:bg-slate-700 cursor-pointer"
            title="Exit presentation (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          <div
            key={slides[presentIdx].id}
            className={`w-full max-w-6xl aspect-video rounded-lg shadow-2xl relative overflow-hidden transition-all duration-300 ${
              slides[presentIdx].transition === 'fade' ? 'animate-in fade-in' : ''
            }`}
            style={{ backgroundColor: slides[presentIdx].background }}
          >
            {slides[presentIdx].elements.map((el) => (
              <div
                key={el.id}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.w}%`,
                  height: `${el.h}%`,
                }}
                className="absolute"
              >
                {el.type === 'text' && (
                  <div
                    style={{
                      fontSize: `${(el.fontSize || 18) * 1.15}px`,
                      color: el.color || '#0f172a',
                      textAlign: el.align || 'left',
                    }}
                    className={`w-full h-full whitespace-pre-wrap p-2 ${el.bold ? 'font-bold' : ''} ${
                      el.italic ? 'italic' : ''
                    }`}
                  >
                    {el.text}
                  </div>
                )}
                {el.type === 'shape' && (
                  <div
                    className={`w-full h-full ${el.shapeType === 'ellipse' ? 'rounded-full' : 'rounded-sm'}`}
                    style={{
                      backgroundColor: el.fill || '#dbeafe',
                      border: `2px solid ${el.color || '#2563eb'}`,
                    }}
                  />
                )}
                {el.type === 'image' && el.imageDataUrl && (
                  <img
                    src={el.imageDataUrl}
                    alt="Slide asset"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-4 text-white text-sm">
            <button
              type="button"
              onClick={() => setPresentIdx((i) => Math.max(0, i - 1))}
              disabled={presentIdx === 0}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="tabular-nums font-mono text-xs">
              {presentIdx + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => setPresentIdx((i) => Math.min(slides.length - 1, i + 1))}
              disabled={presentIdx >= slides.length - 1}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </EditorShell>
  );
};
