'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Check, 
  X, 
  User, 
  Phone, 
  Clock, 
  Calendar,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ModalPortal } from '@/components/ui/modal-portal';
import { toast } from 'sonner';

interface PosPreordersModalProps {
  slug: string;
  isOpen: boolean;
  onClose: () => void;
  onLoadQuote: (quote: any, items: any[]) => void;
  primaryCurrency: string;
}

export function PosPreordersModal({
  slug,
  isOpen,
  onClose,
  onLoadQuote,
  primaryCurrency,
}: PosPreordersModalProps) {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingQuoteId, setLoadingQuoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/admin/${slug}/sales/quotes?pageSize=30`)
      .then((res) => res.json())
      .then((data) => {
        // Excluir las ya convertidas o rechazadas
        const active = (data.quotes || []).filter(
          (q: any) => q.status !== 'CONVERTED' && q.status !== 'REJECTED'
        );
        setQuotes(active);
      })
      .catch((err) => {
        console.error('Error fetching preorders in POS:', err);
        toast.error('No se pudieron cargar las preórdenes');
      })
      .finally(() => setLoading(false));
  }, [isOpen, slug]);

  if (!isOpen) return null;

  const filtered = quotes.filter((q) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      q.quote_number.toLowerCase().includes(s) ||
      q.customer_name.toLowerCase().includes(s) ||
      q.customer_whatsapp.toLowerCase().includes(s)
    );
  });

  const handleSelectQuote = async (quote: any) => {
    setLoadingQuoteId(quote.id);
    try {
      const res = await fetch(`/api/admin/${slug}/sales/quotes/${quote.id}`);
      if (!res.ok) throw new Error('Error al cargar detalle');
      const data = await res.json();

      onLoadQuote(data.quote, data.items || []);
      toast.success(`Preorden ${quote.quote_number} cargada en caja`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setLoadingQuoteId(null);
    }
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95 my-auto">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-stone-950 dark:text-white text-base">
                  Preórdenes & Cotizaciones Activas
                </h2>
                <p className="text-xs text-stone-500 dark:text-zinc-400">
                  Selecciona una cotización de un vendedor para cargarla en la caja y cobrarla al instante.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-white transition"
            >
              ✕
            </button>
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Buscar por correlativo COT-, cliente o WhatsApp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
              autoFocus
            />
          </div>

          {/* Lista de Preórdenes */}
          <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
            {loading ? (
              <div className="p-8 text-center text-xs text-stone-400">
                Consultando cotizaciones...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-stone-200 dark:border-zinc-800 rounded-2xl text-xs text-stone-400">
                No se encontraron preórdenes pendientes para facturar.
              </div>
            ) : (
              filtered.map((q) => {
                const total = parseFloat(String(q.total_primary)).toFixed(2);
                const isSelected = loadingQuoteId === q.id;

                return (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-stone-50/50 dark:bg-zinc-900/30 flex items-center justify-between gap-3 hover:border-purple-500/50 transition-all text-xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-stone-950 dark:text-white text-sm">
                          {q.quote_number}
                        </span>
                        <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-300">
                          {q.status}
                        </Badge>
                      </div>

                      <p className="font-bold text-stone-900 dark:text-zinc-100 truncate">
                        {q.customer_name} · <span className="font-normal text-stone-500">📞 {q.customer_whatsapp}</span>
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-stone-500 dark:text-zinc-400">
                        <span>Asesor: <strong>{q.sales_rep_name || 'Venta Directa'}</strong></span>
                        <span>•</span>
                        <span>{q.items_count} producto(s)</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-1.5">
                      <div className="font-mono font-black text-base text-stone-950 dark:text-white">
                        ${total} {primaryCurrency}
                      </div>

                      <Button
                        size="sm"
                        disabled={isSelected}
                        onClick={() => handleSelectQuote(q)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8 px-3"
                      >
                        {isSelected ? 'Cargando...' : 'Cargar en Caja'}
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-stone-100 dark:border-zinc-800">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cerrar
            </Button>
          </div>
        </div>
    </ModalPortal>
  );
}
