/**
 * Análisis financiero ejecutivo del estado de cuenta de una unidad.
 * Se usa en el modal de Estado de Cuenta y en el overlay de Cobranza.
 */

const PAID_STATUSES = new Set(['pagado', 'exento', 'pagado_despues']);

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildUnitAnalysis(data, { fromPeriod, toPeriod } = {}) {
  const periods = Array.isArray(data?.periods) ? data.periods : [];
  const charges = num(data?.total_charges);
  const paid = num(data?.total_payments);
  const balance = num(data?.balance);
  const prevDebt = num(data?.net_prev_debt ?? data?.previous_debt);
  const prevDebtPaid = num(data?.prev_debt_adeudo);
  const credit = num(data?.credit_balance);
  const unit = data?.unit || {};
  const plan = data?.active_plan || null;
  const hasPlan = !!data?.has_active_plan && !!plan;

  const relevant = periods.filter(p => p.status !== 'futuro');
  const paidCount = relevant.filter(p => PAID_STATUSES.has(p.status)).length;
  const partialCount = relevant.filter(p => p.status === 'parcial').length;
  const pendingCount = relevant.filter(p => p.status === 'pendiente').length;
  const compliance = relevant.length ? (paidCount / relevant.length) * 100 : 100;

  const overdueItems = relevant
    .map(p => ({
      period: p.period,
      charge: num(p.charge),
      paidAmt: num(p.paid),
      deficit: Math.max(0, num(p.charge) - num(p.paid)),
      status: p.status,
      saldoAcum: num(p.saldo_accum),
    }))
    .filter(x => x.deficit > 0.01);

  const overdueAmount = overdueItems.reduce((s, x) => s + x.deficit, 0);
  const oldestOverdue = overdueItems[0] || null;
  const newestOverdue = overdueItems.length ? overdueItems[overdueItems.length - 1] : null;

  const lastSix = relevant.slice(-6).map(p => {
    const chargeAmt = num(p.charge);
    const paidAmt = num(p.paid);
    return {
      period: p.period,
      charge: chargeAmt,
      paid: paidAmt,
      coverage: chargeAmt > 0 ? Math.min(100, (paidAmt / chargeAmt) * 100) : (paidAmt > 0 ? 100 : 0),
      status: p.status,
    };
  });
  const lastSixCoverage = lastSix.length
    ? lastSix.reduce((s, x) => s + x.coverage, 0) / lastSix.length
    : 100;

  let situation = 'al_corriente';
  if (balance > 1) situation = 'moroso';
  else if (balance < -1) situation = 'a_favor';

  const coverageOverall = charges > 0 ? Math.min(100, (paid / charges) * 100) : (paid > 0 ? 100 : 100);

  const diagnosis = _diagnosis({
    situation, balance, compliance, overdueItems, oldestOverdue, hasPlan, plan, credit, prevDebt,
  });

  const recommendation = _recommendation({
    situation, balance, overdueItems, hasPlan, plan, compliance,
  });

  return {
    unit,
    fromPeriod: fromPeriod || relevant[0]?.period || '',
    toPeriod: toPeriod || relevant[relevant.length - 1]?.period || '',
    generatedAt: new Date().toISOString(),
    charges,
    paid,
    balance,
    prevDebt,
    prevDebtPaid,
    credit,
    situation,
    compliance: Math.round(compliance * 10) / 10,
    coverageOverall: Math.round(coverageOverall * 10) / 10,
    lastSixCoverage: Math.round(lastSixCoverage * 10) / 10,
    periodsCount: relevant.length,
    paidCount,
    partialCount,
    pendingCount,
    overdueCount: overdueItems.length,
    overdueAmount,
    oldestOverdue,
    newestOverdue,
    overdueItems,
    lastSix,
    hasPlan,
    plan,
    diagnosis,
    recommendation,
    tenantName: data?.tenant_name || '',
  };
}

function _diagnosis({ situation, balance, compliance, overdueItems, oldestOverdue, hasPlan, plan, credit, prevDebt }) {
  const abs = Math.abs(balance);
  if (hasPlan) {
    const isSettlement = plan?.plan_type === 'settlement';
    if (isSettlement) {
      return `La unidad opera bajo una liquidación con quita. El adeudo histórico queda cubierto al pagar el importe pactado; el seguimiento ejecutivo debe centrarse en el cierre de esa liquidación, no en la deuda previa.`;
    }
    return `La unidad tiene un plan de pagos vigente que absorbe el adeudo histórico. El riesgo operativo está en el cumplimiento de las cuotas, no en el saldo anterior al plan.`;
  }
  if (situation === 'a_favor') {
    return `La unidad se encuentra al corriente y además presenta un saldo a favor de ${abs.toFixed(2)}. Ese crédito se aplica a cargos futuros y no requiere gestión de cobranza.`;
  }
  if (situation === 'al_corriente') {
    if (credit > 0.5) {
      return `La unidad está al corriente al corte. Conserva un saldo a favor residual de ${credit.toFixed(2)}. No hay períodos vencidos pendientes de regularización.`;
    }
    return `La unidad se encuentra al corriente. Los cargos del rango analizado están cubiertos y no hay saldo vencido al corte.`;
  }
  const n = overdueItems.length;
  const oldest = oldestOverdue?.period || '';
  if (compliance >= 70 && n <= 2) {
    return `La unidad presenta un atraso acotado (${n} período${n === 1 ? '' : 's'}). El cumplimiento histórico sigue siendo alto (${compliance.toFixed(0)}%). Conviene regularizar antes de que el saldo se capitalice en más meses.`;
  }
  if (prevDebt > 0.5) {
    return `El adeudo combina deuda anterior al sistema y períodos vencidos. El atraso más antiguo del estado de cuenta es ${oldest || 'N/D'}. Requiere gestión activa de cobranza.`;
  }
  return `La unidad presenta un adeudo de ${n} período${n === 1 ? '' : 's'} vencido${n === 1 ? '' : 's'}. El atraso más antiguo corresponde a ${oldest || 'N/D'}. El cumplimiento del rango es ${compliance.toFixed(0)}%.`;
}

function _recommendation({ situation, balance, overdueItems, hasPlan, plan, compliance }) {
  if (hasPlan) {
    if (plan?.plan_type === 'settlement') {
      return 'Dar seguimiento al pago único de liquidación y confirmar el cierre del adeudo histórico al cubrirse el importe pactado.';
    }
    const pending = (plan?.installments || []).filter(i => i.status !== 'paid').length;
    return pending
      ? `Dar seguimiento a las ${pending} cuota${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} del plan. Un incumplimiento reabre el riesgo de mora.`
      : 'El plan no tiene cuotas pendientes. Verificar que el estatus se marque como completado.';
  }
  if (situation === 'a_favor') {
    return 'No se requiere acción de cobranza. El saldo a favor se aplicará a los próximos cargos ordinarios.';
  }
  if (situation === 'al_corriente') {
    return 'Mantener la disciplina de pago. No hay acciones de recuperación pendientes al corte.';
  }
  if (overdueItems.length >= 3 || compliance < 50) {
    return 'Priorizar contacto de cobranza y, si aplica, proponer un plan de pagos o liquidación con quita para contener el crecimiento del adeudo.';
  }
  return `Solicitar la regularización del saldo (${overdueItems.length} período${overdueItems.length === 1 ? '' : 's'}) en el siguiente ciclo de cobranza.`;
}
