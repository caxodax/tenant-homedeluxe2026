export default function PosLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 select-none animate-in fade-in duration-300">
      <div className="relative flex flex-col items-center">
        {/* Halo luminoso ambiental */}
        <div
          className="absolute -inset-4 sm:-inset-6 rounded-full blur-2xl opacity-25 animate-pwa-pulse-ring pointer-events-none"
          style={{ backgroundColor: 'var(--tenant-primary, #3b82f6)' }}
        />

        {/* Contenedor central con animación Heartbeat */}
        <div className="relative z-10 w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700/80 p-3 shadow-xl flex items-center justify-center animate-pwa-heartbeat">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-xs"
            style={{ backgroundColor: 'var(--tenant-primary, #3b82f6)' }}
          >
            POS
          </div>
        </div>

        {/* Indicador de carga sutil */}
        <p className="mt-4 text-xs font-mono font-bold text-slate-400 tracking-wider uppercase">
          Inicializando Terminal...
        </p>
      </div>
    </div>
  );
}
