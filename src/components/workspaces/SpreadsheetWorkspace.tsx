import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpZA,
  BarChart3,
  Bold,
  Copy,
  Filter,
  Grid,
  Italic,
  Loader2,
  Plus,
  Trash2,
  ClipboardPaste,
} from 'lucide-react';
import { StoredDocument } from '../../types/workspace';
import { EditorShell, ExportOption } from '../EditorShell';
import { htmlToPdfBytes } from '../../lib/converters';
import { downloadBlob, downloadBuffer, replaceFileExtension } from '../../lib/storage';

interface SpreadsheetWorkspaceProps {
  doc: StoredDocument;
  onUpdateDoc: (updated: StoredDocument) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onNotify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  bg?: string;
  bordered?: boolean;
}

interface SheetModel {
  name: string;
  rows: string[][]; // raw values or formulas starting with '='
  styles: Record<string, CellStyle>; // key "r,c"
}

function colIndexToLetter(col: number): string {
  let s = '';
  let n = col;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (let i = 0; i < m[1].length; i++) {
    col = col * 26 + (m[1].charCodeAt(i) - 64);
  }
  return { row: parseInt(m[2], 10) - 1, col: col - 1 };
}

function evaluateFormula(
  raw: string,
  rows: string[][],
  visited: Set<string> = new Set()
): string | number {
  if (!raw.startsWith('=')) {
    const num = Number(raw);
    return raw !== '' && !Number.isNaN(num) ? num : raw;
  }

  const expr = raw.slice(1).trim();

  const getCellNum = (r: number, c: number): number => {
    const key = `${r},${c}`;
    if (visited.has(key)) return 0;
    const val = rows[r]?.[c] ?? '';
    if (val.startsWith('=')) {
      const nextVisited = new Set(visited);
      nextVisited.add(key);
      const evaled = evaluateFormula(val, rows, nextVisited);
      return typeof evaled === 'number' ? evaled : parseFloat(String(evaled)) || 0;
    }
    const n = parseFloat(val);
    return Number.isNaN(n) ? 0 : n;
  };

  const expandRange = (rangeStr: string): number[] => {
    const parts = rangeStr.split(':');
    if (parts.length !== 2) {
      const single = parseCellRef(rangeStr);
      return single ? [getCellNum(single.row, single.col)] : [];
    }
    const start = parseCellRef(parts[0]);
    const end = parseCellRef(parts[1]);
    if (!start || !end) return [];
    const nums: number[] = [];
    for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
      for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
        const rawVal = rows[r]?.[c] ?? '';
        if (rawVal !== '') nums.push(getCellNum(r, c));
      }
    }
    return nums;
  };

  try {
    // Handle SUM, AVERAGE, MIN, MAX, COUNT
    const replacedFuncs = expr.replace(
      /\b(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\(([^)]+)\)/gi,
      (_, fn, arg) => {
        const args = String(arg)
          .split(',')
          .flatMap((part) => (part.includes(':') ? expandRange(part) : expandRange(part)));
        const fnUpper = fn.toUpperCase();
        if (args.length === 0) return '0';
        if (fnUpper === 'SUM') return String(args.reduce((a, b) => a + b, 0));
        if (fnUpper === 'AVERAGE' || fnUpper === 'AVG')
          return String(args.reduce((a, b) => a + b, 0) / args.length);
        if (fnUpper === 'MIN') return String(Math.min(...args));
        if (fnUpper === 'MAX') return String(Math.max(...args));
        if (fnUpper === 'COUNT') return String(args.length);
        return '0';
      }
    );

    // Replace remaining cell references like A1, B12
    const replacedRefs = replacedFuncs.replace(/\b([A-Z]{1,3}\d{1,5})\b/gi, (token) => {
      const ref = parseCellRef(token);
      if (!ref) return token;
      return String(getCellNum(ref.row, ref.col));
    });

    // Safe arithmetic evaluator (only numbers, math operators, parens)
    if (!/^[0-9+\-*/().\s]+$/.test(replacedRefs)) {
      return '#ERR';
    }
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${replacedRefs})`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Math.round(result * 10000) / 10000;
    }
    return '#ERR';
  } catch {
    return '#ERR';
  }
}

export const SpreadsheetWorkspace: React.FC<SpreadsheetWorkspaceProps> = ({
  doc,
  onUpdateDoc,
  onBack,
  isDark,
  onToggleTheme,
  onNotify,
}) => {
  const [sheets, setSheets] = useState<SheetModel[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [formulaInput, setFormulaInput] = useState('');
  const [clipboardVal, setClipboardVal] = useState<string>('');
  const [filterText, setFilterText] = useState('');
  const [chartOpen, setChartOpen] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  const saveTimerRef = useRef<number | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  // Load workbook
  useEffect(() => {
    setLoading(true);
    try {
      if (typeof doc.workingDraft === 'string') {
        const parsed = JSON.parse(doc.workingDraft) as SheetModel[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSheets(parsed);
          setActiveSheetIdx(0);
          setLoading(false);
          return;
        }
      }

      const wb = XLSX.read(doc.originalData, { type: 'array' });
      const loadedSheets: SheetModel[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false }) || [];
        const minRows = Math.max(25, aoa.length + 5);
        const maxCols = Math.max(12, ...aoa.map((r) => (Array.isArray(r) ? r.length : 0)), 10);

        const rows: string[][] = Array.from({ length: minRows }, (_, r) =>
          Array.from({ length: maxCols }, (_, c) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (cell && cell.f) return `=${cell.f}`;
            const v = aoa[r]?.[c];
            return v !== undefined && v !== null ? String(v) : '';
          })
        );

        return { name, rows, styles: {} };
      });

      setSheets(
        loadedSheets.length > 0
          ? loadedSheets
          : [
              {
                name: 'Sheet1',
                rows: Array.from({ length: 25 }, () => Array(12).fill('')),
                styles: {},
              },
            ]
      );
      setActiveSheetIdx(0);
    } catch (err) {
      onNotify('error', 'Spreadsheet Error', err instanceof Error ? err.message : 'Unable to load file.');
      setSheets([
        {
          name: 'Sheet1',
          rows: Array.from({ length: 25 }, () => Array(12).fill('')),
          styles: {},
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [doc.id]);

  const activeSheet = sheets[activeSheetIdx] || sheets[0];

  useEffect(() => {
    if (!activeSheet) return;
    setFormulaInput(activeSheet.rows[selectedCell.r]?.[selectedCell.c] ?? '');
  }, [selectedCell, activeSheetIdx, sheets]);

  const persistSheets = useCallback(
    (nextSheets: SheetModel[]) => {
      setSheets(nextSheets);
      setSaveStatus('saving');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          await onUpdateDoc({
            ...docRef.current,
            lastModified: Date.now(),
            workingDraft: JSON.stringify(nextSheets),
          });
          setSaveStatus('saved');
        } catch {
          setSaveStatus('unsaved');
        }
      }, 500);
    },
    [onUpdateDoc]
  );

  const setCellValue = (r: number, c: number, value: string) => {
    const nextSheets = sheets.map((s, idx) => {
      if (idx !== activeSheetIdx) return s;
      const nextRows = s.rows.map((row, rIdx) =>
        rIdx === r ? row.map((cell, cIdx) => (cIdx === c ? value : cell)) : row
      );
      return { ...s, rows: nextRows };
    });
    persistSheets(nextSheets);
  };

  const toggleCellStyle = (patch: Partial<CellStyle>) => {
    const key = `${selectedCell.r},${selectedCell.c}`;
    const nextSheets = sheets.map((s, idx) => {
      if (idx !== activeSheetIdx) return s;
      const current = s.styles[key] || {};
      const merged: CellStyle = { ...current };
      (Object.keys(patch) as Array<keyof CellStyle>).forEach((k) => {
        if (typeof patch[k] === 'boolean') {
          (merged as Record<string, unknown>)[k] = !current[k];
        } else {
          (merged as Record<string, unknown>)[k] = patch[k];
        }
      });
      return { ...s, styles: { ...s.styles, [key]: merged } };
    });
    persistSheets(nextSheets);
  };

  const addRow = () => {
    if (!activeSheet) return;
    const cols = activeSheet.rows[0]?.length || 10;
    const nextSheets = sheets.map((s, idx) =>
      idx === activeSheetIdx ? { ...s, rows: [...s.rows, Array(cols).fill('')] } : s
    );
    persistSheets(nextSheets);
  };

  const addColumn = () => {
    if (!activeSheet) return;
    const nextSheets = sheets.map((s, idx) =>
      idx === activeSheetIdx ? { ...s, rows: s.rows.map((r) => [...r, '']) } : s
    );
    persistSheets(nextSheets);
  };

  const deleteSelectedRow = () => {
    if (!activeSheet || activeSheet.rows.length <= 2) return;
    const nextSheets = sheets.map((s, idx) =>
      idx === activeSheetIdx
        ? { ...s, rows: s.rows.filter((_, rIdx) => rIdx !== selectedCell.r) }
        : s
    );
    persistSheets(nextSheets);
  };

  const sortBySelectedCol = (asc: boolean) => {
    if (!activeSheet) return;
    const col = selectedCell.c;
    const [header, ...body] = activeSheet.rows;
    const nonEmpty = body.filter((r) => r.some((cell) => cell.trim() !== ''));
    const empty = body.filter((r) => r.every((cell) => cell.trim() === ''));

    nonEmpty.sort((a, b) => {
      const va = a[col] ?? '';
      const vb = b[col] ?? '';
      const na = parseFloat(va);
      const nb = parseFloat(vb);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) {
        return asc ? na - nb : nb - na;
      }
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    const nextSheets = sheets.map((s, idx) =>
      idx === activeSheetIdx ? { ...s, rows: [header, ...nonEmpty, ...empty] } : s
    );
    persistSheets(nextSheets);
    onNotify('success', `Sorted column ${colIndexToLetter(col)} ${asc ? 'A–Z' : 'Z–A'}`);
  };

  const addWorksheet = () => {
    const newName = `Sheet${sheets.length + 1}`;
    const newSheet: SheetModel = {
      name: newName,
      rows: Array.from({ length: 25 }, () => Array(12).fill('')),
      styles: {},
    };
    const next = [...sheets, newSheet];
    persistSheets(next);
    setActiveSheetIdx(next.length - 1);
  };

  const deleteWorksheet = (idx: number) => {
    if (sheets.length <= 1) {
      onNotify('warning', 'Cannot delete', 'Workbook must have at least one worksheet.');
      return;
    }
    const next = sheets.filter((_, i) => i !== idx);
    persistSheets(next);
    setActiveSheetIdx(Math.max(0, idx - 1));
  };

  const buildWorkbook = (): XLSX.WorkBook => {
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const evaluated = sheet.rows.map((row) =>
        row.map((val) => {
          if (val.startsWith('=')) return evaluateFormula(val, sheet.rows);
          const num = Number(val);
          return val !== '' && !Number.isNaN(num) ? num : val;
        })
      );
      const ws = XLSX.utils.aoa_to_sheet(evaluated);
      // Preserve formulas in SheetJS cell objects
      sheet.rows.forEach((row, r) =>
        row.forEach((val, c) => {
          if (val.startsWith('=')) {
            const addr = XLSX.utils.encode_cell({ r, c });
            ws[addr] = { t: 'n', f: val.slice(1), v: Number(evaluateFormula(val, sheet.rows)) || 0 };
          }
        })
      );
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    return wb;
  };

  const exportOptions: ExportOption[] = [
    {
      label: 'Download Excel (.xlsx)',
      description: 'Multi-sheet workbook with formulas preserved',
      onClick: () => {
        const wb = buildWorkbook();
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        downloadBuffer(
          out,
          replaceFileExtension(doc.name, 'xlsx'),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      },
    },
    {
      label: 'Download CSV (.csv)',
      description: 'Exports active worksheet as comma-separated values',
      onClick: () => {
        const wb = buildWorkbook();
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[activeSheet.name]);
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), replaceFileExtension(doc.name, 'csv'));
      },
    },
    {
      label: 'Download OpenDocument (.ods)',
      onClick: () => {
        const wb = buildWorkbook();
        const out = XLSX.write(wb, { type: 'array', bookType: 'ods' }) as ArrayBuffer;
        downloadBuffer(
          out,
          replaceFileExtension(doc.name, 'ods'),
          'application/vnd.oasis.opendocument.spreadsheet'
        );
      },
    },
    {
      label: 'Export Active Sheet as PDF (.pdf)',
      onClick: async () => {
        const nonEmptyRows = activeSheet.rows.filter((r) => r.some((c) => c.trim() !== ''));
        const maxCol = Math.max(
          1,
          ...nonEmptyRows.map((r) => r.reduce((last, cell, idx) => (cell.trim() ? idx + 1 : last), 0))
        );
        const htmlTable = `<h2>${activeSheet.name}</h2><table><tbody>${nonEmptyRows
          .map(
            (r, rIdx) =>
              `<tr>${r
                .slice(0, maxCol)
                .map((cell) => {
                  const val = cell.startsWith('=') ? evaluateFormula(cell, activeSheet.rows) : cell;
                  return rIdx === 0 ? `<th>${val}</th>` : `<td>${val}</td>`;
                })
                .join('')}</tr>`
          )
          .join('')}</tbody></table>`;
        const pdf = await htmlToPdfBytes(htmlTable);
        downloadBuffer(pdf, replaceFileExtension(doc.name, 'pdf'), 'application/pdf');
      },
    },
  ];

  // Extract chart series from active sheet (first text col = labels, first numeric col = values)
  const chartData = useMemo(() => {
    if (!activeSheet) return [];
    const points: Array<{ label: string; value: number }> = [];
    for (let r = 1; r < activeSheet.rows.length; r++) {
      const row = activeSheet.rows[r];
      const label = String(row[0] || '').trim();
      // Find first numeric value in columns 1..n (prefer rightmost numeric or col 1)
      let numVal: number | null = null;
      for (let c = 1; c < row.length; c++) {
        const raw = row[c];
        if (!raw) continue;
        const evaled = raw.startsWith('=') ? evaluateFormula(raw, activeSheet.rows) : Number(raw);
        if (typeof evaled === 'number' && !Number.isNaN(evaled)) {
          numVal = evaled;
        }
      }
      if (label && numVal !== null) {
        points.push({ label, value: numVal });
      }
    }
    return points.slice(0, 12);
  }, [activeSheet]);

  const currentCellKey = `${selectedCell.r},${selectedCell.c}`;
  const currentStyle = activeSheet?.styles[currentCellKey] || {};

  const visibleRowIndices = useMemo(() => {
    if (!activeSheet) return [];
    const q = filterText.trim().toLowerCase();
    return activeSheet.rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        if (!q || idx === 0) return true;
        return row.some((c) => c.toLowerCase().includes(q));
      })
      .map(({ idx }) => idx);
  }, [activeSheet, filterText]);

  const toolbar = (
    <div className="flex items-center gap-1.5 min-w-max">
      <button
        type="button"
        onClick={() => toggleCellStyle({ bold: true })}
        title="Bold"
        className={`p-1.5 rounded-md cursor-pointer ${
          currentStyle.bold
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => toggleCellStyle({ italic: true })}
        title="Italic"
        className={`p-1.5 rounded-md cursor-pointer ${
          currentStyle.italic
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Italic className="w-3.5 h-3.5" />
      </button>

      <label className="inline-flex items-center gap-1 px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs" title="Text color">
        <span className="font-semibold">A</span>
        <input
          type="color"
          value={currentStyle.color || '#0f172a'}
          onChange={(e) => toggleCellStyle({ color: e.target.value })}
          className="w-3.5 h-3.5 p-0 border-0 cursor-pointer"
        />
      </label>

      <label className="inline-flex items-center gap-1 px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs" title="Fill color">
        <span>Fill</span>
        <input
          type="color"
          value={currentStyle.bg || '#ffffff'}
          onChange={(e) => toggleCellStyle({ bg: e.target.value })}
          className="w-3.5 h-3.5 p-0 border-0 cursor-pointer"
        />
      </label>

      <button
        type="button"
        onClick={() => toggleCellStyle({ bordered: true })}
        title="Toggle dark cell border"
        className={`p-1.5 rounded-md cursor-pointer ${
          currentStyle.bordered
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Grid className="w-3.5 h-3.5" />
      </button>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      {[
        { align: 'left' as const, icon: AlignLeft },
        { align: 'center' as const, icon: AlignCenter },
        { align: 'right' as const, icon: AlignRight },
      ].map(({ align, icon: Icon }) => (
        <button
          key={align}
          type="button"
          onClick={() => toggleCellStyle({ align })}
          className={`p-1.5 rounded-md cursor-pointer ${
            currentStyle.align === align
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      <button
        type="button"
        onClick={() => {
          const val = activeSheet?.rows[selectedCell.r]?.[selectedCell.c] ?? '';
          setClipboardVal(val);
          navigator.clipboard?.writeText(val).catch(() => {});
          onNotify('info', 'Cell Copied', `${colIndexToLetter(selectedCell.c)}${selectedCell.r + 1}`);
        }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Copy className="w-3.5 h-3.5" />
        <span>Copy</span>
      </button>

      <button
        type="button"
        onClick={() => setCellValue(selectedCell.r, selectedCell.c, clipboardVal)}
        disabled={!clipboardVal}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
      >
        <ClipboardPaste className="w-3.5 h-3.5" />
        <span>Paste</span>
      </button>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      <button
        type="button"
        onClick={() => sortBySelectedCol(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <ArrowDownAZ className="w-3.5 h-3.5" />
        <span>Sort A–Z</span>
      </button>
      <button
        type="button"
        onClick={() => sortBySelectedCol(false)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <ArrowUpZA className="w-3.5 h-3.5" />
        <span>Sort Z–A</span>
      </button>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Row</span>
      </button>
      <button
        type="button"
        onClick={addColumn}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Col</span>
      </button>
      <button
        type="button"
        onClick={deleteSelectedRow}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Del Row</span>
      </button>

      <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      <div className="relative flex items-center">
        <Filter className="w-3.5 h-3.5 absolute left-2 text-slate-400" />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter rows..."
          className="pl-7 pr-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:border-blue-500 w-32"
        />
      </div>

      <button
        type="button"
        onClick={() => setChartOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
          chartOpen
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <BarChart3 className="w-3.5 h-3.5" />
        <span>Chart</span>
      </button>
    </div>
  );

  return (
    <EditorShell
      title={doc.name}
      formatLabel="Spreadsheet"
      onRename={(newName) => onUpdateDoc({ ...doc, name: newName, lastModified: Date.now() })}
      onBack={onBack}
      saveStatus={saveStatus}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      exportOptions={exportOptions}
      toolbar={toolbar}
    >
      {loading || !activeSheet ? (
        <div className="flex flex-col items-center justify-center h-96 gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-sm">Loading workbook...</p>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* Formula Bar */}
          <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-1.5 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs font-semibold tabular-nums min-w-[46px] text-center">
              {colIndexToLetter(selectedCell.c)}
              {selectedCell.r + 1}
            </span>
            <span className="text-xs font-mono text-slate-400 italic">fx</span>
            <input
              type="text"
              value={formulaInput}
              onChange={(e) => {
                setFormulaInput(e.target.value);
                setCellValue(selectedCell.r, selectedCell.c, e.target.value);
              }}
              placeholder="Enter value or formula (e.g. =SUM(B2:B5), =C2*D2)"
              className="flex-1 text-xs font-mono px-2 py-1 rounded border border-transparent focus:border-blue-500 bg-slate-50 dark:bg-slate-800 outline-none"
            />
          </div>

          {/* Optional Chart Panel */}
          {chartOpen && (
            <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-semibold">Sheet Chart Preview ({activeSheet.name})</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Plots Column A labels against numeric values in the active sheet.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                  <button
                    type="button"
                    onClick={() => setChartType('bar')}
                    className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                      chartType === 'bar' ? 'bg-white dark:bg-slate-900 font-semibold shadow-sm' : ''
                    }`}
                  >
                    Bar
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartType('line')}
                    className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                      chartType === 'line' ? 'bg-white dark:bg-slate-900 font-semibold shadow-sm' : ''
                    }`}
                  >
                    Line
                  </button>
                </div>
              </div>

              {chartData.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  Add text labels in Column A and numbers in Column B+ (rows 2+) to generate a chart.
                </p>
              ) : (
                <div className="h-44 flex items-end gap-3 pt-4 pb-2 px-2 overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
                  {chartType === 'bar' ? (
                    chartData.map((pt, i) => {
                      const maxVal = Math.max(...chartData.map((d) => Math.abs(d.value)), 1);
                      const pct = Math.max(6, Math.round((Math.abs(pt.value) / maxVal) * 100));
                      return (
                        <div key={i} className="flex-1 min-w-[48px] flex flex-col items-center gap-1 h-full justify-end">
                          <span className="text-[10px] font-mono tabular-nums text-slate-500">
                            {pt.value}
                          </span>
                          <div
                            className="w-full max-w-[40px] bg-blue-600 rounded-t transition-all"
                            style={{ height: `${pct}%` }}
                          />
                          <span className="text-[11px] truncate max-w-[70px] text-slate-600 dark:text-slate-300">
                            {pt.label}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <svg className="w-full h-full" viewBox="0 0 600 140" preserveAspectRatio="none">
                      {(() => {
                        const maxVal = Math.max(...chartData.map((d) => d.value), 1);
                        const minVal = Math.min(...chartData.map((d) => d.value), 0);
                        const range = Math.max(1, maxVal - minVal);
                        const pts = chartData.map((d, i) => {
                          const x = chartData.length === 1 ? 300 : (i / (chartData.length - 1)) * 560 + 20;
                          const y = 120 - ((d.value - minVal) / range) * 100;
                          return { x, y, ...d };
                        });
                        return (
                          <>
                            <polyline
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="2.5"
                              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                            />
                            {pts.map((p, idx) => (
                              <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#2563eb" />
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Spreadsheet Grid */}
          <div className="flex-1 overflow-auto bg-white dark:bg-slate-950">
            <table className="border-collapse table-fixed text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900">
                <tr>
                  <th className="w-11 border border-slate-200 dark:border-slate-800 text-slate-400 font-mono font-normal py-1.5" />
                  {activeSheet.rows[0]?.map((_, cIdx) => (
                    <th
                      key={cIdx}
                      className={`w-28 border border-slate-200 dark:border-slate-800 py-1.5 font-mono font-medium text-center ${
                        selectedCell.c === cIdx
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {colIndexToLetter(cIdx)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRowIndices.map((rIdx) => {
                  const row = activeSheet.rows[rIdx];
                  return (
                    <tr key={rIdx} className="h-8">
                      <td
                        className={`sticky left-0 z-10 border border-slate-200 dark:border-slate-800 text-center font-mono tabular-nums text-[11px] ${
                          selectedCell.r === rIdx
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-500'
                        }`}
                      >
                        {rIdx + 1}
                      </td>
                      {row.map((rawVal, cIdx) => {
                        const isSelected = selectedCell.r === rIdx && selectedCell.c === cIdx;
                        const isEditing = editingCell?.r === rIdx && editingCell?.c === cIdx;
                        const style = activeSheet.styles[`${rIdx},${cIdx}`] || {};
                        const displayVal = rawVal.startsWith('=')
                          ? String(evaluateFormula(rawVal, activeSheet.rows))
                          : rawVal;
                        const isNumeric = displayVal !== '' && !Number.isNaN(Number(displayVal));

                        return (
                          <td
                            key={cIdx}
                            onClick={() => {
                              setSelectedCell({ r: rIdx, c: cIdx });
                              if (!isEditing) setEditingCell(null);
                            }}
                            onDoubleClick={() => {
                              setSelectedCell({ r: rIdx, c: cIdx });
                              setEditingCell({ r: rIdx, c: cIdx });
                            }}
                            style={{
                              backgroundColor: style.bg || undefined,
                              color: style.color || undefined,
                              textAlign: style.align || (isNumeric ? 'right' : 'left'),
                            }}
                            className={`border px-2 py-1 truncate select-none cursor-cell ${
                              style.bordered
                                ? 'border-slate-700 dark:border-slate-300'
                                : 'border-slate-200 dark:border-slate-800'
                            } ${style.bold ? 'font-semibold' : ''} ${style.italic ? 'italic' : ''} ${
                              isNumeric ? 'font-mono tabular-nums' : ''
                            } ${isSelected ? 'ring-2 ring-inset ring-blue-600 z-[5]' : ''}`}
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                value={rawVal}
                                autoFocus
                                onChange={(e) => setCellValue(rIdx, cIdx, e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setEditingCell(null);
                                    setSelectedCell({
                                      r: Math.min(activeSheet.rows.length - 1, rIdx + 1),
                                      c: cIdx,
                                    });
                                  } else if (e.key === 'Tab') {
                                    e.preventDefault();
                                    setEditingCell(null);
                                    setSelectedCell({
                                      r: rIdx,
                                      c: Math.min(row.length - 1, cIdx + 1),
                                    });
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null);
                                  }
                                }}
                                className="w-full h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none font-mono text-xs"
                              />
                            ) : (
                              displayVal
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Worksheet Tabs */}
          <div className="shrink-0 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto">
            {sheets.map((s, idx) => (
              <div
                key={s.name + idx}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  idx === activeSheetIdx
                    ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
                }`}
                onClick={() => setActiveSheetIdx(idx)}
              >
                <span>{s.name}</span>
                {sheets.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWorksheet(idx);
                    }}
                    title="Delete sheet"
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addWorksheet}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Sheet</span>
            </button>
          </div>
        </div>
      )}
    </EditorShell>
  );
};
