import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscriptionPlansAPI, trialRequestsAPI, tenantSubscriptionsAPI } from '../api/client';
import {
  Plus, Edit, Trash2, Check, X, ChevronDown, ChevronUp,
  DollarSign, Users, Clock, Zap, Star, AlertCircle, RefreshCw,
  CheckCircle, XCircle, ShieldCheck, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Helpers ────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS = { MXN: '$', USD: 'US$', EUR: '€', COP: 'COP$' };
const fmtAmt = (amount, currency = 'MXN') =>
  `${CURRENCY_SYMBOLS[currency] || '$'}${Number(amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const STATUS_LABELS = {
  trial: { label: 'Prueba', color: 'bg-blue-100 text-blue-700' },
  active: { label: 'Activa', color: 'bg-green-100 text-green-700' },
  past_due: { label: 'Vencida', color: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'Cancelada', color: 'bg-slate-100 text-slate-600' },
  expired: { label: 'Expirada', color: 'bg-red-100 text-red-600' },
};

const REQUEST_STATUS_LABELS = {
  pending:   { label: 'Pendiente',   color: 'bg-yellow-100 text-yellow-700' },
  contacted: { label: 'Contactado',  color: 'bg-blue-100 text-blue-700' },
  enrolled:  { label: 'Inscrito',    color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Rechazado',   color: 'bg-red-100 text-red-600' },
};

function Badge({ label, color }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
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

// ─── Plan Form ───────────────────────────────────────────────────────────────

// All modules available in Homly. Key must match PATH_TO_MODULE in AppLayout.jsx.
const SYSTEM_MODULES = [
  { key: 'dashboard',       label: 'Dashboard',              desc: 'Vista general del condominio' },
  { key: 'cobranza',        label: 'Cobranza Mensual',       desc: 'Registro y seguimiento de cuotas' },
  { key: 'gastos',          label: 'Gastos',                 desc: 'Control de egresos y caja chica' },
  { key: 'estado_cuenta',   label: 'Estado de Cuenta',       desc: 'Resumen financiero por unidad' },
  { key: 'plan_pagos',      label: 'Plan de Pagos',          desc: 'Acuerdos de pago diferido' },
  { key: 'cierre_periodo',  label: 'Cierre de Período',      desc: 'Cierre y reapertura de períodos' },
  { key: 'reservas',        label: 'Reservas',               desc: 'Reservas de áreas comunes' },
  { key: 'notificaciones',  label: 'Notificaciones',         desc: 'Avisos y alertas internos' },
  { key: 'config',          label: 'Configuración',          desc: 'Ajustes generales del condominio' },
  { key: 'my_unit',         label: 'Mi Unidad',              desc: 'Vista individual para vecinos' },
  { key: 'onboarding',      label: 'Guía de Uso',            desc: 'Tutoriales y guía de inicio' },
];

const EMPTY_PLAN = {
  name: '', description: '', price_per_unit: '', currency: 'MXN',
  billing_cycle: 'monthly', annual_discount_percent: 0,
  trial_days: 7, is_active: true, sort_order: 0,
  volume_tiers: [], features: [], allowed_modules: [],
};

function PlanForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_PLAN,
    ...(initial || {}),
    // Ensure allowed_modules is always an array (older plans may not have it)
    allowed_modules: Array.isArray(initial?.allowed_modules) ? initial.allowed_modules : [],
  }));
  const [newFeature, setNewFeature] = useState('');
  const [newTier, setNewTier] = useState({ min_units: '', max_units: '', price_per_unit: '' });

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setForm(p => ({ ...p, features: [...p.features, newFeature.trim()] }));
    setNewFeature('');
  };
  const removeFeature = (i) => setForm(p => ({ ...p, features: p.features.filter((_, idx) => idx !== i) }));

  const addTier = () => {
    const t = { ...newTier };
    if (!t.min_units || !t.price_per_unit) return;
    if (t.max_units === '' || t.max_units === null) t.max_units = null;
    else t.max_units = Number(t.max_units);
    t.min_units = Number(t.min_units);
    t.price_per_unit = Number(t.price_per_unit);
    setForm(p => ({ ...p, volume_tiers: [...p.volume_tiers, t] }));
    setNewTier({ min_units: '', max_units: '', price_per_unit: '' });
  };
  const removeTier = (i) => setForm(p => ({ ...p, volume_tiers: p.volume_tiers.filter((_, idx) => idx !== i) }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price_per_unit: Number(form.price_per_unit) || 0,
      annual_discount_percent: Number(form.annual_discount_percent) || 0,
      trial_days: Number(form.trial_days) || 7,
      sort_order: Number(form.sort_order) || 0,
    };
    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Nombre del Plan</label>
          <input value={form.name} onChange={f('name')} required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Ej: Básico, Profesional, Enterprise" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Descripción</label>
          <textarea value={form.description} onChange={f('description')} rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Descripción breve del plan" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Precio por Unidad</label>
          <input type="number" min="0" step="0.01" value={form.price_per_unit} onChange={f('price_per_unit')} required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Moneda</label>
          <select value={form.currency} onChange={f('currency')}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            {['MXN', 'USD', 'EUR', 'COP'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Modalidad de Facturación</label>
          <select value={form.billing_cycle} onChange={f('billing_cycle')}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="monthly">Mensual</option>
            <option value="annual">Anual</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Descuento Pago Anual&nbsp;<span className="normal-case font-normal text-slate-400">(% sobre precio mensual × 12)</span>
          </label>
          <div className="relative">
            <input type="number" min="0" max="100" step="0.5" value={form.annual_discount_percent}
              onChange={f('annual_discount_percent')}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">%</span>
          </div>
          {Number(form.annual_discount_percent) > 0 && Number(form.price_per_unit) > 0 && (
            <p className="text-xs text-teal-600 mt-1 font-medium">
              Precio anual:{' '}
              {fmtAmt(
                Number(form.price_per_unit) * 12 * (1 - Number(form.annual_discount_percent) / 100),
                form.currency
              )}{' '}
              <span className="text-slate-400 line-through">
                {fmtAmt(Number(form.price_per_unit) * 12, form.currency)}
              </span>
              {' '}por unidad/año
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Días de Prueba</label>
          <input type="number" min="0" value={form.trial_days} onChange={f('trial_days')}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Orden</label>
          <input type="number" min="0" value={form.sort_order} onChange={f('sort_order')}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div className="flex items-center gap-2 col-span-2">
          <input type="checkbox" checked={form.is_active} onChange={f('is_active')} id="is_active"
            className="w-4 h-4 accent-teal-600" />
          <label htmlFor="is_active" className="text-sm font-medium text-slate-700">Plan activo (visible para clientes)</label>
        </div>
      </div>

      {/* Funcionalidades */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Funcionalidades incluidas</label>
        <div className="flex gap-2 mb-2">
          <input value={newFeature} onChange={e => setNewFeature(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Ej: Cobranza mensual" />
          <button type="button" onClick={addFeature}
            className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700">
            <Plus size={16} />
          </button>
        </div>
        {form.features.length > 0 && (
          <ul className="space-y-1">
            {form.features.map((f, i) => (
              <li key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2 text-slate-700"><Check size={14} className="text-teal-600" />{f}</span>
                <button type="button" onClick={() => removeFeature(i)} className="text-slate-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tiers de volumen */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
          Tiers de Volumen (opcional)
        </label>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <input type="number" min="0" placeholder="Mín unidades" value={newTier.min_units}
            onChange={e => setNewTier(p => ({ ...p, min_units: e.target.value }))}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <input type="number" min="0" placeholder="Máx (vacío=∞)" value={newTier.max_units}
            onChange={e => setNewTier(p => ({ ...p, max_units: e.target.value }))}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <input type="number" min="0" step="0.01" placeholder="Precio/unidad" value={newTier.price_per_unit}
            onChange={e => setNewTier(p => ({ ...p, price_per_unit: e.target.value }))}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <button type="button" onClick={addTier}
          className="text-xs text-teal-600 font-semibold hover:text-teal-800">+ Agregar tier</button>
        {form.volume_tiers.length > 0 && (
          <table className="w-full text-xs mt-2 border border-slate-100 rounded-lg overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-slate-500">Mín</th>
                <th className="px-3 py-2 text-left text-slate-500">Máx</th>
                <th className="px-3 py-2 text-left text-slate-500">Precio/u</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.volume_tiers.map((t, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{t.min_units}</td>
                  <td className="px-3 py-1.5">{t.max_units ?? '∞'}</td>
                  <td className="px-3 py-1.5">{t.price_per_unit}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={() => removeTier(i)} className="text-slate-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Módulos incluidos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Módulos del sistema incluidos
          </label>
          <span className="text-xs text-slate-400">
            {form.allowed_modules.length === 0
              ? 'Sin restricción (todos los módulos)'
              : `${form.allowed_modules.length} módulo${form.allowed_modules.length !== 1 ? 's' : ''} seleccionado${form.allowed_modules.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Deja todo sin marcar para incluir todos los módulos. Selecciona sólo los que quieres habilitar en este plan.
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {SYSTEM_MODULES.map(mod => {
            const checked = form.allowed_modules.includes(mod.key);
            const toggle  = () => setForm(p => ({
              ...p,
              allowed_modules: checked
                ? p.allowed_modules.filter(k => k !== mod.key)
                : [...p.allowed_modules, mod.key],
            }));
            return (
              <label
                key={mod.key}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'border-teal-300 bg-teal-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox" checked={checked} onChange={toggle}
                  className="w-4 h-4 accent-teal-600 flex-shrink-0"
                />
                <div className="min-w-0">
                  <span className={`text-sm font-semibold ${checked ? 'text-teal-800' : 'text-slate-700'}`}>
                    {mod.label}
                  </span>
                  <span className="text-xs text-slate-400 ml-2">{mod.desc}</span>
                </div>
              </label>
            );
          })}
        </div>
        {form.allowed_modules.length > 0 && (
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, allowed_modules: [] }))}
            className="mt-2 text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            Limpiar selección (incluir todos)
          </button>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onClose}
          className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
          {saving ? 'Guardando…' : 'Guardar Plan'}
        </button>
      </div>
    </form>
  );
}

