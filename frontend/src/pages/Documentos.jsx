/**
 * Documentos — Módulo de publicación y gestión de documentos del condominio.
 *
 * Características:
 *  - Categorías/carpetas con permisos por rol
 *  - Subida de archivos (PDF, imágenes, Word, Excel)
 *  - Editor de texto enriquecido con exportación a PDF
 *  - Plantillas reutilizables
 *  - Control de permisos por rol (admin, tesorero, auditor, vecino)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Folder, FolderOpen, FileText, File, Image, FilePlus2,
  Upload, Plus, Pencil, Trash2, Eye, EyeOff, Copy,
  Search, X, ChevronRight, Settings2, BookTemplate,
  Download, Printer, Lock, Globe, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { documentsAPI } from '../api/client';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES_ES = {
  admin:    'Administrador',
  tesorero: 'Tesorero',
  auditor:  'Auditor',
  vecino:   'Vecino / Residente',
};

const ROLE_ORDER = ['admin', 'tesorero', 'auditor', 'vecino'];

const MIME_ICONS = {
  'application/pdf': { icon: FileText, color: '#e84040', label: 'PDF' },
  'image/png':       { icon: Image,    color: '#0d7c6e', label: 'Imagen' },
  'image/jpeg':      { icon: Image,    color: '#0d7c6e', label: 'Imagen' },
  'image/gif':       { icon: Image,    color: '#0d7c6e', label: 'Imagen' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                     { icon: FileText, color: '#2563eb', label: 'Word' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                     { icon: FileText, color: '#16a34a', label: 'Excel' },
  'application/msword':
                     { icon: FileText, color: '#2563eb', label: 'Word' },
  'application/vnd.ms-excel':
                     { icon: FileText, color: '#16a34a', label: 'Excel' },
};

function getMimeInfo(mime) {
  return MIME_ICONS[mime] || { icon: File, color: '#6b7280', label: 'Archivo' };
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DEFAULT_PERMISSIONS = {
  admin:    { read: true,  write: true,  delete: true  },
  tesorero: { read: true,  write: true,  delete: false },
  auditor:  { read: true,  write: false, delete: false },
  vecino:   { read: true,  write: false, delete: false },
};

// ── Category Modal ────────────────────────────────────────────────────────────

function CategoryModal({ cat, onClose, onSave }) {
  const [form, setForm] = useState({
    name:        cat?.name        || '',
    description: cat?.description || '',
    icon:        cat?.icon        || '📁',
    color:       cat?.color       || '#0d7c6e',
    order:       cat?.order       ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const ICONS = ['📁','📂','📄','📋','📊','📑','🗂️','📰','📜','🔖','🏛️','⚖️','🔑','🏗️','🛡️'];

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Ingresa un nombre para la categoría'); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch { toast.error('Error al guardar la categoría'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h3><Folder size={16} style={{ display:'inline', verticalAlign:-3, marginRight:6 }} />
            {cat ? 'Editar Categoría' : 'Nueva Categoría'}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="field">
            <label className="field-label">Nombre *</label>
            <input className="field-input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Reglamentos, Actas de Asamblea…" />
          </div>
          <div className="field">
            <label className="field-label">Descripción</label>
            <input className="field-input" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Descripción breve (opcional)" />
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <div className="field" style={{ flex:1 }}>
              <label className="field-label">Ícono</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
                {ICONS.map(ic => (
                  <button key={ic} type="button"
                    onClick={() => setForm({ ...form, icon: ic })}
                    style={{ fontSize:20, background: form.icon===ic ? 'var(--sand-200)' : 'transparent',
                      border: form.icon===ic ? '2px solid var(--teal-400)' : '2px solid transparent',
                      borderRadius:6, padding:'2px 4px', cursor:'pointer' }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ width:100 }}>
              <label className="field-label">Color</label>
              <input type="color" value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                style={{ width:'100%', height:36, borderRadius:6, border:'1px solid var(--sand-200)', cursor:'pointer', padding:2 }} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Orden</label>
            <input type="number" className="field-input" value={form.order} min={0}
              onChange={e => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
              style={{ width:80 }} />
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
  const [perms, setPerms] = useState(() => ({
    ...DEFAULT_PERMISSIONS,
    ...(permissions || {}),
  }));
  const [saving, setSaving] = useState(false);

  const toggle = (role, action) => {
    setPerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [action]: !prev[role][action] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(perms); onClose(); }
    catch { toast.error('Error al guardar permisos'); }
    finally { setSaving(false); }
  };

  const ACTION_LABELS = { read: 'Lectura', write: 'Escritura', delete: 'Eliminación' };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-head">
          <h3><Lock size={15} style={{ display:'inline', verticalAlign:-2, marginRight:6 }} />Permisos del Documento</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize:13, color:'var(--ink-500)', marginBottom:16 }}>
            Define qué roles pueden leer, editar o eliminar este documento.
          </p>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--sand-100)' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Rol</th>
                {Object.keys(ACTION_LABELS).map(a => (
                  <th key={a} style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>{ACTION_LABELS[a]}</th>
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

function UploadModal({ categories, onClose, onSave }) {
  const [form, setForm] = useState({
    title:       '',
    description: '',
    category:    '',
    is_template: false,
    published:   true,
    permissions: { ...DEFAULT_PERMISSIONS },
  });
  const [file, setFile]             = useState(null);
  const [showPerms, setShowPerms]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    if (!form.title) setForm(prev => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '') }));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSave = async () => {
    if (!file)        { toast.error('Selecciona un archivo'); return; }
    if (!form.title.trim()) { toast.error('Ingresa un título'); return; }
    setSaving(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const b64 = ev.target.result.split(',')[1];
        await onSave({
          ...form,
          category:  form.category || null,
          doc_type:  'file',
          file_name: file.name,
          file_mime: file.type,
          file_data: b64,
          file_size: file.size,
        });
        onClose();
      };
      reader.readAsDataURL(file);
    } catch { toast.error('Error al subir el archivo'); setSaving(false); }
  };

  const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.gif,.docx,.doc,.xlsx,.xls';

  return (
    <>
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h3><Upload size={15} style={{ display:'inline', verticalAlign:-2, marginRight:6 }} />Subir Archivo</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Drop zone */}
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{ border:`2px dashed ${file ? 'var(--teal-400)' : 'var(--sand-300)'}`,
              borderRadius:10, padding:'24px 16px', textAlign:'center', cursor:'pointer',
              background: file ? 'var(--teal-50)' : 'var(--sand-50)', transition:'all .2s' }}>
            <input ref={fileRef} type="file" accept={ACCEPTED} style={{ display:'none' }}
              onChange={e => handleFile(e.target.files[0])} />
            {file ? (
              <div style={{ color:'var(--teal-700)', fontWeight:600, fontSize:14 }}>
                <File size={28} style={{ display:'block', margin:'0 auto 8px', color:'var(--teal-500)' }} />
                {file.name} <span style={{ fontWeight:400, color:'var(--ink-400)', fontSize:12 }}>({fmtSize(file.size)})</span>
              </div>
            ) : (
              <div style={{ color:'var(--ink-400)', fontSize:13 }}>
                <Upload size={28} style={{ display:'block', margin:'0 auto 8px', color:'var(--ink-300)' }} />
                Arrastra un archivo aquí o <strong style={{ color:'var(--teal-600)' }}>haz clic para seleccionar</strong>
                <div style={{ marginTop:6, fontSize:11 }}>PDF, imagen, Word, Excel</div>
              </div>
            )}
          </div>

          <div className="field">
            <label className="field-label">Título *</label>
            <input className="field-input" value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Nombre del documento" />
          </div>
          <div className="field">
            <label className="field-label">Descripción</label>
            <input className="field-input" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Descripción breve (opcional)" />
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <div className="field" style={{ flex:1 }}>
              <label className="field-label">Categoría</label>
              <select className="field-input" value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex:1 }}>
              <label className="field-label">Estado</label>
              <select className="field-input" value={form.published ? 'published' : 'draft'}
                onChange={e => setForm({ ...form, published: e.target.value === 'published' })}>
                <option value="published">Publicado</option>
                <option value="draft">Borrador</option>
              </select>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <input type="checkbox" id="is_template_upload" checked={form.is_template}
              onChange={e => setForm({ ...form, is_template: e.target.checked })}
              style={{ width:16, height:16, accentColor:'var(--teal-500)', cursor:'pointer' }} />
            <label htmlFor="is_template_upload" style={{ fontSize:13, cursor:'pointer', color:'var(--ink-700)' }}>
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
            {saving ? 'Subiendo…' : 'Subir archivo'}
          </button>
        </div>
      </div>
    </div>
    {showPerms && (
      <PermissionsModal
        permissions={form.permissions}
        onClose={() => setShowPerms(false)}
        onSave={async (p) => { setForm(f => ({ ...f, permissions: p })); }}
      />
    )}
    </>
  );
}

