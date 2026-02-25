import React from 'react';
import { Link } from 'react-router-dom';
import { HOMLY_LOGO, APP_VERSION } from '../utils/helpers';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/30">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10">{HOMLY_LOGO}</div>
          <span className="text-2xl font-extrabold text-teal-800 tracking-tight">
            homly<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-ink-600">
          <a href="#beneficios" className="hover:text-teal-700">Beneficios</a>
          <a href="#contacto" className="hover:text-teal-700">Contacto</a>
          <Link to="/login" className="btn btn-coral">Iniciar Sesión</Link>
        </div>
        <Link to="/login" className="md:hidden btn btn-coral btn-sm">Entrar</Link>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-8 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="badge badge-teal mb-4">Property Management</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-teal-800 leading-tight mb-6">
            La administración que tu hogar se merece
          </h1>
          <p className="text-lg text-ink-500 mb-8 leading-relaxed">
            Cuentas claras, registros simples y una convivencia más feliz.
            Gestiona tu condominio de manera profesional y transparente.
          </p>
          <div className="flex gap-4">
            <Link to="/login" className="btn btn-coral text-lg px-8 py-3">
              Empezar ahora →
            </Link>
          </div>
        </div>
        {/* Mockup card */}
        <div className="relative">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-content-center text-teal-700 font-bold text-sm p-2">
                LP
              </div>
              <div>
                <div className="font-bold text-ink-800">Residencial Los Olivos</div>
                <div className="text-xs text-ink-400">48 unidades · Febrero 2025</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-teal-50 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-teal-700">92%</div>
                <div className="text-[10px] text-teal-600 font-semibold">Cobranza</div>
              </div>
              <div className="bg-coral-50 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-coral-600">$120K</div>
                <div className="text-[10px] text-coral-500 font-semibold">Recaudado</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-amber-600">3</div>
                <div className="text-[10px] text-amber-500 font-semibold">Pendientes</div>
              </div>
            </div>
            <div className="space-y-2">
              {['C-001 Casa Rodríguez', 'C-002 Casa López', 'C-003 Casa García'].map((u, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <span className="text-xs font-semibold text-ink-600">{u}</span>
                  <span className={`badge ${i < 2 ? 'badge-teal' : 'badge-coral'}`}>
                    {i < 2 ? '✓ Pagado' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="max-w-7xl mx-auto px-8 py-16">
        <h2 className="text-3xl font-extrabold text-center text-teal-800 mb-12">
          Todo lo que necesitas
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: '📊', title: 'Transparencia Total', desc: 'Dashboard en tiempo real con el estado financiero completo. Cada peso registrado y rastreable.' },
            { icon: '💳', title: 'Pagos sin Fricción', desc: 'Captura pagos, genera recibos y estados de cuenta al instante. Sin hojas de cálculo.' },
            { icon: '🤝', title: 'Armonía Comunitaria', desc: 'Roles y permisos para cada vecino. Información clara que evita conflictos.' },
          ].map((b, i) => (
            <div key={i} className="card card-body text-center hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">{b.icon}</div>
              <h3 className="text-lg font-bold text-ink-800 mb-2">{b.title}</h3>
              <p className="text-sm text-ink-500">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="contacto" className="max-w-3xl mx-auto px-8 py-16 text-center">
        <h2 className="text-3xl font-extrabold text-teal-800 mb-4">
          ¿Listo para transformar tu condominio?
        </h2>
        <p className="text-ink-500 mb-8">Prueba Homly gratis y descubre una nueva forma de administrar.</p>
        <Link to="/login" className="btn btn-coral text-lg px-10 py-3">
          Probar Homly gratis →
        </Link>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 text-sm text-ink-400 border-t border-slate-200">
        © 2025 Homly. La administración que tu hogar se merece.
        <br />
        <span className="text-xs text-ink-300">Powered by Spotynet</span>
      </footer>
    </div>
  );
}