// ─── Tab: Planes ─────────────────────────────────────────────────────────────

function TabPlanes() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    subscriptionPlansAPI.list()
      .then(r => setPlans(r.data.results || r.data))
      .catch(() => toast.error('Error al cargar planes'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setShowModal(true); };
  const openEdit   = (p) => { setEditing(p);   setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSave = async (data) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await subscriptionPlansAPI.update(editing.id, data);
        toast.success('Plan actualizado');
      } else {
        await subscriptionPlansAPI.create(data);
        toast.success('Plan creado');
      }
      load();
      closeModal();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al guardar plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (deleting) return;
    setDeleting(id);
    try {
      await subscriptionPlansAPI.destroy(id);
      toast.success('Plan eliminado');
      load();
    } catch {
      toast.error('Error al eliminar el plan');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-800">Planes de Suscripción</h3>
          <p className="text-sm text-slate-500 mt-0.5">Configura los planes disponibles para tus clientes</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
          <Plus size={16} /> Nuevo Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Star size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin planes configurados</p>
          <p className="text-sm mt-1">Crea un plan para ofrecerlo a tus clientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map(plan => (
            <div key={plan.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-bold text-slate-800">{plan.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{plan.description || 'Sin descripción'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${plan.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {plan.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-extrabold text-teal-700">
                  {fmtAmt(plan.price_per_unit, plan.currency)}
                </span>
                <span className="text-sm text-slate-500">/ unidad / {plan.billing_cycle === 'monthly' ? 'mes' : 'año'}</span>
              </div>

              {Number(plan.annual_discount_percent) > 0 && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs text-green-700 font-semibold bg-green-100 px-2 py-0.5 rounded-full">
                    {plan.annual_discount_percent}% descuento anual
                  </span>
                  <span className="text-xs text-slate-500">
                    = {fmtAmt(
                      Number(plan.price_per_unit) * 12 * (1 - Number(plan.annual_discount_percent) / 100),
                      plan.currency
                    )}/u/año
                  </span>
                </div>
              )}

              <div className="flex gap-4 text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {plan.trial_days}d prueba
                </span>
                <span className="flex items-center gap-1">
                  <Users size={12} /> {plan.subscriptions_count || 0} tenants
                </span>
              </div>

              {plan.features?.length > 0 && (
                <ul className="space-y-1 mb-3">
                  {plan.features.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Check size={12} className="text-teal-600 flex-shrink-0" /> {f}
                    </li>
                  ))}
                  {plan.features.length > 4 && (
                    <li className="text-xs text-slate-400">+{plan.features.length - 4} más...</li>
                  )}
                </ul>
              )}

              {/* Módulos incluidos */}
              <div className="mb-3">
                {!plan.allowed_modules || plan.allowed_modules.length === 0 ? (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Zap size={11} /> Todos los módulos incluidos
                  </span>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Módulos:</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.allowed_modules.map(key => {
                        const mod = SYSTEM_MODULES.find(m => m.key === key);
                        return (
                          <span key={key}
                            className="px-2 py-0.5 bg-teal-50 text-teal-700 text-xs font-medium rounded-full border border-teal-200">
                            {mod?.label || key}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => openEdit(plan)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors">
                  <Edit size={13} /> Editar
                </button>
                <button onClick={() => handleDelete(plan.id)} disabled={deleting === plan.id}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Editar Plan' : 'Nuevo Plan de Suscripción'}
          onClose={closeModal}
          wide
        >
          <PlanForm initial={editing} onSave={handleSave} onClose={closeModal} saving={saving} />
        </Modal>
      )}
    </div>
  );
}

// ─── Approve / Reject modals ─────────────────────────────────────────────────

function ApproveModal({ request, plans, onClose, onDone }) {
  const [trialDays, setTrialDays] = useState(request.trial_days || 7);
  const [planId, setPlanId] = useState(request.subscription_plan || '');
  const [adminNotes, setAdminNotes] = useState(request.admin_notes || '');
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    setSaving(true);
    try {
      await trialRequestsAPI.approve(request.id, {
        trial_days: trialDays,
        subscription_plan: planId || null,
        admin_notes: adminNotes,
      });
      toast.success('Solicitud aprobada — tenant creado y correo enviado');
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al aprobar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Aprobar Solicitud" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-800">
            {request.condominio_nombre}
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            {request.admin_nombre} {request.admin_apellido} · {request.admin_email}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Plan de Suscripción
          </label>
          <select value={planId} onChange={e => setPlanId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">Sin plan asignado</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.name} — {fmtAmt(p.price_per_unit, p.currency)}/u</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Días de Prueba
          </label>
          <input type="number" min="1" value={trialDays}
            onChange={e => setTrialDays(Number(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Notas Internas
          </label>
          <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Observaciones para el equipo..." />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
          <AlertCircle size={14} className="inline mr-1.5" />
          Al aprobar, se creará automáticamente el tenant y un usuario administrador. Se enviará un correo de bienvenida con credenciales.
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={handleApprove} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
            <CheckCircle size={16} />
            {saving ? 'Aprobando…' : 'Aprobar y Crear Tenant'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RejectModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    if (!reason.trim()) { toast.error('Ingresa el motivo del rechazo'); return; }
    setSaving(true);
    try {
      await trialRequestsAPI.reject(request.id, { rejection_reason: reason });
      toast.success('Solicitud rechazada — correo enviado');
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al rechazar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Rechazar Solicitud" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-800">{request.condominio_nombre}</p>
          <p className="text-xs text-slate-500 mt-0.5">{request.admin_email}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Motivo del Rechazo
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} required
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder="Explica la razón del rechazo..." />
          <p className="text-xs text-slate-400 mt-1">Este mensaje será enviado al solicitante por correo.</p>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={handleReject} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
            <XCircle size={16} />
            {saving ? 'Rechazando…' : 'Rechazar Solicitud'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Tab: Solicitudes ─────────────────────────────────────────────────────────

function TabSolicitudes() {
  const [requests, setRequests] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      trialRequestsAPI.list({ status: statusFilter || undefined }),
      subscriptionPlansAPI.list({ active_only: 1 }),
    ])
      .then(([rReq, rPlans]) => {
        setRequests(rReq.data.results || rReq.data);
        setPlans(rPlans.data.results || rPlans.data);
      })
      .catch(() => toast.error('Error al cargar solicitudes'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => setExpanded(p => p === id ? null : id);

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-800">Solicitudes de Prueba</h3>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona las solicitudes del formulario "Empezar Gratis"</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="contacted">Contactados</option>
            <option value="enrolled">Inscritos</option>
            <option value="rejected">Rechazados</option>
          </select>
          <button onClick={load}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin solicitudes</p>
          <p className="text-sm mt-1">Las solicitudes del formulario de registro aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const isExpanded = expanded === req.id;
            const st = REQUEST_STATUS_LABELS[req.status] || { label: req.status, color: 'bg-slate-100 text-slate-600' };
            const isPending = req.status === 'pending' || req.status === 'contacted';
            return (
              <div key={req.id}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 truncate">{req.condominio_nombre}</span>
                      <Badge label={st.label} color={st.color} />
                      {req.subscription_plan_name && (
                        <span className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full font-medium">
                          {req.subscription_plan_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {req.admin_nombre} {req.admin_apellido} · {req.admin_email}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {req.condominio_unidades} unidades · {req.condominio_pais} {req.condominio_ciudad}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isPending && (
                      <>
                        <button onClick={() => setApproving(req)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">
                          <CheckCircle size={13} /> Aprobar
                        </button>
                        <button onClick={() => setRejecting(req)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors">
                          <XCircle size={13} /> Rechazar
                        </button>
                      </>
                    )}
                    {req.status === 'enrolled' && req.tenant_id && (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <ShieldCheck size={14} /> Tenant creado
                      </span>
                    )}
                    <button onClick={() => toggleExpand(req.id)}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Condominio</p>
                      <p className="text-slate-700">{req.condominio_nombre}</p>
                      <p className="text-xs text-slate-500">{req.condominio_tipo_admin} · {req.condominio_currency}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Responsable</p>
                      <p className="text-slate-700">{req.admin_nombre} {req.admin_apellido}</p>
                      <p className="text-xs text-slate-500">{req.admin_cargo || 'Sin cargo'} · {req.admin_telefono || 'Sin teléfono'}</p>
                    </div>
                    {req.mensaje && (
                      <div className="col-span-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Mensaje</p>
                        <p className="text-slate-700 text-xs">{req.mensaje}</p>
                      </div>
                    )}
                    {req.admin_notes && (
                      <div className="col-span-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Notas Internas</p>
                        <p className="text-slate-600 text-xs">{req.admin_notes}</p>
                      </div>
                    )}
                    {req.rejected_at && req.rejection_reason && (
                      <div className="col-span-2 bg-red-50 border border-red-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-600 mb-1">Motivo de Rechazo</p>
                        <p className="text-xs text-red-700">{req.rejection_reason}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Registro</p>
                      <p className="text-xs text-slate-500">{new Date(req.created_at).toLocaleString('es-MX')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Días de Prueba</p>
                      <p className="text-xs text-slate-700">{req.trial_days} días</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {approving && (
        <ApproveModal
          request={approving}
          plans={plans}
          onClose={() => setApproving(null)}
          onDone={() => { setApproving(null); load(); }}
        />
      )}
      {rejecting && (
        <RejectModal
          request={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => { setRejecting(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Suscripciones ───────────────────────────────────────────────────────

function TabSuscripciones() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    tenantSubscriptionsAPI.list({ status: statusFilter || undefined })
      .then(r => setSubs(r.data.results || r.data))
      .catch(() => toast.error('Error al cargar suscripciones'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-800">Suscripciones Activas</h3>
          <p className="text-sm text-slate-500 mt-0.5">Estado de las membresías de todos los tenants</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">Todos los estados</option>
            <option value="trial">En prueba</option>
            <option value="active">Activas</option>
            <option value="past_due">Vencidas</option>
            <option value="cancelled">Canceladas</option>
            <option value="expired">Expiradas</option>
          </select>
          <button onClick={load}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {subs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Zap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin suscripciones</p>
          <p className="text-sm mt-1">Aquí aparecerán los tenants cuando tengan una membresía activa</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Unidades</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Monto/ciclo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Prueba vence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Próx. cobro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {subs.map(sub => {
                const st = STATUS_LABELS[sub.status] || { label: sub.status, color: 'bg-slate-100 text-slate-600' };
                return (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{sub.tenant_name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{sub.plan_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge label={st.label} color={st.color} />
                        {sub.status === 'trial' && sub.trial_days_remaining != null && (
                          <span className="text-xs text-blue-600 font-medium">
                            {sub.trial_days_remaining}d restantes
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">{sub.units_count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-teal-700">
                      {sub.amount_per_cycle > 0 ? fmtAmt(sub.amount_per_cycle, sub.currency) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {sub.trial_end ? new Date(sub.trial_end).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString('es-MX') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'planes',         label: 'Planes',        icon: Star },
  { id: 'solicitudes',    label: 'Solicitudes',   icon: Building2 },
  { id: 'suscripciones',  label: 'Suscripciones', icon: ShieldCheck },
];

export default function Suscripciones() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState('solicitudes');

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="text-center">
          <ShieldCheck size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Acceso restringido</p>
          <p className="text-sm mt-1">Este módulo es exclusivo para superadministradores</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800">Suscripciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestiona planes, solicitudes de prueba y membresías de tenants
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 mb-6 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="bg-slate-50 rounded-2xl p-6 min-h-[400px]">
        {tab === 'planes'        && <TabPlanes />}
        {tab === 'solicitudes'   && <TabSolicitudes />}
        {tab === 'suscripciones' && <TabSuscripciones />}
      </div>
    </div>
  );
}