// ── Document Viewer Modal ─────────────────────────────────────────────────────

function DocumentViewerModal({ doc, onClose }) {
  if (!doc) return null;
  const isPdf   = doc.file_mime === 'application/pdf';
  const isImage = doc.file_mime?.startsWith('image/');
  const isRich  = doc.doc_type === 'richtext';

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    let css = '';
    Array.from(document.styleSheets).forEach(s => {
      try { Array.from(s.cssRules || []).forEach(r => { css += r.cssText + '\n'; }); } catch (_) {}
    });
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${doc.title}</title>
      <style>${css} body{font-family:serif;padding:40px;} @page{margin:20mm;}</style>
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
      <div className="modal lg" onClick={e => e.stopPropagation()}
        style={{ maxWidth: isRich ? 760 : 860, width:'96vw', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
        <div className="modal-head">
          <h3 style={{ fontSize:15 }}>{doc.title}</h3>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
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
        <div style={{ flex:1, overflow:'auto', padding:16 }}>
          {isPdf && doc.file_data && (
            <iframe
              src={`data:application/pdf;base64,${doc.file_data}`}
              style={{ width:'100%', height:'74vh', border:'none', borderRadius:6 }}
              title={doc.title}
            />
          )}
          {isImage && doc.file_data && (
            <div style={{ textAlign:'center' }}>
              <img src={`data:${doc.file_mime};base64,${doc.file_data}`}
                alt={doc.title} style={{ maxWidth:'100%', borderRadius:8 }} />
            </div>
          )}
          {isRich && (
            <div className="doc-richtext-view"
              style={{ fontFamily:'Georgia,serif', fontSize:15, lineHeight:1.7, color:'var(--ink-800)',
                padding:'8px 24px', minHeight:200 }}
              dangerouslySetInnerHTML={{ __html: doc.content || '' }} />
          )}
          {!isPdf && !isImage && !isRich && doc.file_data && (
            <div style={{ textAlign:'center', padding:48 }}>
              <File size={52} style={{ color:'var(--ink-300)', marginBottom:16 }} />
              <p style={{ color:'var(--ink-500)', marginBottom:20 }}>
                Vista previa no disponible para este tipo de archivo.
              </p>
              <button className="btn btn-primary" onClick={handleDownload}>
                <Download size={14} style={{ display:'inline', verticalAlign:-2, marginRight:6 }} />
                Descargar archivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocumentCard({ doc, userRole, onView, onEdit, onDelete, onTogglePublished, onDuplicate }) {
  const perms = doc.permissions || {};
  const rp    = perms[userRole] || {};
  const isAdmin = userRole === 'admin';
  const canWrite  = isAdmin || rp.write;
  const canDelete = isAdmin || rp.delete;
  const isRich = doc.doc_type === 'richtext';
  const mimeInfo = getMimeInfo(doc.file_mime);
  const DocIcon = isRich ? FileText : mimeInfo.icon;
  const iconColor = isRich ? '#7c3aed' : mimeInfo.color;

  return (
    <div style={{ background:'white', border:'1px solid var(--sand-200)', borderRadius:10,
      padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:14,
      transition:'box-shadow .15s', cursor:'default',
      boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'}>

      {/* Icon */}
      <div style={{ width:42, height:42, borderRadius:8, background:`${iconColor}18`,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <DocIcon size={22} style={{ color: iconColor }} />
      </div>

      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontWeight:700, fontSize:14, color:'var(--ink-800)', wordBreak:'break-word' }}>
            {doc.title}
          </span>
          {doc.is_template && (
            <span style={{ fontSize:10, fontWeight:700, background:'#fef3c7', color:'#92400e',
              padding:'2px 6px', borderRadius:99 }}>PLANTILLA</span>
          )}
          {!doc.published && (
            <span style={{ fontSize:10, fontWeight:700, background:'var(--sand-100)', color:'var(--ink-500)',
              padding:'2px 6px', borderRadius:99 }}>BORRADOR</span>
          )}
        </div>
        {doc.description && (
          <div style={{ fontSize:12, color:'var(--ink-500)', marginTop:3, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.description}</div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:6, fontSize:11, color:'var(--ink-400)', flexWrap:'wrap' }}>
          {doc.category_name && (
            <span style={{ display:'flex', alignItems:'center', gap:3 }}>
              <Folder size={11} /> {doc.category_name}
            </span>
          )}
          {isRich ? <span>Texto enriquecido</span> : (
            <span>{mimeInfo.label}{doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ''}</span>
          )}
          <span>{fmtDate(doc.created_at)}</span>
          {doc.created_by_name && <span>por {doc.created_by_name}</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:4, flexShrink:0, alignItems:'center' }}>
        <button className="btn btn-secondary btn-sm" title="Ver documento" onClick={() => onView(doc)}
          style={{ padding:'4px 8px' }}>
          <Eye size={14} />
        </button>
        {canWrite && (
          <button className="btn btn-secondary btn-sm" title="Editar" onClick={() => onEdit(doc)}
            style={{ padding:'4px 8px' }}>
            <Pencil size={14} />
          </button>
        )}
        {isAdmin && (
          <>
            <button className="btn btn-secondary btn-sm" title={doc.published ? 'Despublicar' : 'Publicar'}
              onClick={() => onTogglePublished(doc)} style={{ padding:'4px 8px' }}>
              {doc.published ? <EyeOff size={14} /> : <Globe size={14} />}
            </button>
            <button className="btn btn-secondary btn-sm" title="Duplicar" onClick={() => onDuplicate(doc)}
              style={{ padding:'4px 8px' }}>
              <Copy size={14} />
            </button>
          </>
        )}
        {canDelete && (
          <button className="btn btn-secondary btn-sm" title="Eliminar" onClick={() => onDelete(doc)}
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
  const userRole = user?.role === 'superadmin' ? 'admin' : (user?.role || 'vecino');
  const isAdmin  = userRole === 'admin';
  const canCreate = ['admin', 'tesorero'].includes(userRole);

  // State
  const [categories,       setCategories]       = useState([]);
  const [docs,             setDocs]             = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null); // null = all, 'templates' = templates
  const [search,           setSearch]           = useState('');
  const [showUpload,       setShowUpload]       = useState(false);
  const [showEditor,       setShowEditor]       = useState(false);
  const [editingDoc,       setEditingDoc]       = useState(null);
  const [viewingDoc,       setViewingDoc]       = useState(null);
  const [catModal,         setCatModal]         = useState(null);  // null | 'new' | category
  const [deleteConfirm,    setDeleteConfirm]    = useState(null);
  const [permsModal,       setPermsModal]       = useState(null);

  // Load
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
    } catch { toast.error('Error al cargar documentos'); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtered docs
  const filteredDocs = docs.filter(d => {
    if (selectedCategory === 'templates') return d.is_template;
    if (selectedCategory === 'none')      return !d.category;
    if (selectedCategory)                 return d.category === selectedCategory;
    if (search) return d.title.toLowerCase().includes(search.toLowerCase())
                    || (d.description || '').toLowerCase().includes(search.toLowerCase());
    return true;
  }).filter(d => {
    if (!search) return true;
    return d.title.toLowerCase().includes(search.toLowerCase())
        || (d.description || '').toLowerCase().includes(search.toLowerCase());
  });

  // Handlers
  const handleCreateCategory = async (data) => {
    const res = await documentsAPI.createCategory(tenantId, data);
    setCategories(prev => [...prev, res.data]);
    toast.success('Categoría creada');
  };

  const handleUpdateCategory = async (id, data) => {
    const res = await documentsAPI.updateCategory(tenantId, id, data);
    setCategories(prev => prev.map(c => c.id === id ? res.data : c));
    toast.success('Categoría actualizada');
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"? Los documentos dentro quedarán sin categoría.`)) return;
    await documentsAPI.deleteCategory(tenantId, cat.id);
    setCategories(prev => prev.filter(c => c.id !== cat.id));
    if (selectedCategory === cat.id) setSelectedCategory(null);
    toast.success('Categoría eliminada');
  };

  const handleSaveDoc = async (data) => {
    if (editingDoc) {
      const res = await documentsAPI.update(tenantId, editingDoc.id, data);
      setDocs(prev => prev.map(d => d.id === editingDoc.id ? res.data : d));
      toast.success('Documento actualizado');
    } else {
      const res = await documentsAPI.create(tenantId, data);
      setDocs(prev => [res.data, ...prev]);
      toast.success('Documento guardado');
    }
  };

  const handleDelete = async (doc) => {
    await documentsAPI.delete(tenantId, doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    setDeleteConfirm(null);
    toast.success('Documento eliminado');
  };

  const handleTogglePublished = async (doc) => {
    const res = await documentsAPI.togglePublished(tenantId, doc.id);
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, published: res.data.published } : d));
    toast.success(res.data.published ? 'Documento publicado' : 'Documento marcado como borrador');
  };

  const handleDuplicate = async (doc) => {
    const title = `Copia de ${doc.title}`;
    const res = await documentsAPI.duplicate(tenantId, doc.id, { title });
    setDocs(prev => [res.data, ...prev]);
    toast.success('Documento duplicado');
  };

  const handleEdit = async (doc) => {
    // Fetch full doc (includes file_data / content)
    try {
      const res = await documentsAPI.get(tenantId, doc.id);
      const full = res.data;
      setEditingDoc(full);
      if (full.doc_type === 'richtext') setShowEditor(true);
      else setShowUpload(true);
    } catch { toast.error('Error al cargar el documento'); }
  };

  const handleView = async (doc) => {
    try {
      const res = await documentsAPI.get(tenantId, doc.id);
      setViewingDoc(res.data);
    } catch { toast.error('Error al cargar el documento'); }
  };

  const totalDocs = docs.length;
  const templateCount = docs.filter(d => d.is_template).length;

  return (
    <div style={{ display:'flex', height:'calc(100vh - 68px)', margin:'-32px', overflow:'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--sand-200)',
        background:'var(--sand-50)', display:'flex', flexDirection:'column', overflowY:'auto' }}>

        <div style={{ padding:'16px 12px 8px', fontWeight:800, fontSize:12,
          color:'var(--ink-400)', letterSpacing:'.05em', textTransform:'uppercase' }}>
          Categorías
        </div>

        {/* All docs */}
        <button
          onClick={() => setSelectedCategory(null)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
            background: selectedCategory === null ? 'var(--teal-50)' : 'transparent',
            border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
            color: selectedCategory === null ? 'var(--teal-700)' : 'var(--ink-600)',
            borderRadius:0, textAlign:'left' }}>
          <Folder size={15} /> Todos los documentos
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-400)' }}>{totalDocs}</span>
        </button>

        {/* Templates */}
        <button
          onClick={() => setSelectedCategory('templates')}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
            background: selectedCategory === 'templates' ? 'var(--teal-50)' : 'transparent',
            border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
            color: selectedCategory === 'templates' ? 'var(--teal-700)' : 'var(--ink-600)',
            borderRadius:0, textAlign:'left' }}>
          <BookTemplate size={15} /> Plantillas
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-400)' }}>{templateCount}</span>
        </button>

        {/* Divider */}
        <div style={{ height:1, background:'var(--sand-200)', margin:'8px 0' }} />

        {/* Category list */}
        {categories.map(cat => (
          <div key={cat.id} style={{ display:'flex', alignItems:'center' }}>
            <button
              onClick={() => setSelectedCategory(cat.id)}
              style={{ flex:1, display:'flex', alignItems:'center', gap:7, padding:'7px 14px',
                background: selectedCategory === cat.id ? 'var(--teal-50)' : 'transparent',
                border:'none', cursor:'pointer', fontSize:13,
                color: selectedCategory === cat.id ? 'var(--teal-700)' : 'var(--ink-600)',
                borderRadius:0, textAlign:'left', minWidth:0 }}>
              <span style={{ fontSize:16, lineHeight:1 }}>{cat.icon}</span>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: selectedCategory===cat.id ? 700 : 500 }}>
                {cat.name}
              </span>
              <span style={{ marginLeft:'auto', fontSize:11, color:'var(--ink-400)', flexShrink:0 }}>
                {cat.document_count}
              </span>
            </button>
            {isAdmin && (
              <div style={{ display:'flex', gap:2, paddingRight:6 }}>
                <button title="Editar" onClick={() => setCatModal(cat)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:3, color:'var(--ink-400)' }}>
                  <Pencil size={11} />
                </button>
                <button title="Eliminar" onClick={() => handleDeleteCategory(cat)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:3, color:'var(--coral-500)' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Add category button */}
        {isAdmin && (
          <button onClick={() => setCatModal('new')}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
              background:'transparent', border:'none', cursor:'pointer', fontSize:12,
              color:'var(--teal-600)', fontWeight:600, marginTop:4 }}>
            <Plus size={13} /> Nueva categoría
          </button>
        )}
      </div>

      {/* ── Main content ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Top bar */}
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--sand-200)',
          background:'white', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>

          {/* Search */}
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
              color:'var(--ink-400)', pointerEvents:'none' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar documentos…"
              style={{ width:'100%', paddingLeft:32, height:34, borderRadius:8,
                border:'1px solid var(--sand-300)', fontSize:13, background:'var(--sand-50)',
                outline:'none', boxSizing:'border-box' }} />
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

          {/* Create buttons */}
          {canCreate && (
            <>
              <button className="btn btn-secondary" onClick={() => { setEditingDoc(null); setShowUpload(true); }}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Upload size={14} /> Subir archivo
              </button>
              <button className="btn btn-primary" onClick={() => { setEditingDoc(null); setShowEditor(true); }}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                <FilePlus2 size={14} /> Crear documento
              </button>
            </>
          )}
        </div>

        {/* Section label */}
        <div style={{ padding:'10px 20px 4px', fontSize:12, fontWeight:700,
          color:'var(--ink-400)', textTransform:'uppercase', letterSpacing:'.05em',
          borderBottom:'1px solid var(--sand-100)' }}>
          {selectedCategory === 'templates' ? 'Plantillas' :
           selectedCategory ? (categories.find(c=>c.id===selectedCategory)?.name || 'Categoría') :
           'Todos los documentos'}
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
            <div style={{ textAlign:'center', padding:60, color:'var(--ink-300)' }}>
              <FileText size={40} style={{ display:'block', margin:'0 auto 12px' }} />
              <div style={{ fontWeight:600, marginBottom:4, color:'var(--ink-400)' }}>
                {search ? 'No se encontraron documentos' : 'No hay documentos aquí'}
              </div>
              {canCreate && !search && (
                <div style={{ fontSize:13 }}>
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
                onDelete={(d) => setDeleteConfirm(d)}
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
          onSave={async (data) => {
            if (catModal === 'new') await handleCreateCategory(data);
            else await handleUpdateCategory(catModal.id, data);
          }}
        />
      )}

      {showUpload && (
        <UploadModal
          categories={categories}
          editingDoc={editingDoc}
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
                ¿Estás seguro de que deseas eliminar <strong>"{deleteConfirm.title}"</strong>? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ background:'var(--coral-500)' }}
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

// ── Editor Modal (defined after main component to keep file readable) ─────────

function DocumentEditorModal({ doc, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    title:       doc?.title       || '',
    description: doc?.description || '',
    category:    doc?.category    || '',
    is_template: doc?.is_template || false,
    published:   doc?.published   ?? true,
    permissions: doc?.permissions || { ...DEFAULT_PERMISSIONS },
  });
  const [content,      setContent]    = useState(doc?.content || '');
  const [showPerms,    setShowPerms]  = useState(false);
  const [saving,       setSaving]     = useState(false);
  const editorRef = useRef();

  // Execute rich-text command
  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    syncContent();
  };

  const syncContent = () => {
    if (editorRef.current) setContent(editorRef.current.innerHTML);
  };

  const insertTable = () => {
    const html = `<table border="1" style="border-collapse:collapse;width:100%;margin:12px 0;">
      ${[...Array(3)].map(() => `<tr>${[...Array(3)].map(() =>
        `<td style="border:1px solid #ccc;padding:6px 10px;min-width:60px;">&nbsp;</td>`
      ).join('')}</tr>`).join('')}
    </table><p><br></p>`;
    exec('insertHTML', html);
  };

  const insertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        exec('insertImage', ev.target.result);
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const handlePrintPreview = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${form.title || 'Documento'}</title>
      <style>body{font-family:Georgia,serif;padding:40px;max-width:800px;margin:0 auto;line-height:1.6;}
      table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ccc;padding:6px 10px;}
      @page{margin:20mm;}</style>
      </head><body>${content || ''}</body></html>`);
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
        content:  editorRef.current?.innerHTML || content,
      });
      onClose();
    } catch { toast.error('Error al guardar el documento'); }
    finally { setSaving(false); }
  };

  const FONT_SIZES = ['12px','14px','16px','18px','20px','24px','28px','36px'];

  const ToolBtn = ({ cmd, val, title, children }) => (
    <button type="button" title={title}
      onMouseDown={(e) => { e.preventDefault(); exec(cmd, val); }}
      style={{ background:'none', border:'1px solid transparent', borderRadius:4, padding:'3px 6px',
        cursor:'pointer', color:'var(--ink-600)', fontSize:13, fontFamily:'inherit',
        display:'flex', alignItems:'center', justifyContent:'center' }}
      onMouseEnter={e => e.currentTarget.style.background='var(--sand-100)'}
      onMouseLeave={e => e.currentTarget.style.background='none'}>
      {children}
    </button>
  );

  const Sep = () => (
    <div style={{ width:1, height:20, background:'var(--sand-200)', margin:'0 2px' }} />
  );

  return (
    <>
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()}
        style={{ maxWidth:900, width:'96vw', maxHeight:'94vh', display:'flex', flexDirection:'column' }}>

        <div className="modal-head">
          <h3><FilePlus2 size={15} style={{ display:'inline', verticalAlign:-2, marginRight:6 }} />
            {doc ? 'Editar Documento' : 'Crear Documento'}
          </h3>
          <div style={{ display:'flex', gap:6 }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrintPreview}
              style={{ display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
              <Printer size={12} /> Vista previa / PDF
            </button>
            <button className="modal-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ display:'flex', gap:12, padding:'10px 16px',
          borderBottom:'1px solid var(--sand-200)', flexWrap:'wrap' }}>
          <input className="field-input" value={form.title} style={{ flex:2, minWidth:200 }}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Título del documento *" />
          <input className="field-input" value={form.description} style={{ flex:2, minWidth:180 }}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Descripción (opcional)" />
          <select className="field-input" value={form.category} style={{ flex:1, minWidth:140 }}
            onChange={e => setForm({ ...form, category: e.target.value })}>
            <option value="">Sin categoría</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select className="field-input" value={form.published ? 'published' : 'draft'} style={{ width:130 }}
            onChange={e => setForm({ ...form, published: e.target.value === 'published' })}>
            <option value="published">Publicado</option>
            <option value="draft">Borrador</option>
          </select>
        </div>

        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'center', gap:2, padding:'6px 12px',
          background:'var(--sand-50)', borderBottom:'1px solid var(--sand-200)', flexWrap:'wrap' }}>

          {/* Heading */}
          <select onChange={e => { exec('formatBlock', e.target.value); e.target.value=''; }}
            defaultValue=""
            style={{ height:28, fontSize:12, border:'1px solid var(--sand-200)', borderRadius:4,
              background:'white', cursor:'pointer', marginRight:4 }}>
            <option value="" disabled>Párrafo</option>
            <option value="h1">Título 1</option>
            <option value="h2">Título 2</option>
            <option value="h3">Título 3</option>
            <option value="p">Párrafo</option>
          </select>

          {/* Font size */}
          <select onChange={e => { exec('fontSize', e.target.value); e.target.value=''; }}
            defaultValue=""
            style={{ height:28, fontSize:12, border:'1px solid var(--sand-200)', borderRadius:4,
              background:'white', cursor:'pointer', marginRight:4 }}>
            <option value="" disabled>Tamaño</option>
            <option value="1">Pequeño</option>
            <option value="3">Normal</option>
            <option value="5">Grande</option>
            <option value="7">Muy grande</option>
          </select>

          <Sep />

          <ToolBtn cmd="bold"      title="Negrita (Ctrl+B)"><strong>N</strong></ToolBtn>
          <ToolBtn cmd="italic"    title="Cursiva (Ctrl+I)"><em>K</em></ToolBtn>
          <ToolBtn cmd="underline" title="Subrayado (Ctrl+U)"><u>S</u></ToolBtn>
          <ToolBtn cmd="strikeThrough" title="Tachado"><s>T</s></ToolBtn>

          <Sep />

          <ToolBtn cmd="justifyLeft"   title="Alinear izquierda">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="3" x2="12" y2="3"/><line x1="2" y1="7" x2="9" y2="7"/><line x1="2" y1="11" x2="12" y2="11"/></svg>
          </ToolBtn>
          <ToolBtn cmd="justifyCenter" title="Centrar">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="3" x2="12" y2="3"/><line x1="4" y1="7" x2="10" y2="7"/><line x1="2" y1="11" x2="12" y2="11"/></svg>
          </ToolBtn>
          <ToolBtn cmd="justifyRight"  title="Alinear derecha">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="3" x2="12" y2="3"/><line x1="5" y1="7" x2="12" y2="7"/><line x1="2" y1="11" x2="12" y2="11"/></svg>
          </ToolBtn>

          <Sep />

          <ToolBtn cmd="insertUnorderedList" title="Lista con viñetas">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="3" cy="4" r="1.2" fill="currentColor" stroke="none"/><circle cx="3" cy="10" r="1.2" fill="currentColor" stroke="none"/><line x1="6" y1="4" x2="12" y2="4"/><line x1="6" y1="10" x2="12" y2="10"/></svg>
          </ToolBtn>
          <ToolBtn cmd="insertOrderedList" title="Lista numerada">
            <svg width="14" height="14" fill="currentColor" stroke="none"><text x="1" y="6" fontSize="7" fontWeight="bold">1.</text><text x="1" y="12" fontSize="7" fontWeight="bold">2.</text><line x1="8" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5"/></svg>
          </ToolBtn>
          <ToolBtn cmd="indent"   title="Aumentar sangría">→</ToolBtn>
          <ToolBtn cmd="outdent"  title="Reducir sangría">←</ToolBtn>

          <Sep />

          {/* Color de texto */}
          <label title="Color de texto" style={{ display:'flex', alignItems:'center', cursor:'pointer' }}>
            <span style={{ fontSize:12, marginRight:4, color:'var(--ink-600)' }}>A</span>
            <input type="color" defaultValue="#000000"
              onChange={e => exec('foreColor', e.target.value)}
              style={{ width:20, height:20, border:'none', cursor:'pointer', padding:0, background:'none' }} />
          </label>

          {/* Color de fondo */}
          <label title="Color de fondo" style={{ display:'flex', alignItems:'center', cursor:'pointer' }}>
            <span style={{ fontSize:10, marginRight:2, color:'var(--ink-400)' }}>bg</span>
            <input type="color" defaultValue="#ffff00"
              onChange={e => exec('hiliteColor', e.target.value)}
              style={{ width:20, height:20, border:'none', cursor:'pointer', padding:0, background:'none' }} />
          </label>

          <Sep />

          <button type="button" title="Insertar tabla" onMouseDown={(e) => { e.preventDefault(); insertTable(); }}
            style={{ background:'none', border:'1px solid transparent', borderRadius:4, padding:'3px 7px',
              cursor:'pointer', color:'var(--ink-600)', fontSize:11, fontWeight:700 }}
            onMouseEnter={e => e.currentTarget.style.background='var(--sand-100)'}
            onMouseLeave={e => e.currentTarget.style.background='none'}>
            ⊞ Tabla
          </button>

          <button type="button" title="Insertar imagen" onMouseDown={(e) => { e.preventDefault(); insertImage(); }}
            style={{ background:'none', border:'1px solid transparent', borderRadius:4, padding:'3px 7px',
              cursor:'pointer', color:'var(--ink-600)', fontSize:11, fontWeight:700 }}
            onMouseEnter={e => e.currentTarget.style.background='var(--sand-100)'}
            onMouseLeave={e => e.currentTarget.style.background='none'}>
            🖼 Imagen
          </button>

          <Sep />

          <ToolBtn cmd="undo" title="Deshacer">↩</ToolBtn>
          <ToolBtn cmd="redo" title="Rehacer">↪</ToolBtn>

          <div style={{ marginLeft:'auto' }}>
            <button type="button" className="btn btn-secondary btn-sm"
              style={{ fontSize:11, display:'flex', alignItems:'center', gap:4 }}
              onClick={() => setShowPerms(true)}>
              <Settings2 size={12} /> Permisos
            </button>
          </div>
        </div>

        {/* Editor area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncContent}
          dangerouslySetInnerHTML={{ __html: content }}
          style={{ flex:1, overflow:'auto', padding:'20px 32px',
            fontFamily:'Georgia, "Times New Roman", serif', fontSize:15, lineHeight:1.75,
            color:'var(--ink-800)', outline:'none', minHeight:300,
            background:'white' }}
        />

        <div className="modal-foot">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <input type="checkbox" id="editor_template" checked={form.is_template}
              onChange={e => setForm({ ...form, is_template: e.target.checked })}
              style={{ width:15, height:15, accentColor:'var(--teal-500)', cursor:'pointer' }} />
            <label htmlFor="editor_template" style={{ fontSize:12, cursor:'pointer', color:'var(--ink-600)' }}>
              Guardar como plantilla
            </label>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Guardando…' : (doc ? 'Guardar cambios' : 'Publicar documento')}
          </button>
        </div>
      </div>
    </div>

    {showPerms && (
      <PermissionsModal
        permissions={form.permissions}
        onClose={() => setShowPerms(false)}
        onSave={async (p) => { setForm(f => ({ ...f, permissions: p })); }}
      />
    )}
    </>
  );
}
