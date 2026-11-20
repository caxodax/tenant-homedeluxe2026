export default function StorefrontLoading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300">
      <div className="relative flex flex-col items-center">
        {/* Halo luminoso ambiental */}
        <div
          className="absolute -inset-4 sm:-inset-6 rounded-full blur-2xl opacity-20 animate-pwa-pulse-ring pointer-events-none"
          style={{ backgroundColor: 'var(--tenant-primary, #ea580c)' }}
        />

        {/* Contenedor central con animación Heartbeat */}
        <div className="relative z-10 w-20 h-20 rounded-2xl bg-white dark:bg-zinc-900 border border-stone-200/90 dark:border-zinc-800 p-3 shadow-lg flex items-center justify-center animate-pwa-heartbeat">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-xs"
            style={{ backgroundColor: 'var(--tenant-primary, #ea580c)' }}
          >
            M
          </div>
        </div>

        {/* Indicador de carga sutil */}
        <div className="mt-4 flex items-center gap-1.5 relative z-10">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--tenant-primary, #ea580c)', animationDelay: '0ms' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--tenant-primary, #ea580c)', animationDelay: '200ms' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--tenant-primary, #ea580c)', animationDelay: '400ms' }}
          />
        </div>
      </div>
    </div>
  );
}
