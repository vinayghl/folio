import React, { useEffect, useRef, useState } from 'react';
import { Code2, Eye, Search, Sparkles } from 'lucide-react';
import { StoredDocument } from '../../types/workspace';
import { EditorShell, ExportOption } from '../EditorShell';
import { htmlToPdfBytes, plainTextToPdf } from '../../lib/converters';
import { htmlToDocxBuffer } from '../../lib/officeParsers';
import { downloadBlob, downloadBuffer, replaceFileExtension } from '../../lib/storage';

interface CodeTextWorkspaceProps {
  doc: StoredDocument;
  onUpdateDoc: (updated: StoredDocument) => Promise<void>;
  onBack: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onNotify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message?: string) => void;
}

export const CodeTextWorkspace: React.FC<CodeTextWorkspaceProps> = ({
  doc,
  onUpdateDoc,
  onBack,
  isDark,
  onToggleTheme,
  onNotify,
}) => {
  const [text, setText] = useState('');
  const [showPreview, setShowPreview] = useState(doc.ext === 'html');
  const [validationMsg, setValidationMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  const saveTimerRef = useRef<number | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    const initial =
      typeof doc.workingDraft === 'string'
        ? doc.workingDraft
        : new TextDecoder().decode(doc.originalData);
    setText(initial);
    setShowPreview(doc.ext === 'html');
    setValidationMsg(null);
  }, [doc.id]);

  const handleChange = (next: string) => {
    setText(next);
    setSaveStatus('saving');
    if (doc.ext === 'json') {
      try {
        JSON.parse(next);
        setValidationMsg({ ok: true, text: 'Valid JSON syntax' });
      } catch (err) {
        setValidationMsg({
          ok: false,
          text: err instanceof Error ? err.message : 'Invalid JSON',
        });
      }
    } else if (doc.ext === 'xml') {
      const parsed = new DOMParser().parseFromString(next, 'application/xml');
      const errNode = parsed.querySelector('parsererror');
      setValidationMsg(
        errNode
          ? { ok: false, text: errNode.textContent?.slice(0, 120) || 'Invalid XML' }
          : { ok: true, text: 'Valid XML structure' }
      );
    }

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await onUpdateDoc({ ...docRef.current, workingDraft: next, lastModified: Date.now() });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    }, 450);
  };

  const formatCode = (minify = false) => {
    if (doc.ext === 'json') {
      try {
        const parsed = JSON.parse(text);
        handleChange(JSON.stringify(parsed, null, minify ? 0 : 2));
        onNotify('success', minify ? 'JSON Minified' : 'JSON Formatted');
      } catch (err) {
        onNotify('error', 'Invalid JSON', err instanceof Error ? err.message : 'Cannot format invalid JSON.');
      }
    }
  };

  const exportOptions: ExportOption[] = [
    {
      label: `Download .${doc.ext.toUpperCase()}`,
      description: 'Native edited file',
      onClick: () => {
        const mimeMap: Record<string, string> = {
          txt: 'text/plain;charset=utf-8',
          html: 'text/html;charset=utf-8',
          json: 'application/json;charset=utf-8',
          xml: 'application/xml;charset=utf-8',
        };
        downloadBlob(new Blob([text], { type: mimeMap[doc.ext] || 'text/plain' }), doc.name);
      },
    },
    {
      label: 'Export as PDF (.pdf)',
      description: doc.ext === 'html' ? 'Renders styled HTML page into PDF' : 'Clean monospaced/prose PDF',
      onClick: async () => {
        const pdf =
          doc.ext === 'html'
            ? await htmlToPdfBytes(text)
            : await plainTextToPdf(text, {
                title: doc.name,
                monospace: doc.ext === 'json' || doc.ext === 'xml',
              });
        downloadBuffer(pdf, replaceFileExtension(doc.name, 'pdf'), 'application/pdf');
      },
    },
    ...(doc.ext === 'txt' || doc.ext === 'html'
      ? [
          {
            label: 'Export as Word (.docx)',
            onClick: async () => {
              const html =
                doc.ext === 'html'
                  ? text
                  : text
                      .split('\n')
                      .map((l) => `<p>${l}</p>`)
                      .join('');
              const buf = await htmlToDocxBuffer(html);
              downloadBuffer(
                buf,
                replaceFileExtension(doc.name, 'docx'),
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              );
            },
          },
        ]
      : []),
  ];

  const linesCount = text.split('\n').length;

  const toolbar = (
    <div className="flex items-center gap-2 min-w-max">
      {doc.ext === 'html' && (
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
            showPreview
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {showPreview ? <Code2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{showPreview ? 'Split Preview On' : 'Show Live Preview'}</span>
        </button>
      )}

      {doc.ext === 'json' && (
        <>
          <button
            type="button"
            onClick={() => formatCode(false)}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Format JSON
          </button>
          <button
            type="button"
            onClick={() => formatCode(true)}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Minify
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => setFindOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
          findOpen
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Find & Replace</span>
      </button>

      <span className="text-xs text-slate-400 dark:text-slate-500 font-mono tabular-nums ml-2">
        {linesCount} lines · {text.length} chars
      </span>

      {validationMsg && (
        <span
          className={`text-xs font-medium ml-2 ${
            validationMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {validationMsg.text}
        </span>
      )}
    </div>
  );

  return (
    <EditorShell
      title={doc.name}
      formatLabel={`${doc.ext.toUpperCase()} File`}
      onRename={(newName) => onUpdateDoc({ ...doc, name: newName, lastModified: Date.now() })}
      onBack={onBack}
      saveStatus={saveStatus}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      onResetOriginal={() => {
        const orig = new TextDecoder().decode(doc.originalData);
        handleChange(orig);
        onNotify('info', 'Reverted to original file');
      }}
      exportOptions={exportOptions}
      toolbar={toolbar}
    >
      {findOpen && (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find..."
            className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
          <input
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace with..."
            className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={() => {
              if (!findQuery) return;
              handleChange(text.split(findQuery).join(replaceQuery));
              onNotify('success', 'Replaced all occurrences');
            }}
            className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            Replace All
          </button>
        </div>
      )}

      <div className={`h-full grid ${showPreview && doc.ext === 'html' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck={doc.ext === 'txt'}
          className={`w-full h-full min-h-[500px] p-5 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 outline-none resize-none leading-relaxed ${
            doc.ext === 'txt' ? 'font-sans text-sm' : 'font-mono text-xs'
          }`}
        />

        {showPreview && doc.ext === 'html' && (
          <div className="border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white h-full">
            <iframe
              title="HTML Preview"
              sandbox=""
              srcDoc={text}
              className="w-full h-full min-h-[500px] bg-white"
            />
          </div>
        )}
      </div>
    </EditorShell>
  );
};
