/**
 * CRM.jsx — Módulo de Gestión Comercial Homly
 * Disponible solo para SuperAdmin bajo el menú SISTEMA.
 *
 * Tabs:
 *  1. Dashboard CRM  — estadísticas generales y actividad reciente
 *  2. Ventas         — Contactos + Pipeline Kanban
 *  3. Marketing      — Campañas
 *  4. Servicio       — Tickets de soporte
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { crmAPI } from '../api/client';
import {
  Users, TrendingUp, Mail, Ticket,
  Plus, Search, Filter, RefreshCw, X, Check,
  Phone, Building2, MapPin, Star, ChevronRight,
  BarChart2, Target, Zap, Clock, CheckCircle,
  AlertCircle, MessageCircle, Calendar, Eye,
  Edit, Trash2, ArrowRight, Award, Globe,
  Activity, Inbox, Tag, Send, MoreVertical,
  PhoneCall, Video, FileText, Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTACT_STATUS = {
  lead:      { label: 'Lead',           color: 'bg-slate-100 text-slate-600' },
  prospect:  { label: 'Prospecto',      color: 'bg-blue-100 text-blue-700' },
  qualified: { label: 'Calificado',     color: 'bg-indigo-100 text-indigo-700' },
  customer:  { label: 'Cliente Activo', color: 'bg-green-100 text-green-700' },
  churned:   { label: 'Cliente Perdido',color: 'bg-orange-100 text-orange-700' },
  lost:      { label: 'Perdido',        color: 'bg-red-100 text-red-600' },
};

const OPPORTUNITY_STAGES = [
  { key: 'new',         label: 'Nuevo',            color: 'bg-slate-500',  light: 'bg-slate-50  border-slate-200' },
  { key: 'contacted',   label: 'Contactado',        color: 'bg-blue-500',   light: 'bg-blue-50   border-blue-200' },
  { key: 'qualified',   label: 'Calificado',        color: 'bg-indigo-500', light: 'bg-indigo-50 border-indigo-200' },
  { key: 'demo',        label: 'Demo',              color: 'bg-violet-500', light: 'bg-violet-50 border-violet-200' },
  { key: 'proposal',    label: 'Propuesta',         color: 'bg-amber-500',  light: 'bg-amber-50  border-amber-200' },
  { key: 'negotiation', label: 'Negociación',       color: 'bg-orange-500', light: 'bg-orange-50 border-orange-200' },
  { key: 'won',         label: 'Ganado',            color: 'bg-green-500',  light: 'bg-green-50  border-green-200' },
  { key: 'lost',        label: 'Perdido',           color: 'bg-red-500',    light: 'bg-red-50    border-red-200' },
];

const TICKET_PRIORITY = {
  low:    { label: 'Baja',    color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  normal: { label: 'Normal',  color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  high:   { label: 'Alta',    color: 'bg-orange-100 text-orange-700',dot: 'bg-orange-500' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
};

const TICKET_STATUS = {
  open:        { label: 'Abierto',           color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'En Progreso',       color: 'bg-amber-100 text-amber-700' },
  waiting:     { label: 'Esperando',         color: 'bg-purple-100 text-purple-700' },
  resolved:    { label: 'Resuelto',          color: 'bg-green-100 text-green-700' },
  closed:      { label: 'Cerrado',           color: 'bg-slate-100 text-slate-600' },
};

const ACTIVITY_ICONS = {
  call:      <PhoneCall size={14} />,
  email:     <Mail size={14} />,
  whatsapp:  <MessageCircle size={14} />,
  meeting:   <Video size={14} />,
  demo:      <Target size={14} />,
  note:      <FileText size={14} />,
  task:      <Check size={14} />,
  follow_up: <ArrowRight size={14} />,
};

const CAMPAIGN_STATUS = {
  draft:     { label: 'Borrador',    color: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-700' },
  active:    { label: 'Activa',     color: 'bg-green-100 text-green-700' },
  paused:    { label: 'Pausada',    color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completada', color: 'bg-indigo-100 text-indigo-700' },
  cancelled: { label: 'Cancelada',  color: 'bg-red-100 text-red-600' },
};

const CURRENCY_SYMBOLS = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
const fmtAmt = (v, cur = 'MXN') =>
  `${CURRENCY_SYMBOLS[cur] || '$'}${Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Badge({ label, color, dot }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
    </span>
  );
}

function StatCard({ icon, label, value, sub, accent = 'teal' }) {
  const accents = {
    teal:   'from-teal-500 to-emerald-500',
    indigo: 'from-indigo-500 to-violet-500',
    amber:  'from-amber-500 to-orange-500',
    rose:   'from-rose-500 to-pink-500',
    blue:   'from-blue-500 to-cyan-500',
    green:  'from-green-500 to-teal-500',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-5">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${accents[accent]} text-white`}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-800 mb-1">{value}</div>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function ScoreBadge({ score }) {
  const c = score >= 70 ? 'bg-green-100 text-green-700' :
            score >= 40 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>
      <Star size={10} className="fill-current" /> {score}
    </span>
  );
}

function Modal({ title, onClose, children, wide = false, extraWide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${extraWide ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-colors';
const selectCls = `${inputCls} bg-white`;

function Btn({ onClick, disabled, variant = 'primary', size = 'md', children, type = 'button' }) {
  const variants = {
    primary:  'bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600 shadow-sm',
    secondary:'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    danger:   'bg-red-500 text-white hover:bg-red-600',
    ghost:    'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
    indigo:   'bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 shadow-sm',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-sm' };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl font-semibold transition-all ${variants[variant]} ${sizes[size]} disabled:opacity-50 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

function EmptyState({ icon, title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-2xl bg-slate-50 text-slate-300 mb-4">{icon}</div>
      <p className="text-slate-600 font-semibold text-lg mb-1">{title}</p>
      <p className="text-slate-400 text-sm mb-6">{sub}</p>
      {action}
    </div>
  );
}

// ─── Contact Form ─────────────────────────────────────────────────────────────

function ContactForm({ initial = {}, onSave, onClose, loading }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    company: '', cargo: '', country: '', state: '', city: '',
    units_count: 0, source: 'manual', status: 'lead',
    lead_score: 50, notes: '',
    ...initial,
    tags: Array.isArray(initial.tags) ? initial.tags.join(', ') : (initial.tags || ''),
  });
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.email.trim()) {
      toast.error('Nombre y email son requeridos'); return;
    }
    onSave({
      ...form,
      lead_score: parseInt(form.lead_score) || 0,
      units_count: parseInt(form.units_count) || 0,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre" required>
          <input className={inputCls} value={form.first_name} onChange={set('first_name')} placeholder="Juan" />
        </Field>
        <Field label="Apellido">
          <input className={inputCls} value={form.last_name} onChange={set('last_name')} placeholder="Pérez" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" required>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="juan@condominio.mx" />
        </Field>
        <Field label="Teléfono">
          <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="+52 55 1234 5678" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Condominio / Empresa">
          <input className={inputCls} value={form.company} onChange={set('company')} placeholder="Residencial Las Palmas" />
        </Field>
        <Field label="Cargo">
          <input className={inputCls} value={form.cargo} onChange={set('cargo')} placeholder="Administrador" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="País">
          <input className={inputCls} value={form.country} onChange={set('country')} placeholder="México" />
        </Field>
        <Field label="Estado">
          <input className={inputCls} value={form.state} onChange={set('state')} placeholder="CDMX" />
        </Field>
        <Field label="Ciudad">
          <input className={inputCls} value={form.city} onChange={set('city')} placeholder="Ciudad de México" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Unidades">
          <input className={inputCls} type="number" value={form.units_count} onChange={set('units_count')} min={0} />
        </Field>
        <Field label="Fuente">
          <select className={selectCls} value={form.source} onChange={set('source')}>
            <option value="landing_form">Landing Page</option>
            <option value="manual">Manual</option>
            <option value="referral">Referido</option>
            <option value="cold_outreach">Prospección</option>
            <option value="social_media">Redes Sociales</option>
            <option value="event">Evento</option>
            <option value="import">Importación</option>
            <option value="other">Otro</option>
          </select>
        </Field>
        <Field label="Estado">
          <select className={selectCls} value={form.status} onChange={set('status')}>
            <option value="lead">Lead</option>
            <option value="prospect">Prospecto</option>
            <option value="qualified">Calificado</option>
            <option value="customer">Cliente Activo</option>
            <option value="churned">Cliente Perdido</option>
            <option value="lost">Perdido</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={`Lead Score: ${form.lead_score}`}>
          <input type="range" min={0} max={100} value={form.lead_score} onChange={set('lead_score')}
            className="w-full accent-teal-500" />
        </Field>
        <Field label="Tags (separados por coma)">
          <input className={inputCls} value={form.tags} onChange={set('tags')} placeholder="decision-maker, urgente" />
        </Field>
      </div>
      <Field label="Notas">
        <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={set('notes')} placeholder="Notas internas..." />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {initial.id ? 'Guardar cambios' : 'Crear contacto'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Opportunity Form ─────────────────────────────────────────────────────────

function OpportunityForm({ contacts, initial = {}, onSave, onClose, loading }) {
  const [form, setForm] = useState({
    contact: '', title: '', stage: 'new', value: '',
    currency: 'MXN', probability: 50,
    expected_close: '', notes: '',
    ...initial,
  });
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.contact || !form.title.trim()) {
      toast.error('Contacto y título son requeridos'); return;
    }
    onSave({ ...form, value: parseFloat(form.value) || 0, probability: parseInt(form.probability) || 0 });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Contacto" required>
        <select className={selectCls} value={form.contact} onChange={set('contact')}>
          <option value="">Seleccionar contacto...</option>
          {contacts.map(c => (
            <option key={c.id} value={c.id}>{c.full_name} — {c.company || c.email}</option>
          ))}
        </select>
      </Field>
      <Field label="Título del negocio" required>
        <input className={inputCls} value={form.title} onChange={set('title')} placeholder="Homly Enterprise — Residencial Las Palmas" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Etapa">
          <select className={selectCls} value={form.stage} onChange={set('stage')}>
            {OPPORTUNITY_STAGES.filter(s => !['won','lost'].includes(s.key)).map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label={`Probabilidad: ${form.probability}%`}>
          <input type="range" min={0} max={100} value={form.probability} onChange={set('probability')}
            className="w-full accent-teal-500 mt-2" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Field label="Valor del negocio">
            <input className={inputCls} type="number" value={form.value} onChange={set('value')} min={0} step={100} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Moneda">
          <select className={selectCls} value={form.currency} onChange={set('currency')}>
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="COP">COP</option>
          </select>
        </Field>
      </div>
      <Field label="Fecha estimada de cierre">
        <input className={inputCls} type="date" value={form.expected_close} onChange={set('expected_close')} />
      </Field>
      <Field label="Notas">
        <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={set('notes')} />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {initial.id ? 'Guardar' : 'Crear oportunidad'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Activity Form ────────────────────────────────────────────────────────────

function ActivityForm({ contacts, opportunities, initial = {}, onSave, onClose, loading }) {
  const [form, setForm] = useState({
    contact: '', opportunity: '', type: 'note', title: '',
    description: '', scheduled_at: '', is_completed: false, ...initial,
  });
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const toggle = (k) => setForm(p => ({ ...p, [k]: !p[k] }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('El título es requerido'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo de actividad">
          <select className={selectCls} value={form.type} onChange={set('type')}>
            <option value="note">Nota Interna</option>
            <option value="call">Llamada</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="meeting">Reunión</option>
            <option value="demo">Demo</option>
            <option value="task">Tarea</option>
            <option value="follow_up">Seguimiento</option>
          </select>
        </Field>
        <Field label="Fecha programada">
          <input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
        </Field>
      </div>
      <Field label="Título" required>
        <input className={inputCls} value={form.title} onChange={set('title')} placeholder="Ej: Llamada de seguimiento" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contacto">
          <select className={selectCls} value={form.contact} onChange={set('contact')}>
            <option value="">Sin contacto</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </Field>
        <Field label="Oportunidad">
          <select className={selectCls} value={form.opportunity} onChange={set('opportunity')}>
            <option value="">Sin oportunidad</option>
            {opportunities.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descripción / Notas">
        <textarea className={`${inputCls} resize-none`} rows={3} value={form.description} onChange={set('description')} />
      </Field>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_completed} onChange={() => toggle('is_completed')}
          className="rounded accent-teal-500" />
        <span className="text-sm text-slate-600">Marcar como completada</span>
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          Registrar actividad
        </Btn>
      </div>
    </form>
  );
}

// ─── Ticket Form ──────────────────────────────────────────────────────────────

function TicketForm({ contacts, initial = {}, onSave, onClose, loading }) {
  const [form, setForm] = useState({
    contact: '', subject: '', description: '',
    type: 'support', priority: 'normal', ...initial,
  });
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.subject.trim()) { toast.error('El asunto es requerido'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Asunto" required>
        <input className={inputCls} value={form.subject} onChange={set('subject')} placeholder="Descripción breve del problema" />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Contacto">
          <select className={selectCls} value={form.contact} onChange={set('contact')}>
            <option value="">Sin contacto</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className={selectCls} value={form.type} onChange={set('type')}>
            <option value="support">Soporte Técnico</option>
            <option value="billing">Facturación</option>
            <option value="onboarding">Onboarding</option>
            <option value="feature_request">Nueva Función</option>
            <option value="complaint">Reclamo</option>
            <option value="other">Otro</option>
          </select>
        </Field>
        <Field label="Prioridad">
          <select className={selectCls} value={form.priority} onChange={set('priority')}>
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </Field>
      </div>
      <Field label="Descripción">
        <textarea className={`${inputCls} resize-none`} rows={5} value={form.description} onChange={set('description')}
          placeholder="Detalle del problema o solicitud..." />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {initial.id ? 'Guardar cambios' : 'Crear ticket'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Campaign Form ────────────────────────────────────────────────────────────

function CampaignForm({ initial = {}, onSave, onClose, loading }) {
  const [form, setForm] = useState({
    name: '', type: 'email', subject: '',
    body_text: '', scheduled_at: '', ...initial,
  });
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre de la campaña" required>
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Campaña Nuevos Condominios Q2" />
        </Field>
        <Field label="Tipo">
          <select className={selectCls} value={form.type} onChange={set('type')}>
            <option value="email">Email Marketing</option>
            <option value="whatsapp">WhatsApp Masivo</option>
            <option value="sms">SMS</option>
            <option value="social">Redes Sociales</option>
          </select>
        </Field>
      </div>
      {form.type === 'email' && (
        <Field label="Asunto del email">
          <input className={inputCls} value={form.subject} onChange={set('subject')} placeholder="¡Gestiona tu condominio de manera profesional!" />
        </Field>
      )}
      <Field label="Mensaje / Contenido">
        <textarea className={`${inputCls} resize-none`} rows={6} value={form.body_text} onChange={set('body_text')}
          placeholder="Estimado/a {{nombre}}, ..." />
      </Field>
      <Field label="Fecha programada">
        <input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {initial.id ? 'Guardar' : 'Crear campaña'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Contact Detail Drawer ────────────────────────────────────────────────────

function ContactDetail({ contact, opportunities, activities, tickets, onClose, onEdit, onNewActivity, onNewOpp, onNewTicket }) {
  const [tab, setTab] = useState('overview');

  const contactOpps = opportunities.filter(o => o.contact === contact.id);
  const contactActs = activities.filter(a => a.contact === contact.id);
  const contactTix  = tickets.filter(t => t.contact === contact.id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white p-6">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/20 hover:bg-white/30">
            <X size={16} />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-bold">
              {contact.first_name[0]}{contact.last_name?.[0] || ''}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold">{contact.full_name}</h2>
              <p className="text-teal-100 text-sm">{contact.cargo || '—'} {contact.company ? `• ${contact.company}` : ''}</p>
              <div className="flex items-center gap-3 mt-2">
                <Badge label={contact.status_label || contact.status}
                  color="bg-white/20 text-white" />
                <ScoreBadge score={contact.lead_score} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/15 rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{contact.open_opportunities}</div>
              <div className="text-xs text-teal-100">Oportunidades</div>
            </div>
            <div className="bg-white/15 rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{contactActs.length}</div>
              <div className="text-xs text-teal-100">Actividades</div>
            </div>
            <div className="bg-white/15 rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{contact.open_tickets}</div>
              <div className="text-xs text-teal-100">Tickets</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-100 px-6 sticky top-0 bg-white z-10">
          <div className="flex gap-1">
            {[['overview','Vista General'],['activities','Actividades'],['opportunities','Pipeline'],['tickets','Tickets']].map(([k,l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`py-3.5 px-4 text-sm font-medium border-b-2 transition-colors ${tab===k ? 'border-teal-500 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-6">
          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <Btn size="sm" variant="secondary" onClick={() => onEdit(contact)}>
                  <Edit size={13} /> Editar
                </Btn>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ['Email', contact.email, <Mail size={14} />],
                  ['Teléfono', contact.phone || '—', <Phone size={14} />],
                  ['Empresa', contact.company || '—', <Building2 size={14} />],
                  ['Cargo', contact.cargo || '—', <Hash size={14} />],
                  ['Ubicación', [contact.city, contact.state, contact.country].filter(Boolean).join(', ') || '—', <MapPin size={14} />],
                  ['Unidades', contact.units_count || '—', <Building2 size={14} />],
                  ['Fuente', contact.source_label || contact.source, <Globe size={14} />],
                  ['Última actividad', fmtDateTime(contact.last_activity_at), <Activity size={14} />],
                ].map(([label, value, icon]) => (
                  <div key={label} className="flex items-start gap-2 bg-slate-50 rounded-xl p-3">
                    <span className="text-slate-400 mt-0.5">{icon}</span>
                    <div>
                      <div className="text-slate-400 text-xs">{label}</div>
                      <div className="text-slate-700 font-medium">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
              {contact.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-1">
                    <FileText size={14} /> Notas
                  </div>
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">{contact.notes}</p>
                </div>
              )}
              {Array.isArray(contact.tags) && contact.tags.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {contact.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">
                      <Tag size={10} /> {tag}
                    </span>
                  ))}
                </div>
              )}
              {contact.condominio_request_data && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="text-blue-700 font-semibold text-sm mb-2">Lead desde Landing Page</div>
                  <div className="text-sm text-blue-800">{contact.condominio_request_data.condominio_nombre}</div>
                  <div className="text-xs text-blue-600 mt-1">{contact.condominio_request_data.condominio_unidades} unidades · {fmtDate(contact.condominio_request_data.created_at)}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'activities' && (
            <div>
              <div className="flex justify-end mb-4">
                <Btn size="sm" onClick={() => onNewActivity(contact.id)}>
                  <Plus size={13} /> Nueva actividad
                </Btn>
              </div>
              {contactActs.length === 0 ? (
                <EmptyState icon={<Activity size={32} />} title="Sin actividades" sub="Registra tu primera interacción con este contacto" />
              ) : (
                <div className="space-y-3">
                  {contactActs.map(a => (
                    <div key={a.id} className="flex gap-3 p-3 bg-slate-50 rounded-xl">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${a.is_completed ? 'bg-green-100 text-green-600' : 'bg-white text-slate-500 border border-slate-200'}`}>
                        {ACTIVITY_ICONS[a.type] || <Activity size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-700 truncate">{a.title}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">{fmtDateTime(a.created_at)}</span>
                        </div>
                        {a.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.description}</p>}
                        {a.type_label && <span className="text-xs text-slate-400">{a.type_label}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'opportunities' && (
            <div>
              <div className="flex justify-end mb-4">
                <Btn size="sm" onClick={() => onNewOpp(contact.id)}>
                  <Plus size={13} /> Nueva oportunidad
                </Btn>
              </div>
              {contactOpps.length === 0 ? (
                <EmptyState icon={<TrendingUp size={32} />} title="Sin oportunidades" sub="Crea una oportunidad para este contacto" />
              ) : (
                <div className="space-y-3">
                  {contactOpps.map(o => {
                    const stage = OPPORTUNITY_STAGES.find(s => s.key === o.stage);
                    return (
                      <div key={o.id} className={`p-4 rounded-xl border ${stage?.light || 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800">{o.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold text-white ${stage?.color || 'bg-slate-500'}`}>{o.stage_label || o.stage}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-sm text-slate-600">
                          <span className="font-bold">{fmtAmt(o.value, o.currency)}</span>
                          <span className="text-slate-400">·</span>
                          <span>{o.probability}%</span>
                          {o.expected_close && <><span className="text-slate-400">·</span><span>{fmtDate(o.expected_close)}</span></>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'tickets' && (
            <div>
              <div className="flex justify-end mb-4">
                <Btn size="sm" variant="indigo" onClick={() => onNewTicket(contact.id)}>
                  <Plus size={13} /> Nuevo ticket
                </Btn>
              </div>
              {contactTix.length === 0 ? (
                <EmptyState icon={<Ticket size={32} />} title="Sin tickets" sub="No hay tickets asociados a este contacto" />
              ) : (
                <div className="space-y-3">
                  {contactTix.map(t => (
                    <div key={t.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-sm font-semibold text-slate-800">{t.subject}</span>
                        <Badge label={TICKET_STATUS[t.status]?.label || t.status}
                               color={TICKET_STATUS[t.status]?.color || 'bg-slate-100 text-slate-600'} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge label={TICKET_PRIORITY[t.priority]?.label || t.priority}
                               color={TICKET_PRIORITY[t.priority]?.color || ''}
                               dot={TICKET_PRIORITY[t.priority]?.dot} />
                        <span className="text-xs text-slate-400">{fmtDate(t.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Kanban ──────────────────────────────────────────────────────────

function PipelineKanban({ opportunities, onMoveStage, onNewOpp, onEdit }) {
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const oppsByStage = OPPORTUNITY_STAGES.reduce((acc, s) => {
    acc[s.key] = opportunities.filter(o => o.stage === s.key);
    return acc;
  }, {});

  const handleDragStart = (e, opp) => {
    setDragging(opp);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    if (dragging && dragging.stage !== targetStage) {
      onMoveStage(dragging.id, targetStage);
    }
    setDragging(null);
    setDragOver(null);
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {OPPORTUNITY_STAGES.map(stage => {
          const stageOpps = oppsByStage[stage.key] || [];
          const stageValue = stageOpps.reduce((s, o) => s + parseFloat(o.value || 0), 0);
          const isOver = dragOver === stage.key;

          return (
            <div key={stage.key}
              className={`w-72 flex flex-col rounded-2xl border-2 transition-colors ${isOver ? 'border-teal-400 bg-teal-50' : 'border-transparent'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage.key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, stage.key)}>

              {/* Column header */}
              <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl bg-slate-50 border border-slate-200`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  <span className="text-sm font-bold text-slate-700">{stage.label}</span>
                  <span className="bg-slate-200 text-slate-600 text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                    {stageOpps.length}
                  </span>
                </div>
                {stageValue > 0 && (
                  <span className="text-xs font-semibold text-slate-500">
                    {fmtAmt(stageValue, 'MXN')}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div className={`flex-1 flex flex-col gap-2.5 p-2.5 bg-slate-50/50 rounded-b-xl border border-t-0 border-slate-200 min-h-[120px]`}>
                {stageOpps.map(opp => (
                  <div key={opp.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, opp)}
                    className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-300 transition-all cursor-grab active:cursor-grabbing group">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug flex-1">{opp.title}</p>
                      <button onClick={() => onEdit(opp)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 transition-all flex-shrink-0">
                        <Edit size={12} className="text-slate-400" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mb-2.5">{opp.contact_company || opp.contact_name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-teal-600">{fmtAmt(opp.value, opp.currency)}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-400 rounded-full" style={{ width: `${opp.probability}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{opp.probability}%</span>
                      </div>
                    </div>
                    {opp.expected_close && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                        <Calendar size={10} /> {fmtDate(opp.expected_close)}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add button */}
                <button onClick={() => onNewOpp(null, stage.key)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-teal-600 hover:bg-white/80 transition-colors border border-dashed border-slate-200 hover:border-teal-300 w-full">
                  <Plus size={12} /> Nueva oportunidad
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CRM Dashboard Panel ──────────────────────────────────────────────────────

function CRMDashboardPanel({ stats, contacts, isLoading }) {
  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw size={24} className="animate-spin text-teal-500" />
    </div>
  );
  if (!stats) return null;

  const totalOppValue = stats.pipeline_value || 0;
  const weightedVal   = stats.weighted_pipeline || 0;

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Users size={20} />} label="Contactos Totales"
          value={stats.total_contacts} sub={`${stats.contacts_by_status?.lead || 0} leads activos`} accent="teal" />
        <StatCard icon={<Target size={20} />} label="Pipeline Activo"
          value={fmtAmt(totalOppValue)} sub={`Ponderado: ${fmtAmt(weightedVal)}`} accent="indigo" />
        <StatCard icon={<Award size={20} />} label="Ganados este mes"
          value={stats.won_this_month} sub={`${stats.lost_this_month} perdidos`} accent="green" />
        <StatCard icon={<Ticket size={20} />} label="Tickets Abiertos"
          value={stats.open_tickets} sub={`${stats.total_tickets} total`} accent="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contactos por estado */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users size={16} className="text-teal-500" /> Contactos por Estado
          </h3>
          <div className="space-y-2.5">
            {Object.entries(CONTACT_STATUS).map(([k, v]) => {
              const count = stats.contacts_by_status?.[k] || 0;
              const pct   = stats.total_contacts > 0 ? (count / stats.total_contacts * 100) : 0;
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v.color} w-28 text-center flex-shrink-0`}>{v.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pipeline por etapa */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-500" /> Oportunidades por Etapa
          </h3>
          <div className="space-y-2.5">
            {OPPORTUNITY_STAGES.filter(s => !['won','lost'].includes(s.key)).map(s => {
              const count = stats.opportunities_by_stage?.[s.key] || 0;
              const total = stats.total_opportunities || 1;
              const pct   = count / total * 100;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${s.color}`} />
                    <span className="text-xs font-medium text-slate-600">{s.label}</span>
                  </div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${s.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Actividad Reciente */}
      {stats.recent_activities?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-amber-500" /> Actividad Reciente
          </h3>
          <div className="space-y-3">
            {stats.recent_activities.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className="p-2 rounded-lg bg-slate-50 text-slate-500 flex-shrink-0">
                  {ACTIVITY_ICONS[a.type] || <Activity size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{a.title}</p>
                  <p className="text-xs text-slate-400">{a.contact_name || '—'} · {a.type_label}</p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{fmtDateTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main CRM Page ────────────────────────────────────────────────────────────

export default function CRM() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState('dashboard');
  const [salesTab, setSalesTab] = useState('contacts');

  // Modal / detail state
  const [contactModal, setContactModal]           = useState(null); // null | 'new' | contact obj
  const [oppModal, setOppModal]                   = useState(null); // null | 'new' | opp obj
  const [activityModal, setActivityModal]         = useState(null);
  const [campaignModal, setCampaignModal]         = useState(null);
  const [ticketModal, setTicketModal]             = useState(null);
  const [contactDetail, setContactDetail]         = useState(null);
  const [confirmDelete, setConfirmDelete]         = useState(null);
  const [loading, setLoading]                     = useState(false);

  // Filters
  const [contactSearch, setContactSearch]   = useState('');
  const [contactStatus, setContactStatus]   = useState('');
  const [ticketStatus, setTicketStatus]     = useState('');
  const [ticketPriority, setTicketPriority] = useState('');

  // Fetch data
  const { data: dashStats, isLoading: dashLoading, refetch: refetchDash } = useQuery({
    queryKey: ['crm-dashboard'],
    queryFn:  () => crmAPI.dashboard().then(r => r.data),
    staleTime: 60 * 1000,
  });

  const { data: contacts = [], isLoading: contactsLoading, refetch: refetchContacts } = useQuery({
    queryKey: ['crm-contacts', contactSearch, contactStatus],
    queryFn:  () => crmAPI.contacts.list({
      search: contactSearch || undefined,
      status: contactStatus || undefined,
    }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 60 * 1000,
  });

  const { data: opportunities = [], isLoading: oppsLoading, refetch: refetchOpps } = useQuery({
    queryKey: ['crm-opportunities'],
    queryFn:  () => crmAPI.opportunities.list({}).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 60 * 1000,
  });

  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['crm-activities'],
    queryFn:  () => crmAPI.activities.list({}).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 60 * 1000,
  });

  const { data: campaigns = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery({
    queryKey: ['crm-campaigns'],
    queryFn:  () => crmAPI.campaigns.list({}).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 60 * 1000,
  });

  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['crm-tickets', ticketStatus, ticketPriority],
    queryFn:  () => crmAPI.tickets.list({
      status: ticketStatus || undefined,
      priority: ticketPriority || undefined,
    }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    }),
    staleTime: 60 * 1000,
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
    queryClient.invalidateQueries({ queryKey: ['crm-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['crm-tickets'] });
  }, [queryClient]);

  // ── Contact actions ──────────────────────────────
  const handleSaveContact = async (data) => {
    setLoading(true);
    try {
      if (contactModal?.id) {
        await crmAPI.contacts.update(contactModal.id, data);
        toast.success('Contacto actualizado');
      } else {
        await crmAPI.contacts.create(data);
        toast.success('Contacto creado');
      }
      setContactModal(null);
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar contacto');
    } finally { setLoading(false); }
  };

  const handleDeleteContact = async (id) => {
    setLoading(true);
    try {
      await crmAPI.contacts.delete(id);
      toast.success('Contacto eliminado');
      setConfirmDelete(null);
      if (contactDetail?.id === id) setContactDetail(null);
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    } catch (e) {
      toast.error('Error al eliminar');
    } finally { setLoading(false); }
  };

  const handleImportLeads = async () => {
    setLoading(true);
    try {
      const res = await crmAPI.contacts.importFromRequests();
      toast.success(`${res.data.imported} leads importados desde la landing page`);
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al importar leads');
    } finally { setLoading(false); }
  };

  // ── Opportunity actions ─────────────────────────
  const handleSaveOpp = async (data) => {
    setLoading(true);
    try {
      if (oppModal?.id) {
        await crmAPI.opportunities.update(oppModal.id, data);
        toast.success('Oportunidad actualizada');
      } else {
        await crmAPI.opportunities.create(data);
        toast.success('Oportunidad creada');
      }
      setOppModal(null);
      queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally { setLoading(false); }
  };

  const handleMoveStage = async (id, stage) => {
    try {
      await crmAPI.opportunities.moveStage(id, stage);
      queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] });
    } catch (e) {
      toast.error('Error al mover oportunidad');
    }
  };

  // ── Activity actions ────────────────────────────
  const handleSaveActivity = async (data) => {
    setLoading(true);
    try {
      await crmAPI.activities.create({
        ...data,
        contact: data.contact || null,
        opportunity: data.opportunity || null,
      });
      toast.success('Actividad registrada');
      setActivityModal(null);
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
      queryClient.invalidateQueries({ queryKey: ['crm-dashboard'] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar actividad');
    } finally { setLoading(false); }
  };

  // ── Campaign actions ────────────────────────────
  const handleSaveCampaign = async (data) => {
    setLoading(true);
    try {
      if (campaignModal?.id) {
        await crmAPI.campaigns.update(campaignModal.id, data);
        toast.success('Campaña actualizada');
      } else {
        await crmAPI.campaigns.create(data);
        toast.success('Campaña creada');
      }
      setCampaignModal(null);
      queryClient.invalidateQueries({ queryKey: ['crm-campaigns'] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally { setLoading(false); }
  };

  const handleLaunchCampaign = async (id) => {
    setLoading(true);
    try {
      await crmAPI.campaigns.launch(id);
      toast.success('Campaña lanzada');
      queryClient.invalidateQueries({ queryKey: ['crm-campaigns'] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al lanzar');
    } finally { setLoading(false); }
  };

  // ── Ticket actions ──────────────────────────────
  const handleSaveTicket = async (data) => {
    setLoading(true);
    try {
      if (ticketModal?.id) {
        await crmAPI.tickets.update(ticketModal.id, data);
        toast.success('Ticket actualizado');
      } else {
        await crmAPI.tickets.create({ ...data, contact: data.contact || null });
        toast.success('Ticket creado');
      }
      setTicketModal(null);
      queryClient.invalidateQueries({ queryKey: ['crm-tickets'] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar ticket');
    } finally { setLoading(false); }
  };

  const handleResolveTicket = async (id) => {
    try {
      await crmAPI.tickets.resolve(id, 'Resuelto por admin');
      toast.success('Ticket marcado como resuelto');
      queryClient.invalidateQueries({ queryKey: ['crm-tickets'] });
    } catch (e) {
      toast.error('Error al resolver ticket');
    }
  };

  // ── Nav tabs ─────────────────────────────────────
  const NAV_TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={16} /> },
    { key: 'ventas',    label: 'Ventas',    icon: <TrendingUp size={16} /> },
    { key: 'marketing', label: 'Marketing', icon: <Send size={16} /> },
    { key: 'servicio',  label: 'Servicio al Cliente', icon: <Ticket size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white p-2 rounded-xl">
                <Target size={20} />
              </span>
              CRM Homly
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Gestión comercial · Solo SuperAdmin</p>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="sm" onClick={invalidateAll}>
              <RefreshCw size={14} /> Actualizar
            </Btn>
            {mainTab === 'ventas' && salesTab === 'contacts' && (
              <>
                <Btn variant="secondary" size="sm" onClick={handleImportLeads} disabled={loading}>
                  <Zap size={14} /> Importar Leads
                </Btn>
                <Btn size="sm" onClick={() => setContactModal('new')}>
                  <Plus size={14} /> Nuevo Contacto
                </Btn>
              </>
            )}
            {mainTab === 'ventas' && salesTab === 'pipeline' && (
              <Btn size="sm" onClick={() => setOppModal('new')}>
                <Plus size={14} /> Nueva Oportunidad
              </Btn>
            )}
            {mainTab === 'marketing' && (
              <Btn size="sm" variant="indigo" onClick={() => setCampaignModal('new')}>
                <Plus size={14} /> Nueva Campaña
              </Btn>
            )}
            {mainTab === 'servicio' && (
              <Btn size="sm" variant="indigo" onClick={() => setTicketModal('new')}>
                <Plus size={14} /> Nuevo Ticket
              </Btn>
            )}
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1">
          {NAV_TABS.map(t => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mainTab === t.key
                  ? 'bg-teal-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">

        {/* ── Dashboard Tab ─────────────────────────────── */}
        {mainTab === 'dashboard' && (
          <CRMDashboardPanel stats={dashStats} contacts={contacts} isLoading={dashLoading} />
        )}

        {/* ── Ventas Tab ────────────────────────────────── */}
        {mainTab === 'ventas' && (
          <div>
            {/* Sub-tabs */}
            <div className="flex gap-1 mb-6 bg-white rounded-2xl border border-slate-100 p-1 w-fit shadow-sm">
              {[['contacts','Contactos',<Users size={14} />],['pipeline','Pipeline Kanban',<TrendingUp size={14} />],['activities','Actividades',<Activity size={14} />]].map(([k,l,icon]) => (
                <button key={k} onClick={() => setSalesTab(k)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    salesTab === k ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {icon} {l}
                </button>
              ))}
            </div>

            {/* Contacts sub-tab */}
            {salesTab === 'contacts' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Search/filter bar */}
                <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                  <div className="relative flex-1 max-w-sm">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                      placeholder="Buscar por nombre, email, empresa..."
                      value={contactSearch}
                      onChange={e => setContactSearch(e.target.value)}
                    />
                  </div>
                  <select className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    value={contactStatus} onChange={e => setContactStatus(e.target.value)}>
                    <option value="">Todos los estados</option>
                    {Object.entries(CONTACT_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-400 ml-auto">{contacts.length} contactos</span>
                </div>

                {contactsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw size={24} className="animate-spin text-teal-500" />
                  </div>
                ) : contacts.length === 0 ? (
                  <EmptyState
                    icon={<Users size={32} />}
                    title="Sin contactos"
                    sub='Importa leads desde la landing page o crea uno manualmente'
                    action={
                      <div className="flex gap-3">
                        <Btn variant="secondary" onClick={handleImportLeads}>
                          <Zap size={14} /> Importar Leads
                        </Btn>
                        <Btn onClick={() => setContactModal('new')}>
                          <Plus size={14} /> Nuevo Contacto
                        </Btn>
                      </div>
                    }
                  />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {['Contacto','Empresa','Estado','Score','Oportunidades','Última actividad',''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {contacts.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-100 to-emerald-100 flex items-center justify-center text-sm font-bold text-teal-700 flex-shrink-0">
                                {c.first_name?.[0]}{c.last_name?.[0] || ''}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800">{c.full_name}</div>
                                <div className="text-xs text-slate-400">{c.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{c.company || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge label={CONTACT_STATUS[c.status]?.label || c.status}
                                   color={CONTACT_STATUS[c.status]?.color || 'bg-slate-100 text-slate-600'} />
                          </td>
                          <td className="px-4 py-3"><ScoreBadge score={c.lead_score} /></td>
                          <td className="px-4 py-3 text-slate-600 text-center">{c.open_opportunities}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{fmtDateTime(c.last_activity_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => setContactDetail(c)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors">
                                <Eye size={14} />
                              </button>
                              <button onClick={() => setContactModal(c)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                <Edit size={14} />
                              </button>
                              <button onClick={() => setConfirmDelete({ type: 'contact', id: c.id, name: c.full_name })}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Pipeline sub-tab */}
            {salesTab === 'pipeline' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-teal-500 rounded-full" />
                      {opportunities.filter(o => !['won','lost'].includes(o.stage)).length} oportunidades activas
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      {fmtAmt(opportunities.filter(o => !['won','lost'].includes(o.stage)).reduce((s,o) => s + parseFloat(o.value||0), 0))} en pipeline
                    </span>
                  </div>
                </div>
                {oppsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw size={24} className="animate-spin text-teal-500" />
                  </div>
                ) : (
                  <PipelineKanban
                    opportunities={opportunities}
                    onMoveStage={handleMoveStage}
                    onNewOpp={(contactId, stage) => setOppModal({ _preset_contact: contactId, _preset_stage: stage })}
                    onEdit={(opp) => setOppModal(opp)}
                  />
                )}
              </div>
            )}

            {/* Activities sub-tab */}
            {salesTab === 'activities' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700">Registro de Actividades</h3>
                  <Btn size="sm" onClick={() => setActivityModal('new')}>
                    <Plus size={13} /> Nueva Actividad
                  </Btn>
                </div>
                {activities.length === 0 ? (
                  <EmptyState icon={<Activity size={32} />} title="Sin actividades" sub="Registra llamadas, emails, reuniones y más" />
                ) : (
                  <div className="divide-y divide-slate-50">
                    {activities.map(a => (
                      <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                        <div className={`p-2.5 rounded-xl flex-shrink-0 ${a.is_completed ? 'bg-green-50 text-green-500' : 'bg-slate-50 text-slate-500'}`}>
                          {ACTIVITY_ICONS[a.type] || <Activity size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-800">{a.title}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{fmtDateTime(a.created_at)}</span>
                          </div>
                          <p className="text-sm text-slate-500 mt-0.5">{a.type_label} {a.contact ? `· ${contacts.find(c => c.id === a.contact)?.full_name || ''}` : ''}</p>
                          {a.description && <p className="text-sm text-slate-400 mt-1 line-clamp-2">{a.description}</p>}
                        </div>
                        {a.is_completed && (
                          <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-1" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Marketing Tab ─────────────────────────────── */}
        {mainTab === 'marketing' && (
          <div className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={<Send size={18} />} label="Campañas Activas"
                value={campaigns.filter(c => c.status === 'active').length} accent="indigo" />
              <StatCard icon={<Mail size={18} />} label="Enviadas"
                value={campaigns.filter(c => ['active','completed'].includes(c.status)).length} accent="blue" />
              <StatCard icon={<CheckCircle size={18} />} label="Completadas"
                value={campaigns.filter(c => c.status === 'completed').length} accent="green" />
              <StatCard icon={<Clock size={18} />} label="Borradores"
                value={campaigns.filter(c => c.status === 'draft').length} accent="amber" />
            </div>

            {/* Campaigns table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-700">Campañas de Marketing</h3>
              </div>
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw size={24} className="animate-spin text-indigo-500" />
                </div>
              ) : campaigns.length === 0 ? (
                <EmptyState
                  icon={<Send size={32} />}
                  title="Sin campañas"
                  sub="Crea tu primera campaña de email o WhatsApp"
                  action={<Btn variant="indigo" onClick={() => setCampaignModal('new')}><Plus size={14} /> Crear campaña</Btn>}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['Campaña','Tipo','Estado','Destinatarios','Enviado',''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {campaigns.map(cam => (
                      <tr key={cam.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{cam.name}</div>
                          {cam.subject && <div className="text-xs text-slate-400 truncate max-w-xs">{cam.subject}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-slate-600">{cam.type_label || cam.type}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={CAMPAIGN_STATUS[cam.status]?.label || cam.status}
                                 color={CAMPAIGN_STATUS[cam.status]?.color || 'bg-slate-100 text-slate-600'} />
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-center">{cam.recipient_count}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{fmtDateTime(cam.sent_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {['draft','scheduled','paused'].includes(cam.status) && (
                              <Btn size="sm" onClick={() => handleLaunchCampaign(cam.id)} disabled={loading}>
                                <Send size={12} /> Lanzar
                              </Btn>
                            )}
                            <button onClick={() => setCampaignModal(cam)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                              <Edit size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Servicio Tab ──────────────────────────────── */}
        {mainTab === 'servicio' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={<Inbox size={18} />} label="Tickets Abiertos"
                value={tickets.filter(t => t.status === 'open').length} accent="blue" />
              <StatCard icon={<Zap size={18} />} label="En Progreso"
                value={tickets.filter(t => t.status === 'in_progress').length} accent="amber" />
              <StatCard icon={<AlertCircle size={18} />} label="Urgentes"
                value={tickets.filter(t => t.priority === 'urgent').length} accent="rose" />
              <StatCard icon={<CheckCircle size={18} />} label="Resueltos"
                value={tickets.filter(t => ['resolved','closed'].includes(t.status)).length} accent="green" />
            </div>

            {/* Filters + table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                <select className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-600"
                  value={ticketStatus} onChange={e => setTicketStatus(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {Object.entries(TICKET_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-600"
                  value={ticketPriority} onChange={e => setTicketPriority(e.target.value)}>
                  <option value="">Todas las prioridades</option>
                  {Object.entries(TICKET_PRIORITY).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <span className="text-sm text-slate-400 ml-auto">{tickets.length} tickets</span>
              </div>

              {ticketsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw size={24} className="animate-spin text-indigo-500" />
                </div>
              ) : tickets.length === 0 ? (
                <EmptyState icon={<Ticket size={32} />} title="Sin tickets" sub="Todos los tickets resueltos" />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['Asunto','Contacto','Tipo','Prioridad','Estado','Creado',''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tickets.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 max-w-xs truncate">{t.subject}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{t.contact_name || t.tenant_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{t.type_label || t.type}</td>
                        <td className="px-4 py-3">
                          <Badge label={TICKET_PRIORITY[t.priority]?.label || t.priority}
                                 color={TICKET_PRIORITY[t.priority]?.color || ''}
                                 dot={TICKET_PRIORITY[t.priority]?.dot} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={TICKET_STATUS[t.status]?.label || t.status}
                                 color={TICKET_STATUS[t.status]?.color || 'bg-slate-100 text-slate-600'} />
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(t.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {!['resolved','closed'].includes(t.status) && (
                              <button onClick={() => handleResolveTicket(t.id)}
                                className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600 transition-colors"
                                title="Marcar resuelto">
                                <CheckCircle size={14} />
                              </button>
                            )}
                            <button onClick={() => setTicketModal(t)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                              <Edit size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────── */}

      {contactModal && (
        <Modal
          title={contactModal === 'new' || !contactModal?.id ? 'Nuevo Contacto' : `Editar: ${contactModal.full_name}`}
          onClose={() => setContactModal(null)}
          wide>
          <ContactForm
            initial={contactModal === 'new' ? {} : contactModal}
            onSave={handleSaveContact}
            onClose={() => setContactModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {oppModal && (
        <Modal
          title={oppModal === 'new' || !oppModal?.id ? 'Nueva Oportunidad' : `Editar: ${oppModal.title}`}
          onClose={() => setOppModal(null)}
          wide>
          <OpportunityForm
            contacts={contacts}
            initial={oppModal === 'new' ? {} : {
              ...oppModal,
              contact: oppModal._preset_contact || oppModal.contact || '',
              stage: oppModal._preset_stage || oppModal.stage || 'new',
            }}
            onSave={handleSaveOpp}
            onClose={() => setOppModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {activityModal && (
        <Modal title="Registrar Actividad" onClose={() => setActivityModal(null)} wide>
          <ActivityForm
            contacts={contacts}
            opportunities={opportunities}
            initial={activityModal === 'new' ? {} : activityModal}
            onSave={handleSaveActivity}
            onClose={() => setActivityModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {campaignModal && (
        <Modal
          title={campaignModal === 'new' || !campaignModal?.id ? 'Nueva Campaña' : `Editar: ${campaignModal.name}`}
          onClose={() => setCampaignModal(null)}
          wide>
          <CampaignForm
            initial={campaignModal === 'new' ? {} : campaignModal}
            onSave={handleSaveCampaign}
            onClose={() => setCampaignModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {ticketModal && (
        <Modal
          title={ticketModal === 'new' || !ticketModal?.id ? 'Nuevo Ticket' : `Editar ticket`}
          onClose={() => setTicketModal(null)}
          wide>
          <TicketForm
            contacts={contacts}
            initial={ticketModal === 'new' ? {} : ticketModal}
            onSave={handleSaveTicket}
            onClose={() => setTicketModal(null)}
            loading={loading}
          />
        </Modal>
      )}

      {/* Contact Detail Drawer */}
      {contactDetail && (
        <ContactDetail
          contact={contactDetail}
          opportunities={opportunities}
          activities={activities}
          tickets={tickets}
          onClose={() => setContactDetail(null)}
          onEdit={(c) => { setContactDetail(null); setContactModal(c); }}
          onNewActivity={(cId) => { setActivityModal({ contact: cId, opportunity: '' }); }}
          onNewOpp={(cId) => { setOppModal({ _preset_contact: cId }); }}
          onNewTicket={(cId) => { setTicketModal({ contact: cId }); }}
        />
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDelete(null)}>
          <div className="text-center space-y-4">
            <div className="p-4 bg-red-50 rounded-2xl">
              <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
              <p className="text-slate-700 font-medium">¿Eliminar {confirmDelete.type === 'contact' ? 'el contacto' : 'el elemento'}?</p>
              <p className="text-slate-500 text-sm mt-1 font-semibold">{confirmDelete.name}</p>
              <p className="text-xs text-slate-400 mt-2">Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex gap-3 justify-center">
              <Btn variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Btn>
              <Btn variant="danger" disabled={loading}
                onClick={() => confirmDelete.type === 'contact' && handleDeleteContact(confirmDelete.id)}>
                {loading ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Eliminar
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
