import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { blogAPI, usersAPI, api } from '../api/client';
import toast from 'react-hot-toast';
import {
  BookOpen, Plus, Search, Filter, Eye, Edit3, Trash2, Send,
  Clock, CheckCircle, FileEdit, Image, Bold, Italic, Underline,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Link2,
  X, ChevronDown, Users, User, Globe, ArrowLeft, Calendar,
  MoreVertical, Heart, MessageSquare, Share2, Tag, Layout,
  Newspaper, Sparkles, Upload, Check, AlertCircle, ChevronRight,
  Building2, Save, EyeOff, Palette, Type, Minus, Quote, CheckCircle2,
  Loader2, Mail, LayoutList, LayoutGrid,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS = {
  draft:     { label: 'Borrador',   icon: Clock,         color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  published: { label: 'Publicado',  icon: CheckCircle,   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  editing:   { label: 'En Edición', icon: FileEdit,      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
};

const AUDIENCE_OPTIONS = [
  { key: 'all',       label: 'Todos los usuarios',   icon: Globe, desc: 'Todos los miembros del condominio verán este artículo' },
  { key: 'roles',     label: 'Por tipo de usuario',  icon: Users, desc: 'Selecciona qué roles pueden ver este artículo' },
  { key: 'specific',  label: 'Usuarios específicos', icon: User,  desc: 'Elige manualmente quién puede ver este artículo' },
];

const ROLES_LIST = [
  { key: 'admin',     label: 'Administrador' },
  { key: 'tesorero',  label: 'Tesorero' },
  { key: 'contador',  label: 'Contador' },
  { key: 'auditor',   label: 'Auditor' },
  { key: 'vigilante', label: 'Vigilante' },
  { key: 'vecino',    label: 'Vecino / Residente' },
];

const TEMPLATES = [
  { id: 'aviso',         label: 'Aviso General',        icon: '📢', desc: 'Para comunicados y avisos importantes a la comunidad',    category: 'aviso',        gradient: 'from-teal-400 to-cyan-500',    emoji: '📢' },
  { id: 'mantenimiento', label: 'Mantenimiento',         icon: '🔧', desc: 'Para informar sobre trabajos o interrupciones de servicios', category: 'mantenimiento', gradient: 'from-orange-400 to-amber-500',  emoji: '🔧' },
  { id: 'evento',        label: 'Evento Comunitario',    icon: '🎉', desc: 'Para convocar a reuniones, fiestas o actividades',       category: 'evento',       gradient: 'from-emerald-400 to-green-500', emoji: '🎉' },
  { id: 'reglamento',    label: 'Reglamento / Norma',    icon: '📋', desc: 'Para compartir actualizaciones de reglas o políticas',   category: 'reglamento',   gradient: 'from-violet-400 to-purple-500', emoji: '📋' },
  { id: 'logro',         label: 'Logro / Noticias',      icon: '🏆', desc: 'Para compartir buenas noticias de la comunidad',         category: 'logro',        gradient: 'from-blue-400 to-indigo-500',   emoji: '🏆' },
  { id: 'en_blanco',     label: 'En blanco',             icon: '✏️', desc: 'Empieza desde cero con total libertad',                  category: '',             gradient: 'from-slate-400 to-slate-600',   emoji: '📄' },
];

const CATEGORIES = [
  { key: 'all',           label: 'Todas',             emoji: '📰', color: 'bg-slate-100 text-slate-600 border-slate-200',       active: 'bg-slate-700 text-white border-slate-700' },
  { key: 'aviso',         label: 'Avisos',            emoji: '📢', color: 'bg-teal-50 text-teal-700 border-teal-200',           active: 'bg-teal-600 text-white border-teal-600' },
  { key: 'mantenimiento', label: 'Mantenimiento',     emoji: '🔧', color: 'bg-orange-50 text-orange-700 border-orange-200',     active: 'bg-orange-500 text-white border-orange-500' },
  { key: 'evento',        label: 'Eventos',           emoji: '🎉', color: 'bg-emerald-50 text-emerald-700 border-emerald-200',  active: 'bg-emerald-600 text-white border-emerald-600' },
  { key: 'reglamento',    label: 'Reglamentos',       emoji: '📋', color: 'bg-violet-50 text-violet-700 border-violet-200',    active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'logro',         label: 'Noticias',          emoji: '🏆', color: 'bg-blue-50 text-blue-700 border-blue-200',           active: 'bg-blue-600 text-white border-blue-600' },
];

const COVER_THEMES = [
  { gradient: 'from-teal-400 to-cyan-500',    emoji: '📢' },
  { gradient: 'from-orange-400 to-amber-500', emoji: '🔧' },
  { gradient: 'from-violet-400 to-purple-500',emoji: '📋' },
  { gradient: 'from-pink-400 to-rose-500',    emoji: '🏠' },
  { gradient: 'from-emerald-400 to-green-500',emoji: '🎉' },
  { gradient: 'from-blue-400 to-indigo-500',  emoji: '🏆' },
  { gradient: 'from-slate-400 to-slate-600',  emoji: '📰' },
  { gradient: 'from-red-400 to-pink-500',     emoji: '🚨' },
];

// Reaction definitions shared across views.
const REACTIONS = [
  { type: 'like', icon: '👍', label: 'Me gusta'   },
  { type: 'love', icon: '❤️', label: 'Me encanta' },
  { type: 'clap', icon: '👏', label: 'Aplauso'    },
  { type: 'idea', icon: '💡', label: 'Buena idea' },
];

// Read per-type reaction count off either the rich `reactions.counts` payload
// (returned by the list & detail serializers) or fall back to 0.
const reactionCount = (article, type) =>
  article?.reactions?.counts?.[type] ?? 0;

// Build a compact one-line summary of reaction counts for the dashboard cards.
const formatReactionSummary = (article) => REACTIONS
  .map(r => ({ ...r, n: reactionCount(article, r.type) }))
  .filter(r => r.n > 0);

// ─── Image compression ────────────────────────────────────────────────────────
// Browsers can decode just about any common raster image (JPEG, PNG, GIF,
// WebP, BMP, AVIF on modern Chrome/Firefox). We re-encode every uploaded
// image as JPEG at a sane resolution + quality so the payload is light
// enough to (a) fit comfortably under Django's DATA_UPLOAD_MAX_MEMORY_SIZE
// when embedded as base64 in the article body, and (b) keep cover-image
// uploads under the configured backend size limit.
//
// `file`       — the raw File from <input type="file">
// `maxDim`     — longest side, in pixels (default 1600)
// `quality`    — JPEG quality 0–1 (default 0.78)
// `asDataUrl`  — when true returns a base64 data: URL (for inline body
//                images); otherwise returns a Blob (ready for FormData).
//
// On any failure (browser can't decode the format, OOM, etc.) the original
// file is returned unchanged so the user's content is never lost.
const compressImage = (file, { maxDim = 1600, quality = 0.78, asDataUrl = false } = {}) =>
  new Promise((resolve) => {
    if (!file || !file.type?.startsWith('image/')) {
      return resolve(asDataUrl ? null : file);
    }
    // Animated GIFs and SVGs can't be re-encoded safely via canvas
    // without losing animation / scalability — pass them through.
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
      if (!asDataUrl) return resolve(file);
      const r = new FileReader();
      r.onload = ev => resolve(ev.target.result);
      r.onerror = () => resolve(null);
      return r.readAsDataURL(file);
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        try {
          const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width  * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          // White background avoids ugly black corners when re-encoding
          // PNGs with transparency as JPEG.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          if (asDataUrl) {
            resolve(canvas.toDataURL('image/jpeg', quality));
          } else {
            canvas.toBlob(
              (blob) => {
                if (!blob) return resolve(file);
                // Wrap as a File so the FormData upload keeps a sensible
                // filename + mime type on the server.
                const out = new File(
                  [blob],
                  (file.name?.replace(/\.[^.]+$/, '') || 'cover') + '.jpg',
                  { type: 'image/jpeg', lastModified: Date.now() },
                );
                resolve(out);
              },
              'image/jpeg',
              quality,
            );
          }
        } catch {
          // Canvas tainted / decode error → return original
          resolve(asDataUrl ? ev.target.result : file);
        }
      };
      img.onerror = () => resolve(asDataUrl ? ev.target.result : file);
      img.src = ev.target.result;
    };
    reader.onerror = () => resolve(asDataUrl ? null : file);
    reader.readAsDataURL(file);
  });

// ─── Field helpers ─────────────────────────────────────────────────────────────
// The API returns snake_case fields; helpers give the component a unified API.
const coverGradient = a => a.cover_gradient || 'from-teal-400 to-cyan-500';
const coverEmoji    = a => a.cover_emoji    || '📰';

// ─── Cover image loader ───────────────────────────────────────────────────────
// Cache de sesión: evita re-fetches del mismo URL en la misma página.
// Las keys son cover_image_url; los values son object URLs ya resueltos.
const _coverCache = new Map();

/**
 * Carga la portada de un artículo vía el cliente API autenticado y
 * devuelve un objectURL listo para usar en <img>.
 *
 * - Data URLs (preview local del editor) se devuelven directamente sin fetch.
 * - URLs de servidor se fetean una vez y se cachean por sesión.
 * - Si la URL es nula/vacía devuelve null (se muestra el gradiente).
 */
function useBlogCover(url) {
  const [objectUrl, setObjectUrl] = React.useState(() => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    return _coverCache.get(url) || null;
  });

  React.useEffect(() => {
    if (!url) { setObjectUrl(null); return; }
    if (url.startsWith('data:')) { setObjectUrl(url); return; }
    if (_coverCache.has(url)) { setObjectUrl(_coverCache.get(url)); return; }

    let cancelled = false;
    (async () => {
      try {
        // Usar fetch nativo (sin interceptores de axios) para recursos públicos.
        // credentials:'include' preserva la cookie de sesión por si el endpoint
        // requiere autenticación en algún entorno.
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        // Blob vacío = X-Accel-Redirect sin cuerpo: tratar como error
        if (!blob || blob.size === 0) throw new Error('empty blob');
        // Inferir MIME desde extensión cuando llega como octet-stream
        const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
        const mime = (blob.type && blob.type !== 'application/octet-stream')
          ? blob.type
          : ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
        const typedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime });
        const objUrl = URL.createObjectURL(typedBlob);
        _coverCache.set(url, objUrl);
        setObjectUrl(objUrl);
      } catch {
        if (!cancelled) setObjectUrl(null); // fallback → gradient
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return objectUrl;
}
const authorName    = a => a.author_name    || 'Administración';
const viewsCount    = a => a.views_count    ?? 0;
const createdDate   = a => (a.created_at    || '').slice(0, 10);
const publishedDate = a => (a.published_at  || '').slice(0, 10);

// ─── ArticleCover ──────────────────────────────────────────────────────────────
// Componente centralizado para mostrar la portada de un artículo.
// Carga la imagen vía el cliente API autenticado (resuelve problemas de
// X-Accel-Redirect y Content-Type vacío en producción). Si no hay imagen
// o la carga falla, muestra el gradiente con emoji como fallback.
//
// Props:
//   article       — objeto artículo con cover_image_url, cover_gradient, cover_emoji, title
//   className     — clases para el contenedor (tamaño, rounded, etc.)
//   style         — estilos adicionales opcionales
//   imgClassName  — override de clases sólo para el <img>
//   children      — contenido superpuesto (badges, botones, etc.)
function ArticleCover({ article, className = '', style, imgClassName, emojiSize = 'text-5xl', emojiOpacity = 'opacity-70', children }) {
  const objectUrl = useBlogCover(article?.cover_image_url);
  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => { setImgFailed(false); }, [objectUrl]);

  const gradient = coverGradient(article);
  const emoji    = coverEmoji(article);
  const hasImg   = !!objectUrl && !imgFailed;

  return (
    <div className={`relative overflow-hidden ${hasImg ? '' : `bg-gradient-to-br ${gradient}`} ${className}`} style={style}>
      {hasImg && (
        <img
          src={objectUrl}
          alt={article?.title || ''}
          className={imgClassName || 'absolute inset-0 w-full h-full object-cover'}
          onError={() => setImgFailed(true)}
        />
      )}
      {!hasImg && (
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none ${emojiOpacity}`}>
          <span className={emojiSize}>{emoji}</span>
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS[status];
  if (!s) return null;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.color} ${s.bg} ${s.border}`}>
      <Icon size={11} /> {s.label}
    </span>
  );
}

function CoverBlock({ article, large = false }) {
  const sz = large ? 'h-64' : 'h-44';
  return (
    <ArticleCover
      article={article}
      className={`w-full ${sz} rounded-xl`}
      imgClassName={`absolute inset-0 w-full h-full object-cover rounded-xl`}
    />
  );
}

// ─── Hero Card ─────────────────────────────────────────────────────────────────
function HeroCard({ article, onEdit, onView, isAdmin }) {
  const cat = CATEGORIES.find(c => c.key === article.category);
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden cursor-pointer group"
      style={{ height: 'clamp(220px, 50vw, 420px)' }}
      onClick={() => onView(article)}
    >
      <ArticleCover
        article={article}
        className="absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-105"
        imgClassName="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        emojiSize="text-9xl"
        emojiOpacity="opacity-20"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/50 to-transparent" />

      <div className="absolute top-4 right-4 z-10">
        <StatusBadge status={article.status} />
      </div>

      <div className="absolute top-4 left-4 z-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-xs font-bold tracking-wide">
          <Sparkles size={11} /> Más reciente
        </span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
        {cat && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border mb-3 ${cat.color}`}>
            {cat.emoji} {cat.label}
          </span>
        )}
        <h2 className="text-white font-extrabold text-2xl leading-tight mb-2 line-clamp-2 drop-shadow-sm">
          {article.title}
        </h2>
        <p className="text-slate-300 text-sm leading-relaxed line-clamp-2 mb-4 max-w-2xl">
          {article.excerpt}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><Calendar size={11} /> {createdDate(article)}</span>
            {article.status === 'published' && (
              <span className="flex items-center gap-1"><Eye size={11} /> {viewsCount(article)} vistas</span>
            )}
            <span className="text-slate-500">· {authorName(article)}</span>
            {/* Reaction counts overlay */}
            {formatReactionSummary(article).length > 0 && (
              <span className="flex items-center gap-2 ml-1">
                {formatReactionSummary(article).map(r => (
                  <span key={r.type} title={r.label}
                    className="inline-flex items-center gap-1 text-slate-300">
                    <span>{r.icon}</span>
                    <span className="font-semibold">{r.n}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onView(article)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white text-slate-800 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-100 transition-all active:scale-95 shadow-md">
              <Eye size={13} /> <span className="hidden xs:inline">Leer artículo</span><span className="xs:hidden">Leer</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => onEdit(article)}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-white/15 backdrop-blur-sm border border-white/25 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-white/25 transition-all active:scale-95">
                <Edit3 size={13} /> <span className="hidden sm:inline">Editar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Carousel Card ─────────────────────────────────────────────────────────────
function CarouselCard({ article, onEdit, onView, isAdmin }) {
  const cat = CATEGORIES.find(c => c.key === article.category);
  return (
    <div
      className="flex-shrink-0 w-52 bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group cursor-pointer"
      onClick={() => onView(article)}
    >
      <ArticleCover article={article} className="relative h-32">
        <div className="absolute top-2 right-2 z-10"><StatusBadge status={article.status} /></div>
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
          <button onClick={e => { e.stopPropagation(); onView(article); }}
            className="p-2 bg-white/90 rounded-lg text-slate-700 hover:bg-white transition-colors shadow-md"><Eye size={14} /></button>
          {isAdmin && (
            <button onClick={e => { e.stopPropagation(); onEdit(article); }}
              className="p-2 bg-white/90 rounded-lg text-slate-700 hover:bg-white transition-colors shadow-md"><Edit3 size={14} /></button>
          )}
        </div>
      </ArticleCover>
      <div className="p-3">
        {cat && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border mb-2 ${cat.color}`}>
            {cat.emoji} {cat.label}
          </span>
        )}
        <h4 className="font-bold text-slate-800 text-xs leading-snug line-clamp-2 mb-1.5 group-hover:text-teal-600 transition-colors">
          {article.title}
        </h4>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>{createdDate(article)}</span>
          {article.status === 'published' && <span>· {viewsCount(article)} 👁</span>}
        </div>
        {/* Per-type reaction counts */}
        {formatReactionSummary(article).length > 0 && (
          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100">
            {formatReactionSummary(article).map(r => (
              <span key={r.type} title={r.label}
                className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                <span>{r.icon}</span>
                <span className="font-semibold">{r.n}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Grid Card ─────────────────────────────────────────────────────────────────
function GridCard({ article, onEdit, onView, onDelete, isAdmin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cat = CATEGORIES.find(c => c.key === article.category);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-all group">
      <div className="relative cursor-pointer" onClick={() => onView(article)}>
        <ArticleCover article={article} className="w-full h-40">
          <div className="absolute top-2.5 right-2.5 z-10"><StatusBadge status={article.status} /></div>
        </ArticleCover>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-slate-800 text-sm leading-snug mb-1 cursor-pointer hover:text-teal-600 transition-colors line-clamp-2"
          onClick={() => onView(article)}>{article.title}</h3>
        <p className="text-slate-400 text-xs line-clamp-2 mb-2.5">{article.excerpt}</p>
        {cat && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border mb-3 ${cat.color}`}>
            {cat.emoji} {cat.label}
          </span>
        )}
        {/* Per-type reaction counts */}
        {formatReactionSummary(article).length > 0 && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
            {formatReactionSummary(article).map(r => (
              <span key={r.type} title={r.label}
                className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                <span>{r.icon}</span>
                <span className="font-semibold">{r.n}</span>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Calendar size={10} /> {createdDate(article)}
          </span>
          <div className="flex gap-1">
            <button onClick={() => onView(article)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"><Eye size={13} /></button>
            {isAdmin && (
              <>
                <button onClick={() => onEdit(article)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit3 size={13} /></button>
                <div className="relative">
                  <button onClick={() => setMenuOpen(o => !o)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><MoreVertical size={13} /></button>
                  {menuOpen && (
                    <div className="absolute right-0 top-8 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-10 py-1">
                      <button onClick={() => { setMenuOpen(false); onDelete(article); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile List Card ─────────────────────────────────────────────────────────
// Tarjeta horizontal compacta para la vista de lista en móvil.
// Cover thumbnail a la izquierda (80 × 80 px cuadrado), texto a la derecha.
function MobileListCard({ article, onView, onEdit, onDelete, isAdmin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cat = CATEGORIES.find(c => c.key === article.category);
  const reactions = formatReactionSummary(article);

  return (
    <div
      className="flex gap-3 bg-white rounded-2xl border border-slate-200 p-3 active:bg-slate-50 transition-colors cursor-pointer"
      onClick={() => onView(article)}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden">
        <ArticleCover
          article={article}
          className="w-full h-full"
          imgClassName="absolute inset-0 w-full h-full object-cover"
          emojiSize="text-3xl"
          emojiOpacity="opacity-60"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          {/* Category + status row */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {cat && (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${cat.color}`}>
                {cat.emoji} {cat.label}
              </span>
            )}
            <StatusBadge status={article.status} />
          </div>
          {/* Title */}
          <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2 group-hover:text-teal-600">
            {article.title}
          </h4>
        </div>

        {/* Bottom row: date + reactions + actions */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-0.5">
              <Calendar size={10} /> {createdDate(article)}
            </span>
            {reactions.length > 0 && (
              <span className="flex items-center gap-1">
                {reactions.map(r => (
                  <span key={r.type} className="flex items-center gap-0.5">
                    <span>{r.icon}</span>
                    <span className="font-semibold text-slate-500">{r.n}</span>
                  </span>
                ))}
              </span>
            )}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => onEdit(article)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Edit3 size={13} />
              </button>
              <div className="relative">
                <button onClick={() => setMenuOpen(o => !o)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <MoreVertical size={13} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
                    <button onClick={() => { setMenuOpen(false); onDelete(article); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── View: Dashboard ──────────────────────────────────────────────────────────
function BlogDashboard({ articles, loading, isAdmin, onNew, onEdit, onView, onDelete, tenantName }) {
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [mobileView, setMobileView]       = useState('list'); // 'list' | 'grid'

  const uniqueArticles = Array.from(
    new Map((articles || []).map(a => [a.id, a])).values()
  );

  const filtered = uniqueArticles.filter(a => {
    const matchSearch   = !search || a.title.toLowerCase().includes(search.toLowerCase()) || (a.excerpt || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus   = filterStatus === 'all' || a.status === filterStatus;
    const matchCategory = filterCategory === 'all' || a.category === filterCategory;
    return matchSearch && matchStatus && matchCategory;
  });

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat.key] = cat.key === 'all' ? uniqueArticles.length : uniqueArticles.filter(a => a.category === cat.key).length;
    return acc;
  }, {});

  const published   = uniqueArticles.filter(a => a.status === 'published').length;
  const drafts      = uniqueArticles.filter(a => a.status === 'draft').length;
  const editing     = uniqueArticles.filter(a => a.status === 'editing').length;
  const isFiltering = filterCategory !== 'all' || filterStatus !== 'all' || search.trim() !== '';

  const clearAll = () => { setFilterCategory('all'); setFilterStatus('all'); setSearch(''); };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 sm:pb-0">

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md flex-shrink-0">
              <Newspaper size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 leading-tight">Comunicación</h1>
              <p className="text-xs font-semibold text-teal-600 truncate">{tenantName}</p>
            </div>
          </div>
          {/* Desktop new-article button */}
          {isAdmin && (
            <button onClick={onNew}
              className="hidden sm:inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow-md active:scale-95">
              <Plus size={15} /> Nuevo Artículo
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-8 py-4 sm:py-6 space-y-3 sm:space-y-6">

        {/* ── STATS (admin only) ─────────────────────────────────── */}
        {isAdmin && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              { label: 'Publicados', value: published, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
              { label: 'Borradores', value: drafts,    color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock },
              { label: 'En Edición', value: editing,   color: 'text-blue-600',    bg: 'bg-blue-50',    icon: FileEdit },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={15} className={color} />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-2xl font-bold text-slate-800 leading-none">{value}</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SEARCH BAR ────────────────────────────────────────────
            Mobile: search + view-toggle en una sola fila
            Desktop: search + status pills en una fila             */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar artículos..."
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Mobile: list/grid toggle */}
          <div className="sm:hidden flex rounded-xl border border-slate-200 bg-white overflow-hidden">
            <button onClick={() => setMobileView('list')}
              className={`px-3 py-2.5 transition-colors ${mobileView === 'list' ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <LayoutList size={16} />
            </button>
            <button onClick={() => setMobileView('grid')}
              className={`px-3 py-2.5 transition-colors ${mobileView === 'grid' ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <LayoutGrid size={16} />
            </button>
          </div>

          {/* Desktop: status filter */}
          {isAdmin && (
            <div className="hidden sm:flex gap-2">
              {['all', 'published', 'draft', 'editing'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${filterStatus === s
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'}`}>
                  {s === 'all' ? 'Todos' : STATUS[s]?.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── MOBILE STATUS FILTER (admin) ──────────────────────── */}
        {isAdmin && (
          <div className="sm:hidden flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {['all', 'published', 'draft', 'editing'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterStatus === s
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-slate-600 border-slate-200'}`}>
                {s === 'all' ? 'Todos' : STATUS[s]?.label}
              </button>
            ))}
          </div>
        )}

        {/* ── CATEGORY CHIPS ────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase tracking-wide flex-shrink-0">
            <Filter size={11} /> Cat.
          </span>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {CATEGORIES.map(cat => {
              const isActive = filterCategory === cat.key;
              const count = categoryCounts[cat.key] ?? 0;
              if (cat.key !== 'all' && count === 0) return null;
              return (
                <button key={cat.key} onClick={() => setFilterCategory(cat.key)}
                  className={`inline-flex items-center gap-1 flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${isActive ? cat.active : cat.color}`}>
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                  <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold ${isActive ? 'bg-white/30' : 'bg-black/8'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── ACTIVE FILTERS SUMMARY ────────────────────────────── */}
        {isFiltering && (
          <div className="flex items-center gap-2 flex-wrap -mt-1">
            <span className="text-xs text-slate-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
            {filterCategory !== 'all' && (
              <button onClick={() => setFilterCategory('all')}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                {CATEGORIES.find(c => c.key === filterCategory)?.emoji} {CATEGORIES.find(c => c.key === filterCategory)?.label}
                <X size={10} />
              </button>
            )}
            {filterStatus !== 'all' && (
              <button onClick={() => setFilterStatus('all')}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                {STATUS[filterStatus]?.label} <X size={10} />
              </button>
            )}
            {search && (
              <button onClick={() => setSearch('')}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                "{search}" <X size={10} />
              </button>
            )}
            <button onClick={clearAll} className="text-xs text-teal-600 font-semibold hover:underline ml-1">
              Limpiar todo
            </button>
          </div>
        )}

        {/* ── ARTICLE LAYOUT ────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 size={32} className="animate-spin mr-3" />
            <span className="text-sm font-medium">Cargando artículos...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <BookOpen size={44} className="mx-auto mb-4 opacity-30" />
            <p className="font-bold text-base">No se encontraron artículos</p>
            <p className="text-sm mt-1 max-w-xs mx-auto">
              {isFiltering ? 'Intenta con otro filtro o ' : ''}{isAdmin ? 'crea un nuevo artículo' : 'aún no hay artículos publicados'}
            </p>
            {isFiltering && (
              <button onClick={clearAll}
                className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : isFiltering ? (
          /* ── FILTERED: grid universal ── */
          <>
            {/* Desktop grid */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(a => (
                <GridCard key={a.id} article={a} onEdit={onEdit} onView={onView} onDelete={onDelete} isAdmin={isAdmin} />
              ))}
            </div>
            {/* Mobile: list or 2-col grid based on toggle */}
            <div className="sm:hidden">
              {mobileView === 'list' ? (
                <div className="space-y-2">
                  {filtered.map(a => (
                    <MobileListCard key={a.id} article={a} onView={onView} onEdit={onEdit} onDelete={onDelete} isAdmin={isAdmin} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filtered.map(a => (
                    <GridCard key={a.id} article={a} onEdit={onEdit} onView={onView} onDelete={onDelete} isAdmin={isAdmin} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── NORMAL (no filter) ── */
          <>
            {/* ─── DESKTOP layout: hero + carousel ─────────────── */}
            <div className="hidden sm:block space-y-8">
              <HeroCard article={filtered[0]} onEdit={onEdit} onView={onView} isAdmin={isAdmin} />
              {filtered.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <ChevronRight size={16} className="text-teal-500" /> Artículos anteriores
                    </h3>
                    <span className="text-xs text-slate-400">{filtered.length - 1} artículo{filtered.length - 1 !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                    {filtered.slice(1).map(a => (
                      <CarouselCard key={a.id} article={a} onEdit={onEdit} onView={onView} isAdmin={isAdmin} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ─── MOBILE layout ───────────────────────────────── */}
            <div className="sm:hidden space-y-3">
              {/* Hero compacto en móvil */}
              <div
                className="relative w-full rounded-2xl overflow-hidden cursor-pointer group"
                style={{ height: 200 }}
                onClick={() => onView(filtered[0])}
              >
                <ArticleCover
                  article={filtered[0]}
                  className="absolute inset-0 w-full h-full"
                  imgClassName="absolute inset-0 w-full h-full object-cover"
                  emojiSize="text-7xl"
                  emojiOpacity="opacity-20"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
                {/* Más reciente badge */}
                <div className="absolute top-3 left-3 z-10">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-[11px] font-bold">
                    <Sparkles size={10} /> Más reciente
                  </span>
                </div>
                {/* Status */}
                <div className="absolute top-3 right-3 z-10">
                  <StatusBadge status={filtered[0].status} />
                </div>
                {/* Content overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
                  {(() => { const cat = CATEGORIES.find(c => c.key === filtered[0].category); return cat ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border mb-2 ${cat.color}`}>
                      {cat.emoji} {cat.label}
                    </span>
                  ) : null; })()}
                  <h2 className="text-white font-extrabold text-base leading-snug line-clamp-2 mb-2">
                    {filtered[0].title}
                  </h2>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Calendar size={9} /> {createdDate(filtered[0])}
                    </span>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onView(filtered[0])}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-slate-800 rounded-xl text-xs font-bold active:scale-95 shadow-md">
                        <Eye size={12} /> Leer
                      </button>
                      {isAdmin && (
                        <button onClick={() => onEdit(filtered[0])}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/15 backdrop-blur-sm border border-white/25 text-white rounded-xl text-xs font-bold active:scale-95">
                          <Edit3 size={12} /> Editar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista / grid del resto */}
              {filtered.length > 1 && (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                      <ChevronRight size={14} className="text-teal-500" />
                      Más artículos
                      <span className="text-xs text-slate-400 font-normal">({filtered.length - 1})</span>
                    </h3>
                    {/* List/grid toggle inline */}
                    <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <button onClick={() => setMobileView('list')}
                        className={`px-2.5 py-1.5 transition-colors ${mobileView === 'list' ? 'bg-teal-600 text-white' : 'text-slate-500'}`}>
                        <LayoutList size={13} />
                      </button>
                      <button onClick={() => setMobileView('grid')}
                        className={`px-2.5 py-1.5 transition-colors ${mobileView === 'grid' ? 'bg-teal-600 text-white' : 'text-slate-500'}`}>
                        <LayoutGrid size={13} />
                      </button>
                    </div>
                  </div>

                  {mobileView === 'list' ? (
                    <div className="space-y-2">
                      {filtered.slice(1).map(a => (
                        <MobileListCard key={a.id} article={a} onView={onView} onEdit={onEdit} onDelete={onDelete} isAdmin={isAdmin} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {filtered.slice(1).map(a => (
                        <GridCard key={a.id} article={a} onEdit={onEdit} onView={onView} onDelete={onDelete} isAdmin={isAdmin} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── FAB MÓVIL (admin) — botón flotante para crear artículo ── */}
      {isAdmin && (
        <button
          onClick={onNew}
          className="sm:hidden fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-all hover:bg-teal-700"
          style={{ boxShadow: '0 4px 20px rgba(13,148,136,0.45)' }}
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}

// ─── View: Article Reader ──────────────────────────────────────────────────────
function ArticleReader({ article, onBack, onEdit, tenantName, isAdmin, tenantId }) {
  const qc = useQueryClient();

  // ── Live article state ──────────────────────────────────────────────
  // The parent passes `article` from a stale snapshot (set when the user
  // clicked "View"). After a reaction the dashboard list is re-fetched,
  // but the prop reference doesn't update — so counts and "selected"
  // state appeared frozen until you closed and re-opened the article.
  //
  // We keep a local copy and update it from the server response of every
  // reaction so the count + selection both refresh in real time.
  const [liveArticle, setLiveArticle] = useState(article);
  useEffect(() => { setLiveArticle(article); }, [article]);

  // Registrar vista al abrir el artículo (solo artículos publicados)
  useEffect(() => {
    if (article?.id && article?.status === 'published') {
      blogAPI.recordView(tenantId, article.id).catch(() => {});
    }
  }, [article?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reactMutation = useMutation({
    mutationFn: (type) => blogAPI.react(tenantId, article.id, type),
    onSuccess: (res) => {
      // The /react/ endpoint returns the full updated post — use it to
      // refresh both counts and `my_reactions` immediately.
      if (res?.data) setLiveArticle(res.data);
      // Keep the dashboard cards consistent on the next render.
      qc.invalidateQueries({ queryKey: ['blog-posts', tenantId] });
    },
    onError: () => toast.error('No se pudo registrar tu reacción'),
  });

  const reactions = liveArticle.reactions || { counts: {}, my_reactions: [] };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-teal-600 font-medium transition-colors">
            <ArrowLeft size={16} /> Volver al tablero
          </button>
          <div className="flex items-center gap-2">
            <StatusBadge status={article.status} />
            {isAdmin && (
              <button onClick={() => onEdit(article)}
                className="inline-flex items-center gap-2 text-sm border border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-600 px-3 py-1.5 rounded-lg font-medium transition-colors">
                <Edit3 size={14} /> Editar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
        {/* Tenant branding */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-600">{tenantName}</span>
        </div>

        {/* Cover */}
        <CoverBlock article={liveArticle} large />

        <div className="mt-4 sm:mt-6 bg-white rounded-2xl border border-slate-200 p-4 sm:p-8">
          {/* Tags */}
          {article.tags?.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {article.tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-teal-50 text-teal-700 text-xs font-medium rounded-full border border-teal-200">
                  <Tag size={10} /> {t}
                </span>
              ))}
            </div>
          )}

          <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 leading-tight mb-3">{article.title}</h1>

          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-400 pb-4 sm:pb-5 border-b border-slate-100 mb-4 sm:mb-6">
            <span className="flex items-center gap-1.5"><User size={12} /> {authorName(article)}</span>
            <span className="flex items-center gap-1.5"><Calendar size={12} />
              {publishedDate(article) || createdDate(article)}
            </span>
            {article.status === 'published' && (
              <span className="flex items-center gap-1.5"><Eye size={12} /> {viewsCount(article)} vistas</span>
            )}
          </div>

          {/* Content — `blog-article-body` constrains inserted images to the
              container width and keeps typography readable. */}
          <div className="blog-article-body prose max-w-none text-slate-700 leading-relaxed">
            {article.content
              ? <div dangerouslySetInnerHTML={{ __html: article.content }} />
              : <p className="text-lg font-medium text-slate-600">{article.excerpt}</p>
            }
          </div>

          {/* Reactions — only ONE per user. Clicking the same one again
              removes it; clicking another replaces it. The current count is
              always visible (including zero) so users always see how many
              people have interacted. */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              ¿Qué te pareció este artículo?
            </p>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              {REACTIONS.map(({ type, icon, label }) => {
                const count  = reactions.counts?.[type] ?? 0;
                const active = reactions.my_reactions?.includes(type);
                const busy   = reactMutation.isPending;
                return (
                  <button key={type}
                    type="button"
                    disabled={busy}
                    onClick={() => reactMutation.mutate(type)}
                    title={label}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 ${
                      active
                        ? 'border-teal-400 bg-teal-50 text-teal-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-600'
                    }`}>
                    <span className="text-lg leading-none">{icon}</span>
                    <span className="text-xs">{label}</span>
                    <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
                      active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Solo puedes elegir una reacción por artículo.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Publish Modal ─────────────────────────────────────────────────────────────
function PublishModal({ onClose, onPublish, tenantId }) {
  const [audience, setAudience]           = useState('all');
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [userSearch, setUserSearch]       = useState('');
  const [sendEmail, setSendEmail]         = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['tenant-users-blog', tenantId],
    queryFn:  () => usersAPI.list(tenantId),
    select:   res => res.data?.results || res.data || [],
    staleTime: 60_000,
  });

  const allUsers = usersData || [];
  const filteredUsers = allUsers.filter(u =>
    !userSearch || (u.name || u.user_name || '').toLowerCase().includes(userSearch.toLowerCase())
  );

  const toggleRole = (key) => setSelectedRoles(prev => prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key]);
  const toggleUser = (id)  => setSelectedUsers(prev => prev.includes(id)  ? prev.filter(u => u !== id)  : [...prev, id]);

  const audienceLabel = audience === 'all'
    ? 'Todos los usuarios'
    : audience === 'roles'
    ? `${selectedRoles.length} tipo(s) de usuario`
    : `${selectedUsers.length} usuario(s) seleccionado(s)`;

  const canPublish = audience === 'all'
    || (audience === 'roles' && selectedRoles.length > 0)
    || (audience === 'specific' && selectedUsers.length > 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
              <Send size={18} className="text-teal-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Publicar Artículo</h2>
              <p className="text-xs text-slate-500">Define quién podrá ver este artículo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
          <div className="space-y-2">
            {AUDIENCE_OPTIONS.map(opt => (
              <label key={opt.key}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${audience === opt.key ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="radio" name="audience" value={opt.key}
                  checked={audience === opt.key} onChange={() => setAudience(opt.key)}
                  className="mt-0.5 accent-teal-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <opt.icon size={14} className={audience === opt.key ? 'text-teal-600' : 'text-slate-400'} />
                    <span className="text-sm font-semibold text-slate-800">{opt.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {audience === 'roles' && (
            <div className="mt-2 space-y-1 pl-1">
              <p className="text-xs font-semibold text-slate-600 mb-2">Selecciona los roles:</p>
              {ROLES_LIST.map(role => (
                <label key={role.key} className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${selectedRoles.includes(role.key) ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={selectedRoles.includes(role.key)}
                    onChange={() => toggleRole(role.key)} className="accent-teal-600 w-4 h-4" />
                  <span className="text-sm text-slate-700">{role.label}</span>
                  {selectedRoles.includes(role.key) && <Check size={13} className="text-teal-500 ml-auto" />}
                </label>
              ))}
            </div>
          )}

          {audience === 'specific' && (
            <div className="mt-2 space-y-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar usuario..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {filteredUsers.map(u => {
                  const uid  = u.user || u.id;
                  const name = u.user_name || u.name || u.email || uid;
                  return (
                    <label key={uid} className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${selectedUsers.includes(uid) ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={selectedUsers.includes(uid)}
                        onChange={() => toggleUser(uid)} className="accent-teal-600 w-4 h-4" />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">{name}</span>
                        <span className="text-xs text-slate-400 ml-2">· {u.role}</span>
                      </div>
                      {selectedUsers.includes(uid) && <Check size={13} className="text-teal-500" />}
                    </label>
                  );
                })}
              </div>
              {selectedUsers.length > 0 && (
                <p className="text-xs text-teal-600 font-medium">{selectedUsers.length} usuario(s) seleccionado(s)</p>
              )}
            </div>
          )}
          {/* Email option */}
          <div className="pt-3 border-t border-slate-100">
            <label className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${sendEmail ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={e => setSendEmail(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-teal-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Mail size={14} className={sendEmail ? 'text-teal-600' : 'text-slate-400'} />
                  <span className="text-sm font-semibold text-slate-800">Enviar por correo electrónico</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Notifica a los destinatarios por email con el contenido del artículo
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Users size={13} />
            <span>Se publicará para: <strong className="text-slate-700">{audienceLabel}</strong></span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={() => canPublish && onPublish({ audience_type: audience, audience_roles: selectedRoles, audience_user_ids: selectedUsers.map(String), send_email: sendEmail })}
              disabled={!canPublish}
              className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all active:scale-95">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Publicar ahora</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── View: Editor ──────────────────────────────────────────────────────────────
// Preview de portada en el editor — maneja tanto data: URLs (preview local
// inmediato) como URLs del servidor (artículo ya guardado con portada).
// Usa useBlogCover para las URLs del servidor para mayor consistencia.
function EditorCoverPreview({ url, gradient, emoji }) {
  const objectUrl = useBlogCover(url);
  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => { setImgFailed(false); }, [objectUrl]);

  if (!objectUrl || imgFailed) {
    return (
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <span className="text-6xl">{emoji}</span>
      </div>
    );
  }
  return (
    <img
      src={objectUrl}
      alt="Portada"
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setImgFailed(true)}
    />
  );
}

function ArticleEditor({ article: initialArticle, onBack, onSaved, tenantId, tenantName }) {
  const isNew = !initialArticle?.id;
  const qc    = useQueryClient();

  const [step,              setStep]              = useState(isNew ? 'template' : 'editor');
  const [selectedTemplate,  setSelectedTemplate]  = useState(null);
  const [title,             setTitle]             = useState(initialArticle?.title || '');
  const [excerpt,           setExcerpt]           = useState(initialArticle?.excerpt || '');
  const [content,           setContent]           = useState(initialArticle?.content || '');
  const [coverGrad,         setCoverGrad]         = useState(initialArticle?.cover_gradient || 'from-teal-400 to-cyan-500');
  const [emoji,             setEmoji]             = useState(initialArticle?.cover_emoji || '📄');
  const [category,          setCategory]          = useState(initialArticle?.category || '');
  const [tags,              setTags]              = useState(initialArticle?.tags || []);
  const [tagInput,          setTagInput]          = useState('');
  const [showPublishModal,  setShowPublishModal]  = useState(false);

  // ── Cover image (file upload) ───────────────────────────────────────────────
  // The user may either pick a pre-defined gradient+emoji theme OR upload
  // a custom image which replaces the gradient cover entirely.
  const [coverImageUrl,  setCoverImageUrl]  = useState(initialArticle?.cover_image_url || '');
  const [coverImageFile, setCoverImageFile] = useState(null);    // pending upload (after first save)
  const coverInputRef = useRef(null);
  const bodyImageInputRef = useRef(null);

  // ── Rich-text editor ref ─────────────────────────────────────────────────────
  // We MUST NOT use dangerouslySetInnerHTML with a state variable on a
  // contentEditable div — React re-renders reset the cursor on every keystroke.
  // Instead, we set innerHTML once on mount and then only read it via onInput.
  const editorRef = useRef(null);
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialArticle?.content || '';
    }
  }, []); // intentionally empty: set only once on mount

  const invalidate = () => qc.invalidateQueries({ queryKey: ['blog-posts', tenantId] });

  // Local saving flag — used by handleSaveDraft / handlePublish to disable
  // the toolbar buttons while the post + cover image upload are in flight.
  const [saving, setSaving] = useState(false);

  const publishMutation = useMutation({
    mutationFn: ({ postId, publishConfig }) => blogAPI.publish(tenantId, postId, publishConfig),
    onSuccess: () => {
      invalidate();
      toast.success('¡Artículo publicado!');
      onSaved();
    },
    onError: () => toast.error('Error al publicar el artículo'),
  });

  // Upload the pending cover-image (if any) for a given post id, then return
  // the updated cover_image_url from the response. Surfaces a useful error
  // when the backend rejects the file (oversized, unsupported, etc.).
  const uploadPendingCover = async (postId) => {
    if (!coverImageFile || !postId) return null;
    const fd = new FormData();
    fd.append('image', coverImageFile);
    try {
      const res = await blogAPI.uploadCover(tenantId, postId, fd);
      const url = res?.data?.cover_image_url || null;
      setCoverImageFile(null);
      if (url) setCoverImageUrl(url);
      return url;
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.image ||
        err?.message ||
        '';
      toast.error(`No se pudo subir la imagen de portada${detail ? `: ${detail}` : ''}`);
      return null;
    }
  };

  const handleSaveDraft = async () => {
    if (!title.trim()) return toast.error('El título es obligatorio');
    setSaving(true);
    try {
      let postId = initialArticle?.id;
      if (isNew || !postId) {
        const res = await blogAPI.create(tenantId, {
          title, excerpt, content,
          cover_gradient: coverGrad, cover_emoji: emoji,
          category, tags, status: 'draft',
        });
        postId = res?.data?.id;
      } else {
        await blogAPI.update(tenantId, postId, {
          title, excerpt, content,
          cover_gradient: coverGrad, cover_emoji: emoji,
          category, tags,
        });
      }
      if (coverImageFile && postId) {
        await uploadPendingCover(postId);
      }
      invalidate();
      toast.success(isNew ? 'Borrador creado' : 'Artículo guardado');
      onSaved();
    } catch {
      toast.error('Error al guardar el artículo');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (publishConfig) => {
    setShowPublishModal(false);
    if (!title.trim()) { toast.error('El título es obligatorio'); return; }
    try {
      let postId;
      if (isNew || !initialArticle?.id) {
        // Create the draft first, then publish it
        const res = await blogAPI.create(tenantId, {
          title, excerpt, content,
          cover_gradient: coverGrad, cover_emoji: emoji,
          category, tags, status: 'draft',
        });
        postId = res.data?.id;
        if (!postId) throw new Error('No se recibió ID del artículo creado');
      } else {
        // Save latest edits before publishing
        await blogAPI.update(tenantId, initialArticle.id, {
          title, excerpt, content,
          cover_gradient: coverGrad, cover_emoji: emoji,
          category, tags,
        });
        postId = initialArticle.id;
      }
      // Upload pending cover image (if any) before publishing so recipients
      // get the right cover both in-app and in the email.
      if (coverImageFile && postId) {
        await uploadPendingCover(postId);
      }
      publishMutation.mutate({ postId, publishConfig });
    } catch {
      toast.error('Error al publicar el artículo');
    }
  };

  // Cover image: pick a local file → compress in the browser → preview
  // immediately. Actual upload to the backend happens on the next
  // "save draft" / "publish" action because the upload endpoint requires
  // the post to already exist.
  //
  // We accept every image MIME type the browser can read (image/*) and
  // re-encode to a sane resolution (max 1600 px, JPEG q=0.8) so the
  // article stays light even when the source is a 12 MP phone photo.
  const handleCoverPick = async (e) => {
    const file = e.target.files?.[0];
    // Always clear the input value so picking the same file twice re-triggers onChange.
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen');
      return;
    }
    // Generous hard ceiling — original may be huge; we compress before upload.
    if (file.size > 25 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máx 25 MB)');
      return;
    }
    try {
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.8 });
      setCoverImageFile(compressed instanceof File ? compressed : file);
      // Preview from the compressed file so the editor reflects exactly
      // what will be uploaded.
      const reader = new FileReader();
      reader.onload = ev => setCoverImageUrl(ev.target.result);
      reader.readAsDataURL(compressed instanceof Blob ? compressed : file);
    } catch {
      // Fallback: store the original file uncompressed
      setCoverImageFile(file);
      const reader = new FileReader();
      reader.onload = ev => setCoverImageUrl(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveCover = () => {
    setCoverImageFile(null);
    setCoverImageUrl('');
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  // Body image: pick a local file → compress aggressively → insert into
  // the editor as a base64 data URL. Keeping the bytes small is critical
  // because the whole HTML (incl. base64 images) is sent as a JSON field
  // on the next save; Django's DATA_UPLOAD_MAX_MEMORY_SIZE rejects
  // payloads above the configured cap otherwise.
  //
  // We accept every image format the browser can read (image/*) and
  // re-encode to a max long side of 1200 px and JPEG q=0.72.
  const handleInsertBodyImage = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen');
      return;
    }
    // Hard ceiling to avoid OOM during canvas decode of crazy-large files.
    if (file.size > 25 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máx 25 MB)');
      return;
    }
    try {
      const dataUrl = await compressImage(file, {
        maxDim: 1200,
        quality: 0.72,
        asDataUrl: true,
      });
      if (!dataUrl) {
        toast.error('No se pudo procesar la imagen');
        return;
      }
      // Restore focus to the editor so insertImage drops at the cursor
      editorRef.current?.focus();
      const ok = document.execCommand('insertImage', false, dataUrl);
      if (!ok && editorRef.current) {
        // Fallback for browsers where execCommand returns false
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.maxWidth = '100%';
        img.style.height   = 'auto';
        editorRef.current.appendChild(img);
      }
      // Apply responsive styling to every newly-inserted image
      if (editorRef.current) {
        editorRef.current.querySelectorAll('img').forEach(img => {
          img.style.maxWidth = '100%';
          img.style.height   = 'auto';
          img.style.borderRadius = '8px';
          img.style.margin   = '8px 0';
        });
        setContent(editorRef.current.innerHTML);
      }
    } catch {
      toast.error('No se pudo insertar la imagen');
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) { setTags(prev => [...prev, t]); setTagInput(''); }
  };

  // Template selection step
  if (step === 'template') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Nuevo Artículo</h1>
              <p className="text-xs text-slate-500">Elige una plantilla para comenzar</p>
            </div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center gap-2 mb-5 sm:mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">¿Con qué quieres empezar?</p>
              <p className="text-xs text-slate-500">Las plantillas te ayudan a crear artículos más rápido</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {TEMPLATES.map(t => (
              <button key={t.id}
                onClick={() => {
                  setSelectedTemplate(t);
                  setCoverGrad(t.gradient);
                  setEmoji(t.emoji);
                  setCategory(t.category);
                  setStep('editor');
                }}
                className="bg-white border-2 border-slate-200 hover:border-teal-400 rounded-xl p-5 text-left transition-all hover:shadow-md group active:scale-95">
                <div className="text-3xl mb-3">{t.icon}</div>
                <p className="font-semibold text-slate-800 text-sm mb-1 group-hover:text-teal-700">{t.label}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isSaving = saving || publishMutation.isPending;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-slate-700">{isNew ? 'Nuevo artículo' : 'Editando artículo'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSaveDraft} disabled={isSaving}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors disabled:opacity-50">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span className="hidden sm:inline">Guardar borrador</span>
              <span className="sm:hidden">Guardar</span>
            </button>
            <button onClick={() => setShowPublishModal(true)} disabled={isSaving || !title.trim()}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-50">
              <Send size={14} /> Publicar
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 max-w-5xl mx-auto w-full px-3 sm:px-8 py-4 sm:py-6 gap-4 sm:gap-6">
        {/* Main editor */}
        <div className="flex-1 space-y-4 min-w-0 order-1">
          {/* Cover selector — supports either a pre-defined gradient+emoji
              template OR a custom uploaded image which replaces the template
              entirely. The actual upload happens on the next save. */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Preview de portada: usa ArticleCover para artículos existentes (URL pública),
                o <img> directo para la preview local (data: URL) antes de subir. */}
            <div className={`relative h-48 ${!coverImageUrl ? `bg-gradient-to-br ${coverGrad}` : ''}`}>
              {coverImageUrl ? (
                <EditorCoverPreview
                  url={coverImageUrl}
                  gradient={coverGrad}
                  emoji={emoji}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl">{emoji}</span>
                </div>
              )}
              {coverImageUrl && (
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-semibold text-slate-700 hover:bg-white shadow-md transition-all">
                  <X size={12} /> Quitar
                </button>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Portada del artículo</p>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverPick}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-semibold transition-colors">
                  <Upload size={12} /> {coverImageUrl ? 'Cambiar foto' : 'Subir foto'}
                </button>
              </div>
              {!coverImageUrl && (
                <>
                  <p className="text-[11px] text-slate-400">O elige una plantilla:</p>
                  <div className="flex flex-wrap gap-2">
                    {COVER_THEMES.map((th, i) => (
                      <button key={i}
                        type="button"
                        onClick={() => { setCoverGrad(th.gradient); setEmoji(th.emoji); }}
                        className={`w-8 h-8 rounded-lg bg-gradient-to-br ${th.gradient} transition-all hover:scale-110 ${coverGrad === th.gradient ? 'ring-2 ring-offset-1 ring-teal-500 scale-110' : ''}`}
                        title={th.emoji}
                      />
                    ))}
                  </div>
                </>
              )}
              {coverImageFile && (
                <p className="text-[11px] text-amber-600 font-medium">
                  La foto se subirá al guardar el artículo.
                </p>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Título del artículo..."
              className="w-full text-2xl font-bold text-slate-800 placeholder-slate-300 focus:outline-none" />
          </div>

          {/* Excerpt */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Descripción corta (para el tablero)</label>
            <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)}
              rows={2} placeholder="Resume el artículo en una o dos oraciones..."
              className="w-full text-sm text-slate-700 placeholder-slate-400 focus:outline-none resize-none" />
          </div>

          {/* Rich Text Editor */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-1 p-3 border-b border-slate-100 flex-wrap">
              {[
                { icon: Bold,         title: 'Negrita',          cmd: 'bold' },
                { icon: Italic,       title: 'Cursiva',          cmd: 'italic' },
                { icon: Underline,    title: 'Subrayado',        cmd: 'underline' },
                null,
                { icon: AlignLeft,    title: 'Izquierda',        cmd: 'justifyLeft' },
                { icon: AlignCenter,  title: 'Centrar',          cmd: 'justifyCenter' },
                { icon: AlignRight,   title: 'Derecha',          cmd: 'justifyRight' },
                null,
                { icon: List,         title: 'Lista',            cmd: 'insertUnorderedList' },
                { icon: ListOrdered,  title: 'Lista numerada',   cmd: 'insertOrderedList' },
                null,
                { icon: Link2,        title: 'Enlace',           cmd: 'createLink', prompt: 'Pega la URL del enlace:' },
                { icon: Minus,        title: 'Divisor',          cmd: 'insertHorizontalRule' },
              ].map((item, i) =>
                item === null ? (
                  <div key={`sep-${i}`} className="w-px h-5 bg-slate-200 mx-1" />
                ) : (
                  <button key={item.title} title={item.title}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      editorRef.current?.focus();
                      if (item.prompt) {
                        const url = window.prompt(item.prompt, 'https://');
                        if (url) document.execCommand(item.cmd, false, url);
                      } else {
                        document.execCommand(item.cmd, false, null);
                      }
                      if (editorRef.current) setContent(editorRef.current.innerHTML);
                    }}
                    className="p-1.5 rounded text-slate-500 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                    <item.icon size={15} />
                  </button>
                )
              )}
              {/* Separator + Image upload button */}
              <div className="w-px h-5 bg-slate-200 mx-1" />
              <input
                ref={bodyImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleInsertBodyImage}
                className="hidden"
              />
              <button
                type="button"
                title="Insertar imagen"
                onMouseDown={e => e.preventDefault()}
                onClick={() => bodyImageInputRef.current?.click()}
                className="p-1.5 rounded text-slate-500 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                <Image size={15} />
              </button>
            </div>
            <div className="relative">
              {!content && (
                <span className="absolute top-5 left-5 text-slate-300 text-sm pointer-events-none select-none">
                  Escribe tu artículo aquí...
                </span>
              )}
              <div
                ref={editorRef}
                className="blog-editor-area min-h-[320px] p-5 text-slate-700 text-sm leading-relaxed focus:outline-none"
                contentEditable
                suppressContentEditableWarning
                onInput={e => setContent(e.currentTarget.innerHTML)}
                onBlur={e => setContent(e.currentTarget.innerHTML)}
                style={{ overflowWrap: 'break-word' }}
              />
            </div>
          </div>
        </div>

        {/* Sidebar — full width on mobile (grid), fixed 256px on desktop */}
        <div className="w-full lg:w-64 lg:flex-shrink-0 order-2 lg:order-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-3 lg:space-y-0 lg:block">
          <div className="lg:space-y-4">
          {/* Tenant info */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Condominio</p>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                <Building2 size={16} className="text-white" />
              </div>
              <p className="text-sm font-bold text-slate-800">{tenantName}</p>
            </div>
          </div>

          {/* Category */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Categoría</p>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white text-slate-700">
              <option value="">Sin categoría</option>
              {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Etiquetas</p>
            <div className="flex gap-1 flex-wrap mb-2">
              {tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-full border border-teal-200">
                  {t}
                  <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="hover:text-red-500"><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Agregar etiqueta..."
                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              <button onClick={addTag} className="px-2 py-1.5 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition-colors">
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Estado actual</p>
            <StatusBadge status={initialArticle?.status || 'draft'} />
          </div>

          {selectedTemplate && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Plantilla activa</p>
              <p className="text-sm font-bold text-amber-800">{selectedTemplate.icon} {selectedTemplate.label}</p>
            </div>
          )}
          </div>{/* lg:space-y-4 */}
          </div>{/* grid */}
        </div>{/* sidebar outer */}
      </div>

      {showPublishModal && (
        <PublishModal
          tenantId={tenantId}
          onClose={() => setShowPublishModal(false)}
          onPublish={handlePublish}
        />
      )}
    </div>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────
export default function Blog() {
  const { tenantId, role, isAdmin, isSuperAdmin, tenant } = useAuth();
  const qc = useQueryClient();
  const tenantName = tenant?.name || 'Condominio';
  const canEdit    = isAdmin || isSuperAdmin;

  const [view,          setView]          = useState('dashboard');
  const [activeArticle, setActiveArticle] = useState(null);

  // Fetch articles
  const { data: postsData, isLoading } = useQuery({
    queryKey: ['blog-posts', tenantId],
    queryFn:  () => blogAPI.list(tenantId),
    enabled:  !!tenantId,
    select:   res => res.data?.results || res.data || [],
  });

  const articles = postsData || [];

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => blogAPI.destroy(tenantId, id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['blog-posts', tenantId] });
      toast.success('Artículo eliminado');
      setView('dashboard');
    },
    onError: () => toast.error('Error al eliminar el artículo'),
  });

  const handleDelete = useCallback((article) => {
    if (!window.confirm(`¿Eliminar "${article.title}"? Esta acción no se puede deshacer.`)) return;
    deleteMutation.mutate(article.id);
  }, [deleteMutation]);

  const handleNew   = () => { setActiveArticle(null); setView('editor'); };
  const handleEdit  = (article) => { setActiveArticle(article); setView('editor'); };
  const handleView  = (article) => { setActiveArticle(article); setView('reader'); };
  const handleBack  = () => setView('dashboard');
  const handleSaved = () => { setView('dashboard'); setActiveArticle(null); };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No se pudo cargar el condominio. Intenta recargar la página.
      </div>
    );
  }

  return (
    <div>
      {view === 'dashboard' && (
        <BlogDashboard
          articles={articles}
          loading={isLoading}
          isAdmin={canEdit}
          onNew={handleNew}
          onEdit={handleEdit}
          onView={handleView}
          onDelete={handleDelete}
          tenantName={tenantName}
        />
      )}
      {view === 'editor' && (
        <ArticleEditor
          article={activeArticle}
          onBack={handleBack}
          onSaved={handleSaved}
          tenantId={tenantId}
          tenantName={tenantName}
        />
      )}
      {view === 'reader' && activeArticle && (
        <ArticleReader
          article={activeArticle}
          onBack={handleBack}
          onEdit={handleEdit}
          tenantName={tenantName}
          isAdmin={canEdit}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
