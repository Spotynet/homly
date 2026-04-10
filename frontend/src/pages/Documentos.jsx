/**
 * Documentos — Módulo de publicación y gestión de documentos del condominio.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import {
  Folder, FileText, File, Image, FilePlus2,
  Upload, Plus, Pencil, Trash2, Eye, EyeOff, Copy,
  Search, X, Settings2, BookTemplate,
  Download, Printer, Lock, Globe, RefreshCw, AlignJustify,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { documentsAPI } from '../api/client';

// ── Quill: register HR blot + font/size attributors (module level, once) ───────

const BlockEmbed = Quill.import('blots/block/embed');
class DividerBlot extends BlockEmbed {
  static create() { return super.create(); }
}
DividerBlot.blotName = 'divider';
DividerBlot.tagName = 'hr';
Quill.register(DividerBlot);

let _quillReady = false;
function ensureQuillReady() {
  if (_quillReady) return;
  _quillReady = true;
  const Font = Quill.import('attributors/style/font');
  Font.whitelist = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Garamond'];
  Quill.register(Font, true);
  const Size = Quill.import('attributors/style/size');
  Size.whitelist = ['8pt','9pt','10pt','11pt','12pt','14pt','16pt','18pt','20pt','24pt','28pt','32pt','36pt','48pt','72pt'];
  Quill.register(Size, true);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES_ES = {
  admin:    'Administrador',
  tesorero: 'Tesorero',
  auditor:  'Auditor',
  vecino:   'Vecino / Residente',
};
const ROLE_ORDER = ['admin', 'tesorero', 'auditor', 'vecino'];

const MIME_ICONS = {
  'application/pdf':   { icon: FileText, color: '#e84040', label: 'PDF' },
  'image/png':         { icon: Image,    color: '#0d7c6e', label: 'Imagen' },
  'image/jpeg':        { icon: Image,    color: '#0d7c6e', label: 'Imagen' },
  'image/gif':         { icon: Image,    color: '#0d7c6e', label: 'Imagen' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                       { icon: FileText, color: '#2563eb', label: 'Word' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                       { icon: FileText, color: '#16a34a', label: 'Excel' },
  'application/msword':      { icon: FileText, color: '#2563eb', label: 'Word' },
  'application/vnd.ms-excel':{ icon: FileText, color: '#16a34a', label: 'Excel' },
};
function getMimeInfo(m) { return MIME_ICONS[m] || { icon: File, color: '#6b7280', label: 'Archivo' }; }
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

const DEFAULT_PERMISSIONS = {
  admin:    { read: true,  write: true,  delete: true  },
  tesorero: { read: true,  write: true,  delete: false },
  auditor:  { read: true,  write: false, delete: false },
  vecino:   { read: true,  write: false, delete: false },
};

// ── Toolbar Button (defined at module level to avoid re-creation) ─────────────

function ToolBtn({ onExec, title, children }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onExec(); }}
      style={{
        background: 'none', border: '1px solid transparent', borderRadius: 4,
        padding: '3px 6px', cursor: 'pointer', color: 'var(--ink-600)',
        fontSize: 13, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--sand-100)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
    >
      {children}
    </button>
  );
}

function ToolSep() {
  return <div style={{ width: 1, height: 20, background: 'var(--sand-200)', margin: '0 2px', flexShrink: 0 }} />;
}

// ── Category Modal ────────────────────────────────────────────────────────────

const CAT_ICONS = ['📁','📂','📄','📋','📊','📑','🗂️','📰','📜','🔖','🏛️','⚖️','🔑','🏗️','🛡️'];

function CategoryModal({ cat, onClose, onSave }) {
  const [form, setForm] = useState({
    name:        cat?.name        || '',
    description: cat?.description || '',
    icon:        cat?.icon        || '📁',
    color:       cat?.color       || '#0d7c6e',
    order:       cat?.order       ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Ingresa un nombre para la categoría'); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error al guardar la categoría'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <h3><Folder size={16} style={{ display:'inline', verticalAlign:-3, marginRight:6 }} />
            {cat ? 'Editar Categoría' : 'Nueva Categoría'}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="field">
            <label className="field-label">Nombre *</label>
            <input className="field-input" value={form.name} autoFocus
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej. Reglamentos, Actas de Asamblea…"
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
          </div>
          <div className="field">
            <label className="field-label">Descripción</label>
            <input className="field-input" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción breve (opcional)" />
          </div>
          <div style={{ display:'flex', gap:14 }}>
            <div className="field" style={{ flex:1 }}>
              <label className="field-label">Ícono</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:4 }}>
                {CAT_ICONS.map(ic => (
                  <button key={ic} type="button"
                    onClick={() => setForm(f => ({ ...f, icon: ic }))}
                    style={{
                      fontSize: 20,
                      background: form.icon === ic ? 'var(--teal-50)' : 'transparent',
                      border: form.icon === ic ? '2px solid var(--teal-400)' : '2px solid transparent',
                      borderRadius: 6, padding: '2px 4px', cursor: 'pointer',
                    }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="field-label">Color</label>
              <input type="color" value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                style={{ width:'100%', height:36, borderRadius:6,
                  border:'1px solid var(--sand-200)', cursor:'pointer', padding:2 }} />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 100 }}>
            <label className="field-label">Orden</label>
            <input type="number" className="field-input" value={form.order} min={0}
              onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Guardando…' : (cat ? 'Guardar cambios' : 'Crear categoría')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Permissions Modal ─────────────────────────────────────────────────────────

function PermissionsModal({ permissions, onClose, onSave }) {
  const [perms, setPerms] = useState({
    ...DEFAULT_PERMISSIONS,
    ...(permissions || {}),
  });
  const [saving, setSaving] = useState(false);

  const toggle = (role, action) =>
    setPerms(prev => ({ ...prev, [role]: { ...prev[role], [action]: !prev[role][action] } }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(perms); onClose(); }
    catch { toast.error('Error al guardar permisos'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-head">
          <h3><Lock size={15} style={{ display:'inline', verticalAlign:-2, marginRight:6 }} />Permisos del Documento</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize:13, color:'var(--ink-500)', marginBottom:14 }}>
            Define qué roles pueden leer, editar o eliminar este documento.
          </p>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--sand-100)' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Rol</th>
                {['read','write','delete'].map(a => (
                  <th key={a} style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>
                    {a === 'read' ? 'Lectura' : a === 'write' ? 'Escritura' : 'Eliminación'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_ORDER.map(role => (
                <tr key={role} style={{ borderBottom:'1px solid var(--sand-200)' }}>
                  <td style={{ padding:'10px 12px', fontWeight:600, color:'var(--ink-700)' }}>
                    {ROLES_ES[role]}
                  </td>
                  {['read','write','delete'].map(action => (
                    <td key={action} style={{ padding:'10px 12px', textAlign:'center' }}>
                      {role === 'admin' ? (
                        <span style={{ color:'var(--teal-500)', fontSize:16 }}>✓</span>
                      ) : (
                        <input type="checkbox"
                          checked={!!perms[role]?.[action]}
                          onChange={() => toggle(role, action)}
                          style={{ width:16, height:16, cursor:'pointer', accentColor:'var(--teal-500)' }} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize:11, color:'var(--ink-400)', marginTop:10 }}>
            * El Administrador siempre tiene acceso completo.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Guardando…' : 'Guardar permisos'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ editingDoc, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    title:       editingDoc?.title       || '',
    description: editingDoc?.description || '',
    category:    editingDoc?.category    || '',
    is_template: editingDoc?.is_template || false,
    published:   editingDoc?.published   ?? true,
    permissions: editingDoc?.permissions || { ...DEFAULT_PERMISSIONS },
  });
  const [file, setFile]           = useState(null);
  const [showPerms, setShowPerms] = useState(false);
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef();

  const handleFile = f => {
    if (!f) return;
    setFile(f);
    if (!form.title) setForm(p => ({ ...p, title: f.name.replace(/\.[^.]+$/, '') }));
  };

  const handleDrop = e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

  const handleSave = () => {
    if (!editingDoc && !file) { toast.error('Selecciona un archivo'); return; }
    if (!form.title.trim())   { toast.error('Ingresa un título');     return; }
    setSaving(true);

    const finish = async (b64, fileName, fileMime, fileSize) => {
      try {
        const payload = {
          ...form,
          category:  form.category || null,
          doc_type:  'file',
          file_name: fileName,
          file_mime: fileMime,
          file_size: fileSize,
        };
        if (b64) payload.file_data = b64;
        await onSave(payload);
        onClose();
      } catch (err) {
        toast.error(err?.response?.data?.detail || 'Error al guardar el documento');
      } finally {
        setSaving(false);
      }
    };

    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const b64 = ev.target.result.split(',')[1];
        finish(b64, file.name, file.type, file.size);
      };
      reader.onerror = () => { toast.error('No se pudo leer el archivo'); setSaving(false); };
      reader.readAsDataURL(file);
    } else {
      // editing without changing file
      finish(null, editingDoc.file_name, editingDoc.file_mime, editingDoc.file_size);
    }
  };

  const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.gif,.docx,.doc,.xlsx,.xls';

  return (
    <>
      <div className="modal-bg open" onClick={onClose}>
        <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 530 }}>
          <div className="modal-head">
            <h3><Upload size={15} style={{ display:'inline', verticalAlign:-2, marginRight:6 }} />
              {editingDoc ? 'Editar Archivo' : 'Subir Archivo'}
            </h3>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
          <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Drop zone */}
            <div
              onDrop={handleDrop} onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${file ? 'var(--teal-400)' : 'var(--sand-300)'}`,
                borderRadius: 10, padding: '22px 16px', textAlign: 'center',
                cursor: 'pointer', background: file ? 'var(--teal-50)' : 'var(--sand-50)',
                transition: 'all .2s',
              }}>
              <input ref={fileRef} type="file" accept={ACCEPTED} style={{ display:'none' }}
                onChange={e => handleFile(e.target.files[0])} />
              {file ? (
                <div style={{ color:'var(--teal-700)', fontWeight:600, fontSize:14 }}>
                  <File size={26} style={{ display:'block', margin:'0 auto 8px', color:'var(--teal-500)' }} />
                  {file.name}
                  <span style={{ fontWeight:400, color:'var(--ink-400)', fontSize:12 }}>
                    {' '}({fmtSize(file.size)})
                  </span>
                </div>
              ) : editingDoc?.file_name ? (
                <div style={{ color:'var(--ink-500)', fontSize:13 }}>
                  <File size={24} style={{ display:'block', margin:'0 auto 8px', color:'var(--ink-300)' }} />
                  Archivo actual: <strong>{editingDoc.file_name}</strong>
                  <div style={{ fontSize:11, marginTop:4 }}>Clic para reemplazar</div>
                </div>
              ) : (
                <div style={{ color:'var(--ink-400)', fontSize:13 }}>
                  <Upload size={26} style={{ display:'block', margin:'0 auto 8px', color:'var(--ink-300)' }} />
                  Arrastra un archivo aquí o <strong style={{ color:'var(--teal-600)' }}>haz clic para seleccionar</strong>
                  <div style={{ marginTop:6, fontSize:11 }}>PDF, imagen, Word, Excel</div>
                </div>
              )}
            </div>

            <div className="field">
              <label className="field-label">Título *</label>
              <input className="field-input" value={form.title} autoFocus={!!editingDoc}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Nombre del documento" />
            </div>
            <div className="field">
              <label className="field-label">Descripción</label>
              <input className="field-input" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Descripción breve (opcional)" />
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <div className="field" style={{ flex:1 }}>
                <label className="field-label">Categoría</label>
                <select className="field-input" value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="">Sin categoría</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex:1 }}>
                <label className="field-label">Estado</label>
                <select className="field-input" value={form.published ? 'published' : 'draft'}
                  onChange={e => setForm(p => ({ ...p, published: e.target.value === 'published' }))}>
                  <option value="published">Publicado</option>
                  <option value="draft">Borrador</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <input type="checkbox" id="tmpl_upload" checked={form.is_template}
                onChange={e => setForm(p => ({ ...p, is_template: e.target.checked }))}
                style={{ width:15, height:15, accentColor:'var(--teal-500)', cursor:'pointer' }} />
              <label htmlFor="tmpl_upload" style={{ fontSize:13, cursor:'pointer', color:'var(--ink-700)' }}>
                Usar como plantilla reutilizable
              </label>
            </div>
            <button className="btn btn-secondary" style={{ alignSelf:'flex-start', fontSize:12 }}
              onClick={() => setShowPerms(true)}>
              <Settings2 size={13} style={{ display:'inline', verticalAlign:-2, marginRight:4 }} />
              Configurar permisos
            </button>
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Guardando…' : (editingDoc ? 'Guardar cambios' : 'Subir archivo')}
            </button>
          </div>
        </div>
      </div>

      {showPerms && (
        <PermissionsModal
          permissions={form.permissions}
          onClose={() => setShowPerms(false)}
          onSave={async p => { setForm(f => ({ ...f, permissions: p })); }}
        />
      )}
    </>
  );
}

// ── Document Editor Modal (Word-like, powered by Quill) ───────────────────────

function DocumentEditorModal({ doc, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    title:       doc?.title       || '',
    description: doc?.description || '',
    category:    doc?.category    || '',
    is_template: doc?.is_template || false,
    published:   doc?.published   ?? true,
    permissions: doc?.permissions || { ...DEFAULT_PERMISSIONS },
  });
  const [showPerms,      setShowPerms]      = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [wordCount,      setWordCount]      = useState(0);
  const [showTableDlg,   setShowTableDlg]   = useState(false);
  const [tableRows,      setTableRows]      = useState(3);
  const [tableCols,      setTableCols]      = useState(3);

  const editorRef  = useRef(null);
  const toolbarRef = useRef(null);
  const quillRef   = useRef(null);

  // Initialize Quill once on mount
  useEffect(() => {
    ensureQuillReady();
    if (!editorRef.current || quillRef.current) return;

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: {
          container: toolbarRef.current,
          handlers: {
            divider: function () {
              const range = this.quill.getSelection(true);
              this.quill.insertEmbed(range.index, 'divider', true, 'user');
              this.quill.setSelection(range.index + 1, 'user');
            },
            table: function () {
              setShowTableDlg(true);
            },
          },
        },
      },
      placeholder: 'Comienza a escribir tu documento...',
    });

    quillRef.current = quill;

    // Load existing content
    if (doc?.content) {
      quill.clipboard.dangerouslyPasteHTML(doc.content);
      // Initial word count
      const txt = quill.getText().trim();
      setWordCount(txt ? txt.split(/\s+/).filter(Boolean).length : 0);
    }

    quill.on('text-change', () => {
      const txt = quill.getText().trim();
      setWordCount(txt ? txt.split(/\s+/).filter(Boolean).length : 0);
    });

    return () => { quillRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const insertTable = () => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true) || { index: 0 };
    const trs = Array.from({ length: tableRows }, () =>
      `<tr>${Array.from({ length: tableCols }, () =>
        `<td style="border:1px solid #d1d5db;padding:6px 10px;min-width:80px;">&nbsp;</td>`
      ).join('')}</tr>`
    ).join('');
    const html = `<table style="border-collapse:collapse;width:100%;margin:12px 0;">${trs}</table>`;
    quill.clipboard.dangerouslyPasteHTML(range.index, html);
    setShowTableDlg(false);
  };

  const handlePrint = () => {
    const content = quillRef.current?.root.innerHTML || '';
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${form.title || 'Documento'}</title>
      <style>
        body{font-family:Georgia,"Times New Roman",serif;padding:48px 64px;max-width:800px;margin:0 auto;line-height:1.75;color:#1a1a1a;font-size:12pt;}
        h1{font-size:22pt;font-weight:700;margin:18px 0 8px;}h2{font-size:17pt;font-weight:700;margin:16px 0 6px;}
        h3{font-size:13pt;font-weight:700;margin:14px 0 5px;}h4{font-size:12pt;font-weight:700;}
        table{border-collapse:collapse;width:100%;margin:12px 0;}
        td,th{border:1px solid #d1d5db;padding:6px 10px;}
        blockquote{border-left:4px solid #d1d5db;padding-left:16px;color:#6b7280;margin:10px 0;}
        pre{background:#f5f5f5;padding:12px 16px;border-radius:4px;font-family:'Courier New',monospace;}
        img{max-width:100%;border-radius:4px;}
        hr{border:none;border-top:2px solid #e5e7eb;margin:16px 0;}
        a{color:#0d7c6e;}
        @page{margin:20mm;}
      </style>
    </head><body>${content}</body></html>`);
    win.document.close();
    const doPrint = () => { win.focus(); win.print(); win.close(); };
    if (win.document.readyState === 'complete') doPrint();
    else win.addEventListener('load', doPrint);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Ingresa un título'); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        category: form.category || null,
        doc_type: 'richtext',
        content:  quillRef.current?.root.innerHTML || '',
      });
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al guardar el documento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* ── Full-screen overlay ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,23,42,0.6)',
        display: 'flex', padding: 12,
      }}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: 'white', borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}>

          {/* ── Title bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', background: 'var(--teal-700)',
            color: 'white', flexWrap: 'wrap', flexShrink: 0,
          }}>
            <FilePlus2 size={16} style={{ flexShrink: 0, opacity: 0.85 }} />

            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Título del documento *"
              style={{
                flex: '2 1 180px', height: 30, padding: '0 10px',
                borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.15)', color: 'white',
                fontSize: 13, fontWeight: 600, outline: 'none',
              }}
            />
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Descripción (opcional)"
              style={{
                flex: '2 1 150px', height: 30, padding: '0 10px',
                borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)', color: 'white',
                fontSize: 12, outline: 'none',
              }}
            />
            <select
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              style={{
                height: 30, padding: '0 7px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)', color: 'white',
                fontSize: 12, minWidth: 120, cursor: 'pointer',
              }}
            >
              <option value="" style={{ color: '#1a1a1a', background: 'white' }}>Sin categoría</option>
              {categories.map(c => (
                <option key={c.id} value={c.id} style={{ color: '#1a1a1a', background: 'white' }}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <select
              value={form.published ? 'pub' : 'draft'}
              onChange={e => setForm(p => ({ ...p, published: e.target.value === 'pub' }))}
              style={{
                height: 30, padding: '0 7px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)', color: 'white',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              <option value="pub"   style={{ color: '#1a1a1a', background: 'white' }}>Publicado</option>
              <option value="draft" style={{ color: '#1a1a1a', background: 'white' }}>Borrador</option>
            </select>

            {/* Right-side actions */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {[
                { label: 'Permisos', icon: <Lock size={12} />,    action: () => setShowPerms(true) },
                { label: 'Imprimir / PDF', icon: <Printer size={12} />, action: handlePrint },
              ].map(({ label, icon, action }) => (
                <button key={label} onClick={action} style={{
                  background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white', borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {icon} {label}
                </button>
              ))}
              <button onClick={handleSave} disabled={saving} style={{
                background: 'white', border: 'none',
                color: 'var(--teal-700)', borderRadius: 6, padding: '4px 14px', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Guardando…' : (doc ? 'Guardar cambios' : 'Publicar')}
              </button>
              <button onClick={onClose} style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                color: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
              }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* ── Quill Toolbar (rendered before editor, ref passed to Quill) ── */}
          <div ref={toolbarRef} style={{ flexShrink: 0 }}>
            <span className="ql-formats">
              <select className="ql-header" defaultValue="">
                <option value="1">Título 1</option>
                <option value="2">Título 2</option>
                <option value="3">Título 3</option>
                <option value="4">Título 4</option>
                <option value="5">Título 5</option>
                <option value="">Párrafo</option>
              </select>
            </span>
            <span className="ql-formats">
              <select className="ql-font" defaultValue="">
                <option value="">Predeterminada</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
                <option value="Trebuchet MS">Trebuchet MS</option>
                <option value="Garamond">Garamond</option>
              </select>
              <select className="ql-size" defaultValue="">
                <option value="8pt">8</option>
                <option value="9pt">9</option>
                <option value="10pt">10</option>
                <option value="11pt">11</option>
                <option value="12pt" selected>12</option>
                <option value="14pt">14</option>
                <option value="16pt">16</option>
                <option value="18pt">18</option>
                <option value="20pt">20</option>
                <option value="24pt">24</option>
                <option value="28pt">28</option>
                <option value="32pt">32</option>
                <option value="36pt">36</option>
                <option value="48pt">48</option>
                <option value="72pt">72</option>
              </select>
            </span>
            <span className="ql-formats">
              <button className="ql-bold"      title="Negrita (Ctrl+B)" />
              <button className="ql-italic"    title="Cursiva (Ctrl+I)" />
              <button className="ql-underline" title="Subrayado (Ctrl+U)" />
              <button className="ql-strike"    title="Tachado" />
            </span>
            <span className="ql-formats">
              <select className="ql-color"      title="Color de texto" />
              <select className="ql-background" title="Color de resaltado" />
            </span>
            <span className="ql-formats">
              <button className="ql-script" value="sub"   title="Subíndice" />
              <button className="ql-script" value="super" title="Superíndice" />
            </span>
            <span className="ql-formats">
              <select className="ql-align" title="Alineación" />
            </span>
            <span className="ql-formats">
              <button className="ql-list" value="ordered" title="Lista numerada" />
              <button className="ql-list" value="bullet"  title="Lista de viñetas" />
              <button className="ql-indent" value="-1"    title="Reducir sangría" />
              <button className="ql-indent" value="+1"    title="Aumentar sangría" />
            </span>
            <span className="ql-formats">
              <button className="ql-link"  title="Insertar enlace" />
              <button className="ql-image" title="Insertar imagen" />
            </span>
            <span className="ql-formats">
              <button className="ql-blockquote"  title="Cita" />
              <button className="ql-code-block"  title="Bloque de código" />
            </span>
            <span className="ql-formats">
              <button className="ql-table"   title="Insertar tabla" style={{ fontWeight: 700, fontSize: 13 }}>⊞</button>
              <button className="ql-divider" title="Línea horizontal" style={{ fontWeight: 700, fontSize: 13 }}>—</button>
            </span>
            <span className="ql-formats">
              <button className="ql-clean" title="Limpiar formato" />
            </span>
          </div>

          {/* ── Gray canvas + white A4 page ── */}
          <div className="doc-editor-canvas" style={{ flex: 1, overflow: 'auto', padding: '28px 40px' }}>
            <div className="doc-editor-page">
              <div ref={editorRef} />
            </div>
          </div>

          {/* ── Status bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '5px 16px', flexShrink: 0,
            background: 'var(--sand-50)', borderTop: '1px solid var(--sand-200)',
            fontSize: 12, color: 'var(--ink-500)',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_template}
                onChange={e => setForm(p => ({ ...p, is_template: e.target.checked }))}
                style={{ width: 13, height: 13, accentColor: 'var(--teal-500)', cursor: 'pointer' }}
              />
              Guardar como plantilla
            </label>
            <span style={{ marginLeft: 'auto' }}>
              {wordCount} {wordCount === 1 ? 'palabra' : 'palabras'}
            </span>
          </div>
        </div>
      </div>

      {/* Permissions modal */}
      {showPerms && (
        <PermissionsModal
          permissions={form.permissions}
          onClose={() => setShowPerms(false)}
          onSave={async p => { setForm(f => ({ ...f, permissions: p })); }}
        />
      )}

      {/* Table insertion dialog */}
      {showTableDlg && (
        <div className="modal-bg open" style={{ zIndex: 3000 }} onClick={() => setShowTableDlg(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 290 }}>
            <div className="modal-head">
              <h3>Insertar tabla</h3>
              <button className="modal-close" onClick={() => setShowTableDlg(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', gap: 16 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="field-label">Filas</label>
                <input type="number" className="field-input" value={tableRows} min={1} max={30}
                  onChange={e => setTableRows(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="field-label">Columnas</label>
                <input type="number" className="field-input" value={tableCols} min={1} max={15}
                  onChange={e => setTableCols(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowTableDlg(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={insertTable}>Insertar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Document Viewer Modal ─────────────────────────────────────────────────────

function DocumentViewerModal({ doc, onClose }) {
  if (!doc) return null;
  const isPdf  = doc.file_mime === 'application/pdf';
  const isImg  = doc.file_mime?.startsWith('image/');
  const isRich = doc.doc_type === 'richtext';

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    let css = '';
    Array.from(document.styleSheets).forEach(s => {
      try { Array.from(s.cssRules || []).forEach(r => { css += r.cssText + '\n'; }); } catch (_) {}
    });
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${doc.title}</title>
      <style>${css} body{font-family:Georgia,serif;padding:40px;} img{max-width:100%;} @page{margin:20mm;}</style>
      </head><body>${doc.content || ''}</body></html>`);
    win.document.close();
    const doPrint = () => { win.focus(); win.print(); win.close(); };
    if (win.document.readyState === 'complete') doPrint();
    else win.addEventListener('load', doPrint);
  };

  const handleDownload = () => {
    if (!doc.file_data) return;
    const a = document.createElement('a');
    a.href = `data:${doc.file_mime};base64,${doc.file_data}`;
    a.download = doc.file_name || doc.title;
    a.click();
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div
        className="modal lg"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: isRich ? 780 : 880, width:'97vw', maxHeight:'92vh',
          display:'flex', flexDirection:'column' }}>

        <div className="modal-head">
          <h3 style={{ fontSize:15, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
            {doc.title}
          </h3>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {isRich && (
              <button className="btn btn-secondary btn-sm" onClick={handlePrint}
                style={{ display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
                <Printer size={13} /> Imprimir / PDF
              </button>
            )}
            {doc.file_data && (
              <button className="btn btn-secondary btn-sm" onClick={handleDownload}
                style={{ display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
                <Download size={13} /> Descargar
              </button>
            )}
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ flex:1, overflow:'auto', padding: isRich ? '20px 32px' : 16 }}>
          {isPdf && doc.file_data && (
            <iframe
              src={`data:application/pdf;base64,${doc.file_data}`}
              style={{ width:'100%', height:'72vh', border:'none', borderRadius:6 }}
              title={doc.title}
            />
          )}
          {isImg && doc.file_data && (
            <div style={{ textAlign:'center' }}>
              <img src={`data:${doc.file_mime};base64,${doc.file_data}`}
                alt={doc.title} style={{ maxWidth:'100%', borderRadius:8 }} />
            </div>
          )}
          {isRich && (
            <div
              style={{
                fontFamily: 'Georgia,"Times New Roman",serif',
                fontSize: 15, lineHeight: 1.75, color: 'var(--ink-800)',
              }}
              dangerouslySetInnerHTML={{ __html: doc.content || '' }}
            />
          )}
          {!isPdf && !isImg && !isRich && (
            <div style={{ textAlign:'center', padding:48 }}>
              <File size={52} style={{ color:'var(--ink-300)', display:'block', margin:'0 auto 16px' }} />
              <p style={{ color:'var(--ink-500)', marginBottom:20 }}>
                Vista previa no disponible para este tipo de archivo.
              </p>
              {doc.file_data && (
                <button className="btn btn-primary" onClick={handleDownload}>
                  <Download size={14} style={{ display:'inline', verticalAlign:-2, marginRight:6 }} />
                  Descargar archivo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocumentCard({ doc, userRole, onView, onEdit, onDelete, onTogglePublished, onDuplicate }) {
  const isAdmin   = userRole === 'admin';
  const rp        = (doc.permissions || {})[userRole] || {};
  const canWrite  = isAdmin || rp.write;
  const canDelete = isAdmin || rp.delete;
  const isRich    = doc.doc_type === 'richtext';
  const mInfo     = getMimeInfo(doc.file_mime);
  const DocIcon   = isRich ? FileText : mInfo.icon;
  const iconColor = isRich ? '#7c3aed' : mInfo.color;

  return (
    <div
      style={{
        background: 'white', border: '1px solid var(--sand-200)', borderRadius: 10,
        padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; }}>

      {/* Icon */}
      <div style={{
        width: 42, height: 42, borderRadius: 8,
        background: `${iconColor}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <DocIcon size={22} style={{ color: iconColor }} />
      </div>

      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
          <span style={{ fontWeight:700, fontSize:14, color:'var(--ink-800)', wordBreak:'break-word' }}>
            {doc.title}
          </span>
          {doc.is_template && (
            <span style={{ fontSize:10, fontWeight:700, background:'#fef3c7', color:'#92400e',
              padding:'1px 6px', borderRadius:99, flexShrink:0 }}>PLANTILLA</span>
          )}
          {!doc.published && (
            <span style={{ fontSize:10, fontWeight:700, background:'var(--sand-100)', color:'var(--ink-500)',
              padding:'1px 6px', borderRadius:99, flexShrink:0 }}>BORRADOR</span>
          )}
        </div>
        {doc.description && (
          <div style={{ fontSize:12, color:'var(--ink-500)', marginTop:3,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {doc.description}
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:5, fontSize:11, color:'var(--ink-400)', flexWrap:'wrap' }}>
          {doc.category_name && (
            <span style={{ display:'flex', alignItems:'center', gap:3 }}>
              <Folder size={11} /> {doc.category_name}
            </span>
          )}
          <span>{isRich ? 'Texto enriquecido' : `${mInfo.label}${doc.file_size ? ' · ' + fmtSize(doc.file_size) : ''}`}</span>
          <span>{fmtDate(doc.created_at)}</span>
          {doc.created_by_name && <span>por {doc.created_by_name}</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:4, flexShrink:0, alignItems:'center' }}>
        <button className="btn btn-secondary btn-sm" title="Ver documento"
          onClick={() => onView(doc)} style={{ padding:'4px 8px' }}>
          <Eye size={14} />
        </button>
        {canWrite && (
          <button className="btn btn-secondary btn-sm" title="Editar"
            onClick={() => onEdit(doc)} style={{ padding:'4px 8px' }}>
            <Pencil size={14} />
          </button>
        )}
        {isAdmin && (
          <>
            <button className="btn btn-secondary btn-sm"
              title={doc.published ? 'Despublicar' : 'Publicar'}
              onClick={() => onTogglePublished(doc)} style={{ padding:'4px 8px' }}>
              {doc.published ? <EyeOff size={14} /> : <Globe size={14} />}
            </button>
            <button className="btn btn-secondary btn-sm" title="Duplicar"
              onClick={() => onDuplicate(doc)} style={{ padding:'4px 8px' }}>
              <Copy size={14} />
            </button>
          </>
        )}
        {canDelete && (
          <button className="btn btn-secondary btn-sm" title="Eliminar"
            onClick={() => onDelete(doc)}
            style={{ padding:'4px 8px', color:'var(--coral-600)' }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Documentos() {
  const { tenantId, user } = useAuth();
  const userRole  = user?.role === 'superadmin' ? 'admin' : (user?.role || 'vecino');
  const isAdmin   = userRole === 'admin';
  const canCreate = ['admin', 'tesorero'].includes(userRole);

  const [categories,       setCategories]       = useState([]);
  const [docs,             setDocs]             = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedCat,      setSelectedCat]      = useState(null); // null=all | 'templates' | uuid
  const [search,           setSearch]           = useState('');
  const [showUpload,       setShowUpload]       = useState(false);
  const [showEditor,       setShowEditor]       = useState(false);
  const [editingDoc,       setEditingDoc]       = useState(null);
  const [viewingDoc,       setViewingDoc]       = useState(null);
  const [catModal,         setCatModal]         = useState(null); // null | 'new' | cat-object
  const [deleteConfirm,    setDeleteConfirm]    = useState(null);

  // ── Load ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [catRes, docRes] = await Promise.all([
        documentsAPI.listCategories(tenantId),
        documentsAPI.list(tenantId, {}),
      ]);
      setCategories(catRes.data || []);
      setDocs(docRes.data || []);
    } catch {
      toast.error('Error al cargar los documentos');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered list ─────────────────────────────────────────

  const filteredDocs = docs.filter(d => {
    // Category filter
    if (selectedCat === 'templates') { if (!d.is_template) return false; }
    else if (selectedCat)            { if (d.category !== selectedCat) return false; }
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      return d.title.toLowerCase().includes(q) ||
             (d.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ── Category handlers ─────────────────────────────────────

  const handleCreateCategory = async data => {
    const res = await documentsAPI.createCategory(tenantId, data);
    setCategories(p => [...p, res.data]);
    toast.success('Categoría creada');
  };

  const handleUpdateCategory = async (id, data) => {
    const res = await documentsAPI.updateCategory(tenantId, id, data);
    setCategories(p => p.map(c => c.id === id ? res.data : c));
    toast.success('Categoría actualizada');
  };

  const handleDeleteCategory = async cat => {
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"?\nLos documentos quedarán sin categoría.`)) return;
    try {
      await documentsAPI.deleteCategory(tenantId, cat.id);
      setCategories(p => p.filter(c => c.id !== cat.id));
      if (selectedCat === cat.id) setSelectedCat(null);
      toast.success('Categoría eliminada');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al eliminar');
    }
  };

  // ── Document handlers ─────────────────────────────────────

  const handleSaveDoc = async data => {
    if (editingDoc) {
      const res = await documentsAPI.update(tenantId, editingDoc.id, data);
      setDocs(p => p.map(d => d.id === editingDoc.id ? res.data : d));
      toast.success('Documento actualizado');
    } else {
      const res = await documentsAPI.create(tenantId, data);
      setDocs(p => [res.data, ...p]);
      toast.success('Documento publicado');
    }
  };

  const handleEdit = async doc => {
    try {
      const res = await documentsAPI.get(tenantId, doc.id);
      setEditingDoc(res.data);
      if (res.data.doc_type === 'richtext') setShowEditor(true);
      else setShowUpload(true);
    } catch { toast.error('Error al cargar el documento'); }
  };

  const handleView = async doc => {
    try {
      const res = await documentsAPI.get(tenantId, doc.id);
      setViewingDoc(res.data);
    } catch { toast.error('Error al cargar el documento'); }
  };

  const handleDelete = async doc => {
    try {
      await documentsAPI.delete(tenantId, doc.id);
      setDocs(p => p.filter(d => d.id !== doc.id));
      setDeleteConfirm(null);
      toast.success('Documento eliminado');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al eliminar');
    }
  };

  const handleTogglePublished = async doc => {
    try {
      const res = await documentsAPI.togglePublished(tenantId, doc.id);
      setDocs(p => p.map(d => d.id === doc.id ? { ...d, published: res.data.published } : d));
      toast.success(res.data.published ? 'Documento publicado' : 'Guardado como borrador');
    } catch { toast.error('Error al cambiar estado'); }
  };

  const handleDuplicate = async doc => {
    try {
      const res = await documentsAPI.duplicate(tenantId, doc.id, { title: `Copia de ${doc.title}` });
      setDocs(p => [res.data, ...p]);
      toast.success('Documento duplicado');
    } catch { toast.error('Error al duplicar'); }
  };

  const totalDocs     = docs.length;
  const templateCount = docs.filter(d => d.is_template).length;

  // ── Render ────────────────────────────────────────────────

  return (
    // margin:-32px cancels .content padding; calc height = viewport - header (68px)
    <div style={{ display:'flex', height:'calc(100vh - 68px)', margin:'-32px', overflow:'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--sand-200)',
        background: 'var(--sand-50)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <div style={{ padding:'16px 12px 8px', fontWeight:800, fontSize:11,
          color:'var(--ink-400)', letterSpacing:'.06em', textTransform:'uppercase' }}>
          Categorías
        </div>

        {/* All */}
        <SidebarItem
          active={selectedCat === null}
          onClick={() => setSelectedCat(null)}
          icon={<Folder size={15} />}
          label="Todos los documentos"
          count={totalDocs}
        />

        {/* Templates */}
        <SidebarItem
          active={selectedCat === 'templates'}
          onClick={() => setSelectedCat('templates')}
          icon={<BookTemplate size={15} />}
          label="Plantillas"
          count={templateCount}
        />

        <div style={{ height:1, background:'var(--sand-200)', margin:'6px 0' }} />

        {/* Category list */}
        {categories.map(cat => (
          <div key={cat.id} style={{ display:'flex', alignItems:'center' }}>
            <SidebarItem
              active={selectedCat === cat.id}
              onClick={() => setSelectedCat(cat.id)}
              icon={<span style={{ fontSize:15, lineHeight:1 }}>{cat.icon}</span>}
              label={cat.name}
              count={cat.document_count}
              style={{ flex:1 }}
            />
            {isAdmin && (
              <div style={{ display:'flex', gap:1, paddingRight:6, flexShrink:0 }}>
                <button title="Editar categoría" onClick={() => setCatModal(cat)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:3, color:'var(--ink-400)' }}>
                  <Pencil size={11} />
                </button>
                <button title="Eliminar categoría" onClick={() => handleDeleteCategory(cat)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:3, color:'var(--coral-500)' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        ))}

        {isAdmin && (
          <button onClick={() => setCatModal('new')}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 14px',
              background:'transparent', border:'none', cursor:'pointer',
              fontSize:12, color:'var(--teal-600)', fontWeight:600, marginTop:4 }}>
            <Plus size={13} /> Nueva categoría
          </button>
        )}
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Top bar */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--sand-200)',
          background:'white', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>

          <div style={{ position:'relative', flex:1, minWidth:180 }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%',
              transform:'translateY(-50%)', color:'var(--ink-400)', pointerEvents:'none' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar documentos…"
              style={{ width:'100%', paddingLeft:30, height:34, borderRadius:8,
                border:'1px solid var(--sand-300)', fontSize:13,
                background:'var(--sand-50)', outline:'none', boxSizing:'border-box' }} />
            {search && (
              <button onClick={() => setSearch('')}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', color:'var(--ink-400)', padding:0 }}>
                <X size={13} />
              </button>
            )}
          </div>

          <button className="btn btn-secondary btn-sm" onClick={loadData}
            style={{ display:'flex', alignItems:'center', gap:4 }}>
            <RefreshCw size={13} /> Actualizar
          </button>

          {canCreate && (
            <>
              <button className="btn btn-secondary"
                onClick={() => { setEditingDoc(null); setShowUpload(true); }}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Upload size={14} /> Subir archivo
              </button>
              <button className="btn btn-primary"
                onClick={() => { setEditingDoc(null); setShowEditor(true); }}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                <FilePlus2 size={14} /> Crear documento
              </button>
            </>
          )}
        </div>

        {/* Section label */}
        <div style={{ padding:'8px 20px', fontSize:12, fontWeight:700,
          color:'var(--ink-400)', textTransform:'uppercase', letterSpacing:'.05em',
          borderBottom:'1px solid var(--sand-100)', background:'var(--sand-50)' }}>
          {selectedCat === 'templates' ? 'Plantillas'
            : selectedCat ? (categories.find(c => c.id === selectedCat)?.name || 'Categoría')
            : 'Todos los documentos'}
          {' '}
          <span style={{ fontWeight:400, textTransform:'none', color:'var(--ink-300)' }}>
            ({filteredDocs.length})
          </span>
        </div>

        {/* Doc list */}
        <div style={{ flex:1, overflow:'auto', padding:'14px 20px',
          display:'flex', flexDirection:'column', gap:10 }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:48, color:'var(--ink-400)' }}>
              Cargando documentos…
            </div>
          ) : filteredDocs.length === 0 ? (
            <div style={{ textAlign:'center', padding:60 }}>
              <FileText size={40} style={{ color:'var(--ink-200)', display:'block', margin:'0 auto 12px' }} />
              <div style={{ fontWeight:600, color:'var(--ink-400)', marginBottom:6 }}>
                {search ? 'No se encontraron documentos' : 'No hay documentos aquí'}
              </div>
              {canCreate && !search && (
                <div style={{ fontSize:13, color:'var(--ink-300)' }}>
                  Usa <strong>Subir archivo</strong> o <strong>Crear documento</strong> para empezar.
                </div>
              )}
            </div>
          ) : (
            filteredDocs.map(doc => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                userRole={userRole}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={d => setDeleteConfirm(d)}
                onTogglePublished={handleTogglePublished}
                onDuplicate={handleDuplicate}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Modals ── */}

      {catModal && (
        <CategoryModal
          cat={catModal === 'new' ? null : catModal}
          onClose={() => setCatModal(null)}
          onSave={data =>
            catModal === 'new'
              ? handleCreateCategory(data)
              : handleUpdateCategory(catModal.id, data)
          }
        />
      )}

      {showUpload && (
        <UploadModal
          editingDoc={editingDoc}
          categories={categories}
          onClose={() => { setShowUpload(false); setEditingDoc(null); }}
          onSave={handleSaveDoc}
        />
      )}

      {showEditor && (
        <DocumentEditorModal
          doc={editingDoc}
          categories={categories}
          onClose={() => { setShowEditor(false); setEditingDoc(null); }}
          onSave={handleSaveDoc}
        />
      )}

      {viewingDoc && (
        <DocumentViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}

      {deleteConfirm && (
        <div className="modal-bg open" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
            <div className="modal-head">
              <h3>Eliminar documento</h3>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize:14, color:'var(--ink-600)' }}>
                ¿Eliminar <strong>"{deleteConfirm.title}"</strong>? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn btn-primary"
                style={{ background:'var(--coral-500)' }}
                onClick={() => handleDelete(deleteConfirm)}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sidebar Item (module-level) ───────────────────────────────────────────────

function SidebarItem({ active, onClick, icon, label, count, style: extraStyle }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 14px', width: '100%',
        background: active ? 'var(--teal-50)' : 'transparent',
        border: 'none', cursor: 'pointer', fontSize: 13,
        color: active ? 'var(--teal-700)' : 'var(--ink-600)',
        fontWeight: active ? 700 : 500,
        textAlign: 'left', minWidth: 0,
        ...extraStyle,
      }}>
      <span style={{ flexShrink:0 }}>{icon}</span>
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
        {label}
      </span>
      <span style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-400)', flexShrink:0 }}>
        {count}
      </span>
    </button>
  );
}
