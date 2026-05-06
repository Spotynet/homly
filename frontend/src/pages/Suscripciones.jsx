import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscriptionPlansAPI, trialRequestsAPI, tenantSubscriptionsAPI, tenantsAPI } from '../api/client';
import {
  Plus, Edit, Trash2, Check, X, ChevronDown, ChevronUp,
  DollarSign, Users, Clock, Zap, Star, AlertCircle, RefreshCw,
  CheckCircle, XCircle, ShieldCheck, Building2, CreditCard,
  Calculator, History, PowerOff, Receipt, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SubscriptionReceiptModal from '../components/SubscriptionReceiptModal';

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
    const plan = plans.find(p => p.id === id);
    if (!window.confirm(
      `¿Eliminar el plan "${plan?.name || 'este plan'}"?\n\n` +
      `Los tenants que ya tienen este plan asignado no pierden su suscripción, ` +
      `pero el plan dejará de estar disponible para nuevas asignaciones.`
    )) return;
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

// ─── Helper: compute amount from plan + units (client-side preview) ─────────

function computeAmountPreview(plan, units) {
  if (!plan || !units) return null;
  const n = Number(units);
  if (!n || n < 0) return null;
  let monthly = Number(plan.price_per_unit) * n;
  if (Array.isArray(plan.volume_tiers) && plan.volume_tiers.length > 0) {
    const sorted = [...plan.volume_tiers].sort((a, b) => (a.min_units || 0) - (b.min_units || 0));
    for (const tier of sorted) {
      const minU = tier.min_units || 0;
      const maxU = tier.max_units ?? null;
      if (n >= minU && (maxU === null || n <= maxU)) {
        monthly = Number(tier.price_per_unit) * n;
        break;
      }
    }
  }
  if (plan.billing_cycle === 'annual') {
    const disc = Number(plan.annual_discount_percent || 0) / 100;
    return monthly * 12 * (1 - disc);
  }
  return monthly;
}

// ─── Row Panel (inline status edit + payment + deactivate) ────────────────────

function RowPanel({ sub, plans, onRefresh }) {
  const inputSt = { width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' };
  const labelSt = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };

  // ── Membership edit state ────────────────────────────────────────────────
  const [status,          setStatus]          = useState(sub.status);
  const [plan,            setPlan]            = useState(String(sub.plan || ''));
  const [trialStart,      setTrialStart]      = useState(sub.trial_start      || '');
  const [trialEnd,        setTrialEnd]        = useState(sub.trial_end        || '');
  const [billingStart,    setBillingStart]    = useState(sub.billing_start    || '');
  const [nextBilling,     setNextBilling]     = useState(sub.next_billing_date || '');
  const [nextBillingUnlocked, setNextBillingUnlocked] = useState(false);
  const [unitsCount,      setUnitsCount]      = useState(String(sub.units_count || 0));
  const [amountPerCycle,  setAmountPerCycle]  = useState(String(sub.amount_per_cycle || 0));
  const [currency,        setCurrency]        = useState(sub.currency || 'MXN');
  const [notes,           setNotes]           = useState(sub.notes || '');
  const [saving,          setSaving]          = useState(false);
  const [recalculating,   setRecalculating]   = useState(false);

  // ── Payment state ────────────────────────────────────────────────────────
  const [showPay, setShowPay] = useState(false);
  const [pay, setPay] = useState({
    amount: '', currency: sub.currency || 'MXN', period_label: '',
    payment_date: '', payment_method: 'transfer', reference: '', notes: '',
  });

  // ── Payment history + receipt ─────────────────────────────────────────────
  const [showPayments,    setShowPayments]    = useState(false);
  const [paymentHistory,  setPaymentHistory]  = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [receiptPayment,  setReceiptPayment]  = useState(null);  // payment to show in receipt
  const [tenantData,      setTenantData]      = useState(null);  // full tenant info for receipt

  // ── Deactivate state ─────────────────────────────────────────────────────
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // ── Force-activate / Force-deactivate state ───────────────────────────────
  const [showForceActivate,   setShowForceActivate]   = useState(false);
  const [forceActivateReason, setForceActivateReason] = useState('');
  const [forceActivating,     setForceActivating]     = useState(false);
  const [showForceDeactivate,   setShowForceDeactivate]   = useState(false);
  const [forceDeactivateReason, setForceDeactivateReason] = useState('');
  const [forceDeactivating,     setForceDeactivating]     = useState(false);

  // ── History panel ────────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);

  // Auto-calculate preview when plan or units change
  const selectedPlanObj = plans.find(p => String(p.id) === String(plan));
  const preview = computeAmountPreview(selectedPlanObj, unitsCount);

  // When plan changes, auto-set currency and compute preview
  const handlePlanChange = (newPlanId) => {
    setPlan(newPlanId);
    const p = plans.find(pl => String(pl.id) === String(newPlanId));
    if (p) {
      setCurrency(p.currency);
      const calc = computeAmountPreview(p, unitsCount);
      if (calc !== null) setAmountPerCycle(String(Math.round(calc * 100) / 100));
    }
  };

  // When units change, recalc preview and update amount field
  const handleUnitsChange = (val) => {
    setUnitsCount(val);
    const calc = computeAmountPreview(selectedPlanObj, val);
    if (calc !== null) setAmountPerCycle(String(Math.round(calc * 100) / 100));
  };

  const handleUpdateMembership = async () => {
    setSaving(true);
    try {
      await tenantSubscriptionsAPI.update(sub.id, {
        status,
        plan:              plan || null,
        trial_start:       trialStart      || null,
        trial_end:         trialEnd        || null,
        billing_start:     billingStart    || null,
        next_billing_date: nextBilling     || null,
        units_count:       Number(unitsCount) || 0,
        amount_per_cycle:  Number(amountPerCycle) || 0,
        currency,
        notes,
      });
      await tenantSubscriptionsAPI.syncStatus(sub.id);
      toast.success('Membresía actualizada');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al actualizar');
    } finally { setSaving(false); }
  };

  const handleRecalculate = async () => {
    if (!plan) { toast.error('Selecciona un plan primero'); return; }
    setRecalculating(true);
    try {
      const { data } = await tenantSubscriptionsAPI.calculateAmount(sub.id, {
        units_count: Number(unitsCount) || sub.units_count,
      });
      setAmountPerCycle(String(data.amount_per_cycle));
      setCurrency(data.currency);
      toast.success(`Monto recalculado: ${fmtAmt(data.amount_per_cycle, data.currency)}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al recalcular');
    } finally { setRecalculating(false); }
  };

  // Load tenant detail + payment history (for receipts)
  const loadPaymentHistory = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const [paymentsRes, tenantRes] = await Promise.all([
        tenantSubscriptionsAPI.payments(sub.id),
        tenantsAPI.get(sub.tenant),
      ]);
      setPaymentHistory(Array.isArray(paymentsRes.data) ? paymentsRes.data : []);
      setTenantData(tenantRes.data || null);
    } catch {
      setPaymentHistory([]);
    } finally {
      setLoadingPayments(false);
    }
  }, [sub.id, sub.tenant]);

  const handleTogglePayments = () => {
    if (!showPayments && paymentHistory.length === 0) loadPaymentHistory();
    setShowPayments(p => !p);
  };

  const handleOpenReceipt = async (payment) => {
    // Ensure we have tenant data
    if (!tenantData) {
      try {
        const r = await tenantsAPI.get(sub.tenant);
        setTenantData(r.data || null);
      } catch { /* continue without logo */ }
    }
    setReceiptPayment(payment);
  };

  const handleRecordPayment = async () => {
    if (!pay.amount || !pay.payment_date) { toast.error('Monto y fecha son obligatorios'); return; }
    setSaving(true);
    try {
      const { data: newPayment } = await tenantSubscriptionsAPI.recordPayment(sub.id, { ...pay, amount: Number(pay.amount) });
      toast.success('Pago registrado');
      // Fetch tenant data for receipt if not loaded yet
      let td = tenantData;
      if (!td) {
        try { const r = await tenantsAPI.get(sub.tenant); td = r.data; setTenantData(r.data); } catch { /* ok */ }
      }
      setPay({ amount: '', currency: sub.currency || 'MXN', period_label: '', payment_date: '', payment_method: 'transfer', reference: '', notes: '' });
      setShowPay(false);
      // Refresh payment list if panel is open
      setPaymentHistory(prev => [newPayment, ...prev]);
      // Auto-open receipt for the newly recorded payment
      setReceiptPayment(newPayment);
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al registrar pago');
    } finally { setSaving(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivateReason.trim()) { toast.error('Ingresa el motivo de desactivación'); return; }
    setDeactivating(true);
    try {
      await tenantSubscriptionsAPI.deactivate(sub.id, { reason: deactivateReason });
      toast.success('Suscripción desactivada — historial guardado');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al desactivar');
    } finally { setDeactivating(false); }
  };

  const handleForceActivate = async () => {
    setForceActivating(true);
    try {
      const { data } = await tenantSubscriptionsAPI.forceActivate(sub.id, {
        reason: forceActivateReason.trim() || undefined,
        extend_billing: true,
      });
      toast.success(`Tenant activado manualmente. Estado: ${data.current_status}`);
      setShowForceActivate(false);
      setForceActivateReason('');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al activar manualmente');
    } finally { setForceActivating(false); }
  };

  const handleForceDeactivate = async () => {
    setForceDeactivating(true);
    try {
      await tenantSubscriptionsAPI.forceDeactivate(sub.id, {
        reason: forceDeactivateReason.trim() || undefined,
      });
      toast.success('Tenant suspendido manualmente (pago vencido)');
      setShowForceDeactivate(false);
      setForceDeactivateReason('');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al suspender');
    } finally { setForceDeactivating(false); }
  };

  const history = Array.isArray(sub.subscription_history) ? sub.subscription_history : [];
  const isAlreadyCancelled = sub.status === 'cancelled' || sub.status === 'expired';

  return (
    <>
    <div className="bg-slate-50 border-t border-slate-100 px-4 py-5 space-y-5">

      {/* ── TOP ROW: Modificar membresía ──────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Modificar membresía</p>

        {/* Estado + Plan */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label style={labelSt}>Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inputSt}>
              <option value="trial">Período de Prueba</option>
              <option value="active">Activa</option>
              <option value="past_due">Vencida</option>
              <option value="cancelled">Cancelada</option>
              <option value="expired">Expirada</option>
            </select>
          </div>
          <div>
            <label style={labelSt}>Plan</label>
            <select value={plan} onChange={e => handlePlanChange(e.target.value)} style={inputSt}>
              <option value="">Sin plan</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Fechas */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          {[
            { label: 'Inicio Prueba',      val: trialStart,   set: setTrialStart },
            { label: 'Fin Prueba',         val: trialEnd,     set: setTrialEnd },
            { label: 'Inicio Facturación', val: billingStart, set: setBillingStart },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label style={labelSt}>{label}</label>
              <input type="date" value={val} onChange={e => set(e.target.value)} style={inputSt} />
            </div>
          ))}
        </div>

        {/* Próx. Cobro — campo protegido */}
        <div className="mb-3" style={{ border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', background: nextBillingUnlocked ? '#FFFBEB' : '#F8FAFC' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: nextBillingUnlocked ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Próx. Cobro
              </span>
              <span style={{ fontSize: 11, background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                Campo automático
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!nextBillingUnlocked && (
                <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>
                  {nextBilling ? new Date(nextBilling + 'T00:00:00').toLocaleDateString('es-MX') : '—'}
                </span>
              )}
              <button
                type="button"
                onClick={() => setNextBillingUnlocked(v => !v)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                  border: nextBillingUnlocked ? '1px solid #D1D5DB' : '1px solid #F59E0B',
                  background: nextBillingUnlocked ? '#F1F5F9' : '#FEF3C7',
                  color: nextBillingUnlocked ? '#475569' : '#B45309',
                }}
              >
                {nextBillingUnlocked ? '🔒 Bloquear' : '🔓 Editar manualmente'}
              </button>
            </div>
          </div>
          {nextBillingUnlocked && (
            <>
              <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 7, padding: '7px 10px', marginBottom: 8 }}>
                ⚠️ <strong>Atención:</strong> Este campo se actualiza automáticamente al registrar pagos. Modificarlo manualmente puede afectar el ciclo de cobro y la detección de cuentas vencidas. Solo hazlo si estás seguro de lo que estás ajustando.
              </div>
              <input
                type="date"
                value={nextBilling}
                onChange={e => setNextBilling(e.target.value)}
                style={inputSt}
              />
            </>
          )}
        </div>

        {/* Unidades + Monto + Moneda */}
        <div className="grid grid-cols-3 gap-3 mb-3 items-end">
          <div>
            <label style={labelSt}>Unidades registradas</label>
            <input type="number" min="0" value={unitsCount}
              onChange={e => handleUnitsChange(e.target.value)} style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>
              Monto / ciclo
              {preview !== null && Math.abs(preview - Number(amountPerCycle)) > 0.01 && (
                <span className="ml-2 text-amber-500 normal-case font-medium">
                  (calculado: {fmtAmt(preview, currency)})
                </span>
              )}
            </label>
            <input type="number" min="0" step="0.01" value={amountPerCycle}
              onChange={e => setAmountPerCycle(e.target.value)} style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Moneda</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputSt}>
              {['MXN','USD','EUR','COP'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Notas */}
        <div className="mb-3">
          <label style={labelSt}>Notas internas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ ...inputSt, resize: 'vertical' }} placeholder="Observaciones sobre esta suscripción..." />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleUpdateMembership} disabled={saving}
            className="flex-1 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando…' : 'Guardar Cambios'}
          </button>
          <button onClick={handleRecalculate} disabled={recalculating || !plan}
            title="Recalcular monto automáticamente según plan y número de unidades"
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors">
            <Calculator size={13} />
            {recalculating ? 'Calculando…' : 'Recalcular'}
          </button>
        </div>

        {preview !== null && (
          <p className="text-xs text-teal-600 mt-2 font-medium">
            <Calculator size={11} className="inline mr-1" />
            Precio calculado por plan: <strong>{fmtAmt(preview, selectedPlanObj?.currency || currency)}</strong>
            {' '} = {unitsCount} unidades × {fmtAmt(selectedPlanObj?.price_per_unit, selectedPlanObj?.currency || currency)}/u
            {selectedPlanObj?.billing_cycle === 'annual' && ` × 12 meses − ${selectedPlanObj?.annual_discount_percent}% desc.`}
          </p>
        )}
      </div>

      {/* ── MIDDLE ROW: Registrar pago ────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Confirmar pago</p>
        <button onClick={() => setShowPay(p => !p)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors mb-3">
          <DollarSign size={13} />
          {showPay ? 'Cancelar' : 'Registrar Pago'}
          {showPay ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showPay && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'amount',       label: 'Monto',            type: 'number', placeholder: '0.00' },
                { key: 'payment_date', label: 'Fecha',            type: 'date' },
                { key: 'period_label', label: 'Período cubierto', type: 'text',   placeholder: 'Ej: Enero 2025' },
                { key: 'reference',    label: 'Referencia',       type: 'text',   placeholder: 'No. transacción' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label style={labelSt}>{label}</label>
                  <input type={type} value={pay[key]} placeholder={placeholder}
                    onChange={e => setPay(p => ({ ...p, [key]: e.target.value }))}
                    style={inputSt} />
                </div>
              ))}
              <div>
                <label style={labelSt}>Método</label>
                <select value={pay.payment_method} onChange={e => setPay(p => ({ ...p, payment_method: e.target.value }))} style={inputSt}>
                  <option value="transfer">Transferencia</option>
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div>
                <label style={labelSt}>Moneda</label>
                <select value={pay.currency} onChange={e => setPay(p => ({ ...p, currency: e.target.value }))} style={inputSt}>
                  {['MXN','USD','EUR','COP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelSt}>Notas</label>
              <textarea value={pay.notes} onChange={e => setPay(p => ({ ...p, notes: e.target.value }))} rows={2}
                style={{ ...inputSt, resize: 'vertical' }} />
            </div>
            <button onClick={handleRecordPayment} disabled={saving}
              className="w-full py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando…' : 'Confirmar Pago'}
            </button>
          </div>
        )}
      </div>

      {/* ── PAGOS REGISTRADOS ─────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pagos registrados</p>
          <button onClick={handleTogglePayments}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors">
            <Receipt size={12} />
            {showPayments ? 'Ocultar' : 'Ver pagos'}
            {showPayments ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
        {showPayments && (
          <div className="space-y-2">
            {loadingPayments ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                <RefreshCw size={13} className="animate-spin" /> Cargando pagos…
              </div>
            ) : paymentHistory.length === 0 ? (
              <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-lg border border-slate-100">
                No hay pagos registrados para esta suscripción.
              </div>
            ) : (
              paymentHistory.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2.5 text-xs">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-bold text-slate-800">{fmtAmt(p.amount, p.currency)}</span>
                    <span className="text-slate-500">{p.period_label || '—'} · {p.payment_method_label} · {p.payment_date}</span>
                    {p.reference && <span className="text-slate-400">Ref: {p.reference}</span>}
                  </div>
                  <button
                    onClick={() => handleOpenReceipt(p)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-bold ml-2 flex-shrink-0">
                    <Eye size={12} /> Ver recibo
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM ROW: Historial + Desactivar ───────────────────────────── */}
      <div className="border-t border-slate-200 pt-4 flex gap-3 flex-wrap">

        {/* Historial de suscripciones anteriores */}
        {history.length > 0 && (
          <button onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors">
            <History size={13} />
            Historial ({history.length} período{history.length !== 1 ? 's' : ''})
            {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}

        {/* Force-activate — visible when tenant is suspended/past_due/expired */}
        {(sub.status === 'past_due' || sub.status === 'expired' || sub.status === 'cancelled') && (
          <button onClick={() => { setShowForceActivate(v => !v); setShowForceDeactivate(false); setShowDeactivate(false); }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
            <CheckCircle size={13} />
            Activar Manualmente
            {showForceActivate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}

        {/* Force-deactivate — visible when tenant is active or trial */}
        {(sub.status === 'active' || sub.status === 'trial') && (
          <button onClick={() => { setShowForceDeactivate(v => !v); setShowForceActivate(false); setShowDeactivate(false); }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
            <AlertCircle size={13} />
            Suspender Manualmente
            {showForceDeactivate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}

        {/* Desactivar suscripción — solo si no está ya cancelada/expirada */}
        {!isAlreadyCancelled && (
          <button onClick={() => { setShowDeactivate(d => !d); setShowForceActivate(false); setShowForceDeactivate(false); }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
            <PowerOff size={13} />
            Cancelar Suscripción
            {showDeactivate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Historial de suscripciones anteriores</p>
          {[...history].reverse().map((snap, i) => (
            <div key={i} className="border border-slate-100 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">{snap.plan_name || 'Sin plan'}</span>
                <span className="text-slate-400">{snap.deactivated_at ? new Date(snap.deactivated_at).toLocaleDateString('es-MX') : '—'}</span>
              </div>
              <div className="flex gap-4 text-slate-500">
                <span>Estado: <strong>{snap.status}</strong></span>
                <span>Monto: <strong>{fmtAmt(snap.amount_per_cycle, snap.currency)}</strong></span>
                <span>Unidades: <strong>{snap.units_count}</strong></span>
              </div>
              {snap.trial_start && (
                <div className="text-slate-400">
                  Prueba: {snap.trial_start} → {snap.trial_end || '—'}
                  {snap.billing_start && ` · Facturación: ${snap.billing_start}`}
                </div>
              )}
              {snap.reason && (
                <div className="text-red-500 font-medium">Motivo: {snap.reason}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Force-activate confirm panel */}
      {showForceActivate && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-green-700">Activar manualmente</p>
              <p className="text-xs text-green-600 mt-0.5">
                El estado pasará a <strong>Activa</strong> y se extenderá automáticamente la próxima fecha de cobro un ciclo.
                Usa esta opción para regularizar cuentas sin esperar el pago automático.
              </p>
            </div>
          </div>
          <div>
            <label style={labelSt}>Motivo (opcional)</label>
            <textarea value={forceActivateReason} onChange={e => setForceActivateReason(e.target.value)} rows={2}
              style={{ ...inputSt, resize: 'vertical' }}
              placeholder="Ej: Pago acordado por vía telefónica, acuerdo especial…" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForceActivate(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={handleForceActivate} disabled={forceActivating}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
              <CheckCircle size={13} />
              {forceActivating ? 'Activando…' : 'Confirmar Activación'}
            </button>
          </div>
        </div>
      )}

      {/* Force-deactivate confirm panel */}
      {showForceDeactivate && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-orange-700">Suspender manualmente</p>
              <p className="text-xs text-orange-600 mt-0.5">
                El estado pasará a <strong>Pago Vencido</strong> y el acceso del tenant se desactivará de inmediato.
                El tenant puede ser reactivado cuando se registre el pago.
              </p>
            </div>
          </div>
          <div>
            <label style={labelSt}>Motivo (opcional)</label>
            <textarea value={forceDeactivateReason} onChange={e => setForceDeactivateReason(e.target.value)} rows={2}
              style={{ ...inputSt, resize: 'vertical' }}
              placeholder="Ej: Pago pendiente, incumplimiento de contrato…" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForceDeactivate(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={handleForceDeactivate} disabled={forceDeactivating}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
              <AlertCircle size={13} />
              {forceDeactivating ? 'Suspendiendo…' : 'Confirmar Suspensión'}
            </button>
          </div>
        </div>
      )}

      {/* Deactivate (cancel) confirm panel */}
      {showDeactivate && !isAlreadyCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700">Cancelar suscripción</p>
              <p className="text-xs text-red-600 mt-0.5">
                Se guardará un snapshot del estado actual en el historial y la suscripción quedará como <strong>Cancelada</strong>.
                El acceso del tenant se desactivará. Podrás crear una nueva suscripción después.
              </p>
            </div>
          </div>
          <div>
            <label style={{ ...labelSt, color: '#DC2626' }}>Motivo de cancelación *</label>
            <textarea value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)} rows={2}
              style={{ ...inputSt, borderColor: '#FCA5A5', resize: 'vertical' }}
              placeholder="Ej: Fin de contrato, cambio de plan, incumplimiento de pago…" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowDeactivate(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={handleDeactivate} disabled={deactivating || !deactivateReason.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
              <PowerOff size={13} />
              {deactivating ? 'Cancelando…' : 'Confirmar Cancelación'}
            </button>
          </div>
        </div>
      )}
    </div>

    {/* ── Receipt modal ── */}
    {receiptPayment && (
      <SubscriptionReceiptModal
        payment={receiptPayment}
        tenant={tenantData}
        sub={sub}
        onClose={() => setReceiptPayment(null)}
      />
    )}
    </>
  );
}

// ─── New Subscription Modal ───────────────────────────────────────────────────

function NewSubModal({ plans, onClose, onDone }) {
  const [allTenants,    setAllTenants]    = useState([]);
  const [existingIds,   setExistingIds]   = useState(new Set());
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [form, setForm] = useState({
    tenant: '', plan: '', status: 'trial',
    trial_start: '', trial_end: '',
    billing_start: '', next_billing_date: '',
    units_count: '', amount_per_cycle: '', currency: 'MXN', notes: '',
  });

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  // Auto-calculate amount_per_cycle whenever plan or units_count change
  const handleNewPlanChange = (newPlanId) => {
    const p = plans.find(pl => String(pl.id) === String(newPlanId));
    const units = form.units_count;
    const calc = p ? computeAmountPreview(p, units) : null;
    setForm(prev => ({
      ...prev,
      plan: newPlanId,
      currency: p ? p.currency : prev.currency,
      amount_per_cycle: calc !== null ? String(Math.round(calc * 100) / 100) : prev.amount_per_cycle,
    }));
  };

  const handleNewUnitsChange = (val) => {
    const p = plans.find(pl => String(pl.id) === String(form.plan));
    const calc = p ? computeAmountPreview(p, val) : null;
    setForm(prev => ({
      ...prev,
      units_count: val,
      amount_per_cycle: calc !== null ? String(Math.round(calc * 100) / 100) : prev.amount_per_cycle,
    }));
  };
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider';

  // Track which tenant IDs have ACTIVE subscriptions (not cancelled/expired)
  const [cancelledIds, setCancelledIds] = useState(new Set());

  useEffect(() => {
    Promise.all([
      tenantsAPI.list(),
      tenantSubscriptionsAPI.list(),
    ]).then(([rT, rS]) => {
      const tenants = rT.data.results || rT.data;
      const subs    = rS.data.results || rS.data;
      setAllTenants(tenants);
      // Exclude tenants that have an ACTIVE/trial/past_due subscription
      const activeSubTenants = new Set(
        subs
          .filter(s => s.status !== 'cancelled' && s.status !== 'expired')
          .map(s => s.tenant)
      );
      const cancelledSubTenants = new Set(
        subs
          .filter(s => s.status === 'cancelled' || s.status === 'expired')
          .map(s => s.tenant)
      );
      setExistingIds(activeSubTenants);
      setCancelledIds(cancelledSubTenants);
    }).catch(() => toast.error('Error al cargar datos'))
      .finally(() => setLoading(false));
  }, []);

  // Tenants without any subscription + tenants with cancelled/expired (allow re-subscribe)
  const available = allTenants.filter(t => !existingIds.has(t.id));
  const isResubscribe = (tenantId) => cancelledIds.has(tenantId);

  // Auto-calculate trial_end when plan and trial_start change
  useEffect(() => {
    if (!form.trial_start || !form.plan) return;
    const plan = plans.find(p => p.id === form.plan);
    if (!plan?.trial_days) return;
    const d = new Date(form.trial_start);
    d.setDate(d.getDate() + Number(plan.trial_days));
    setForm(p => ({ ...p, trial_end: d.toISOString().slice(0, 10) }));
  }, [form.trial_start, form.plan, plans]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.tenant) { toast.error('Selecciona un tenant'); return; }
    setSaving(true);
    try {
      const payload = {
        tenant:            form.tenant,
        plan:              form.plan || null,
        status:            form.status,
        trial_start:       form.trial_start       || null,
        trial_end:         form.trial_end         || null,
        billing_start:     form.billing_start     || null,
        next_billing_date: form.next_billing_date || null,
        units_count:       Number(form.units_count) || 0,
        amount_per_cycle:  Number(form.amount_per_cycle) || 0,
        currency:          form.currency,
        notes:             form.notes,
      };
      const res = await tenantSubscriptionsAPI.create(payload);
      if (res.data?.id) await tenantSubscriptionsAPI.syncStatus(res.data.id);
      toast.success('Suscripción creada');
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || Object.values(e?.response?.data || {})[0]?.[0] || 'Error al crear suscripción');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Nueva Suscripción</h2>
            <p className="text-xs text-slate-500 mt-0.5">Asignar membresía manualmente a un tenant existente</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="w-6 h-6 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">

            {/* Tenant selector */}
            <div>
              <label className={labelCls}>Tenant *</label>
              {available.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Todos los tenants tienen una suscripción activa. Desactiva una suscripción existente antes de crear otra.
                </p>
              ) : (
                <>
                  <select value={form.tenant} onChange={f('tenant')} required className={inputCls}>
                    <option value="">Selecciona un tenant…</option>
                    {available.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{isResubscribe(t.id) ? ' — Reactivar suscripción' : ''}
                      </option>
                    ))}
                  </select>
                  {form.tenant && isResubscribe(form.tenant) && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                      ℹ️ Este tenant tiene una suscripción cancelada/expirada. Se creará una nueva suscripción conservando el historial anterior.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Plan */}
              <div>
                <label className={labelCls}>Plan</label>
                <select value={form.plan} onChange={e => handleNewPlanChange(e.target.value)} className={inputCls}>
                  <option value="">Sin plan</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {/* Estado */}
              <div>
                <label className={labelCls}>Estado</label>
                <select value={form.status} onChange={f('status')} className={inputCls}>
                  <option value="trial">Período de Prueba</option>
                  <option value="active">Activa</option>
                  <option value="past_due">Vencida</option>
                  <option value="cancelled">Cancelada</option>
                  <option value="expired">Expirada</option>
                </select>
              </div>
              {/* Unidades */}
              <div>
                <label className={labelCls}>Unidades</label>
                <input
                  type="number" min="0" step="1"
                  value={form.units_count}
                  onChange={e => handleNewUnitsChange(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              {/* Monto / Ciclo — auto-calculado, editable manualmente */}
              <div>
                <label className={labelCls}>
                  Monto / Ciclo
                  {form.plan && (() => {
                    const p = plans.find(pl => String(pl.id) === String(form.plan));
                    return p ? (
                      <span style={{ fontWeight: 400, color: '#64748b', textTransform: 'none', marginLeft: 4 }}>
                        ({p.billing_cycle === 'annual' ? 'anual' : 'mensual'})
                      </span>
                    ) : null;
                  })()}
                </label>
                <input type="number" min="0" step="0.01" value={form.amount_per_cycle} onChange={f('amount_per_cycle')} placeholder="0.00" className={inputCls} />
                {/* Show tier info when a plan is selected */}
                {form.plan && form.units_count && (() => {
                  const p = plans.find(pl => String(pl.id) === String(form.plan));
                  const calc = computeAmountPreview(p, form.units_count);
                  if (calc === null) return null;
                  return (
                    <p style={{ fontSize: 11, color: '#0d9488', marginTop: 3 }}>
                      Precio calculado por tier: {fmtAmt(calc, p.currency)}
                      {p.billing_cycle === 'annual' && p.annual_discount_percent > 0 && ` (−${p.annual_discount_percent}% anual)`}
                    </p>
                  );
                })()}
              </div>
              {/* Fechas */}
              {[
                { key: 'trial_start',       label: 'Inicio Prueba'      },
                { key: 'trial_end',         label: 'Fin Prueba'         },
                { key: 'billing_start',     label: 'Inicio Facturación' },
                { key: 'next_billing_date', label: 'Próx. Cobro'        },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <input type="date" value={form[key]} onChange={f(key)} className={inputCls} />
                </div>
              ))}
              {/* Moneda */}
              <div>
                <label className={labelCls}>Moneda</label>
                <select value={form.currency} onChange={f('currency')} className={inputCls}>
                  {['MXN','USD','EUR','COP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className={labelCls}>Notas internas</label>
              <textarea value={form.notes} onChange={f('notes')} rows={2}
                className={`${inputCls} resize-none`} placeholder="Notas opcionales…" />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving || available.length === 0}
                className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {saving
                  ? (isResubscribe(form.tenant) ? 'Reactivando…' : 'Creando…')
                  : (isResubscribe(form.tenant) ? 'Reactivar Suscripción' : 'Crear Suscripción')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Suscripciones ───────────────────────────────────────────────────────

function TabSuscripciones() {
  const [subs,              setSubs]              = useState([]);
  const [plans,             setPlans]             = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [statusFilter,      setStatusFilter]      = useState('');
  const [expandedId,        setExpandedId]        = useState(null);
  const [showNewModal,      setShowNewModal]      = useState(false);
  const [runningBillingCheck, setRunningBillingCheck] = useState(false);
  const [billingCheckResult,  setBillingCheckResult]  = useState(null);

  const handleRunBillingCheck = async () => {
    setRunningBillingCheck(true);
    setBillingCheckResult(null);
    try {
      const { data } = await tenantSubscriptionsAPI.runBillingCheck();
      setBillingCheckResult(data);
      if (data.marked_past_due > 0) {
        toast.error(`Se marcaron ${data.marked_past_due} tenant${data.marked_past_due !== 1 ? 's' : ''} como vencidos`);
      } else {
        toast.success('Verificación de cobros completada. Sin nuevos vencimientos.');
      }
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al verificar cobros');
    } finally { setRunningBillingCheck(false); }
  };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      tenantSubscriptionsAPI.list({ status: statusFilter || undefined }),
      subscriptionPlansAPI.list({ active_only: 1 }),
    ])
      .then(([rSubs, rPlans]) => {
        setSubs(rSubs.data.results || rSubs.data);
        setPlans(rPlans.data.results || rPlans.data);
      })
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
          <h3 className="text-base font-bold text-slate-800">Suscripciones</h3>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona las membresías de todos los tenants</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
          <button
            onClick={handleRunBillingCheck}
            disabled={runningBillingCheck}
            title="Verifica todos los tenants activos y marca como vencidos los que no hayan pagado dentro del período de gracia de 5 días"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 disabled:opacity-50 transition-colors">
            {runningBillingCheck
              ? <><RefreshCw size={15} className="animate-spin" /> Verificando…</>
              : <><AlertCircle size={15} /> Verificar Cobros</>
            }
          </button>
          <button onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
            <Plus size={15} /> Nueva Suscripción
          </button>
        </div>
      </div>

      {/* Billing check result banner */}
      {billingCheckResult && (
        <div className={`mb-4 p-4 rounded-xl border text-sm flex items-start gap-3 ${
          billingCheckResult.marked_past_due > 0
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          {billingCheckResult.marked_past_due > 0
            ? <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-orange-600" />
            : <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-green-600" />
          }
          <div>
            <p className="font-bold">
              Verificación completada — {billingCheckResult.checked} suscripciones revisadas
            </p>
            <p className="mt-0.5">
              {billingCheckResult.marked_past_due > 0
                ? `${billingCheckResult.marked_past_due} tenant${billingCheckResult.marked_past_due !== 1 ? 's' : ''} marcado${billingCheckResult.marked_past_due !== 1 ? 's' : ''} como vencidos (superaron los ${billingCheckResult.grace_days} días de gracia). Total vencidos ahora: ${billingCheckResult.total_past_due_now}.`
                : `Ningún tenant nuevo marcado como vencido. Todo en orden.`
              }
            </p>
            {billingCheckResult.details?.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {billingCheckResult.details.map((d, i) => (
                  <li key={i} className="text-xs">
                    • <strong>{d.tenant_name}</strong> — vencido desde {d.next_billing_date} ({d.days_overdue} días)
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={() => setBillingCheckResult(null)} className="ml-auto flex-shrink-0 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      )}

      {subs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin suscripciones</p>
          <p className="text-sm mt-1">Crea una suscripción o aprueba una solicitud de prueba</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Unidades</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Monto/ciclo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Prueba vence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Próx. cobro</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {subs.map(sub => {
                const st       = STATUS_LABELS[sub.status] || { label: sub.status, color: 'bg-slate-100 text-slate-600' };
                const isOpen   = expandedId === sub.id;
                return (
                  <React.Fragment key={sub.id}>
                    <tr
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${isOpen ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                      onClick={() => setExpandedId(isOpen ? null : sub.id)}
                    >
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
                        {sub.trial_end ? new Date(sub.trial_end + 'T00:00:00').toLocaleDateString('es-MX') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {sub.next_billing_date ? new Date(sub.next_billing_date + 'T00:00:00').toLocaleDateString('es-MX') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan="8" className="p-0">
                          <RowPanel sub={sub} plans={plans} onRefresh={() => { setExpandedId(null); load(); }} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNewModal && (
        <NewSubModal
          plans={plans}
          onClose={() => setShowNewModal(false)}
          onDone={() => { setShowNewModal(false); load(); }}
        />
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
