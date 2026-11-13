'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { uploadTenantMedia } from '@/lib/media-client';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  ShieldCheck,
  FileImage,
  Upload,
  User,
  Phone,
  MapPin,
  MessageSquare,
  Package,
  History,
  Boxes,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Printer,
  FileDown,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface OrderDetail {
  id: string;
  order_number: string;
  store_id: string | null;
  store_name: string | null;
  customer_name: string;
  customer_phone: string;
  status: string;
  delivery_type: string;
  delivery_address: string | null;
  subtotal_usd: string;
  discount_usd: string;
  tax_usd: string;
  shipping_usd: string;
  total_usd: string;
  total_secondary?: string | null;
  exchange_rate_applied?: string | null;
  is_offline_sale: boolean;
  offline_ticket_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  image_url: string | null;
  quantity: number;
  unit_price_usd: string;
  total_price_usd: string;
}

interface PaymentRow {
  id: string;
  method: string;
  amount: string;
  currency: string;
  reference_number: string | null;
  proof_file_hash: string | null;
  proof_image_url: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

interface InventoryMovementRow {
  id: string;
  product_id: string;
  product_name: string | null;
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
  movement_type: string;
  notes: string | null;
  created_at: string;
}

interface TenantPaymentMethod {
  code: string;
  name: string;
  is_active: boolean;
}

const ORDER_STATUS_META: Record<string, { label: string; className: string }> = {
  CREATED: {
    label: 'Recibido',
    className: 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-zinc-200 border-slate-300 dark:border-zinc-700',
  },
  PREORDER_PENDING_REVIEW: {
    label: 'Pre-orden',
    className: 'bg-violet-500/15 text-violet-800 dark:text-violet-300 border-violet-500/30',
  },
  PENDING_PAYMENT_VERIFICATION: {
    label: 'Pago por verificar',
    className: 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/30',
  },
  CONFIRMED: {
    label: 'Confirmado',
    className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  },
  PREPARING: {
    label: 'Preparando',
    className: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30',
  },
  READY_FOR_PICKUP: {
    label: 'Listo para retirar',
    className: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/30',
  },
  DELIVERED: {
    label: 'Entregado',
    className: 'bg-emerald-600/20 text-emerald-900 dark:text-emerald-200 border-emerald-600/40',
  },
  CANCELLED: {
    label: 'Cancelado',
    className: 'bg-red-500/15 text-red-800 dark:text-red-300 border-red-500/30',
  },
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Pedido Creado',
  ORDER_STATUS_UPDATED: 'Cambio de Estado',
  PAYMENT_VERIFIED: 'Pago Verificado',
  PAYMENT_REJECTED: 'Pago Rechazado',
  PAYMENT_PROOF_ATTACHED: 'Comprobante Adjuntado',
};

const STATUS_OPTIONS = [
  { value: 'CREATED', label: 'Recibido' },
  { value: 'PENDING_PAYMENT_VERIFICATION', label: 'Pago por verificar' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'PREPARING', label: 'Preparando' },
  { value: 'READY_FOR_PICKUP', label: 'Listo para retirar' },
  { value: 'DELIVERED', label: 'Entregado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAuditPayload(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  return Object.entries(data)
    .filter(([, val]) => val !== undefined && val !== null && val !== '')
    .map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`);
}

export default function AdminOrderDetailPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();

  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovementRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<TenantPaymentMethod[]>([]);

  // Status Update state
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // Reject Modal/Inline state
  const [rejectingPaymentId, setRejectingPaymentId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Attach / Update Proof form
  const [showAttachForm, setShowAttachForm] = useState(false);
  const [attachMethod, setAttachMethod] = useState('');
  const [attachRef, setAttachRef] = useState('');
  const [attachBankSource, setAttachBankSource] = useState('');
  const [attachProofUrl, setAttachProofUrl] = useState('');
  const [attachProofHash, setAttachProofHash] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);

  // Lightbox & Clipboard
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Thermal Ticket POS Modal
  const [showTicketModal, setShowTicketModal] = useState(false);

  const handlePrintTicket = () => {
    const ticketElem = document.getElementById('pos-thermal-ticket-content');
    if (!ticketElem) return;
    const printWindow = window.open('', '_blank', 'width=450,height=700');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Ticket_${order?.order_number || 'POS'}</title>
            <style>
              @page { size: 80mm auto; margin: 3mm; }
              body {
                font-family: 'Courier New', Courier, monospace, system-ui;
                font-size: 11px;
                color: #000;
                background: #fff;
                margin: 0;
                padding: 4px 8px;
                line-height: 1.35;
              }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .text-left { text-align: left; }
              .font-bold { font-weight: bold; }
              .uppercase { text-transform: uppercase; }
              .border-b { border-bottom: 1px solid #000; }
              .border-dashed { border-bottom: 1px dashed #000; }
              .py-1 { padding-top: 4px; padding-bottom: 4px; }
              .py-2 { padding-top: 8px; padding-bottom: 8px; }
              .my-1 { margin-top: 4px; margin-bottom: 4px; }
              .flex { display: flex; justify-content: space-between; }
              table { width: 100%; border-collapse: collapse; margin-top: 6px; }
              th { border-bottom: 1px solid #000; text-align: left; font-size: 10px; padding: 2px 0; }
              td { padding: 3px 0; vertical-align: top; }
              @media print {
                body { margin: 0; padding: 0; }
              }
            </style>
          </head>
          <body>
            ${ticketElem.innerHTML}
            <script>
              window.onload = function() {
                window.focus();
                window.print();
                setTimeout(function() { window.close(); }, 1500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  const applyPayload = useCallback((data: {
    order: OrderDetail;
    items: OrderItemRow[];
    payments: PaymentRow[];
    audit_logs: AuditLogRow[];
    inventory_movements: InventoryMovementRow[];
  }) => {
    setOrder(data.order);
    setSelectedStatus(data.order.status);
    setItems(data.items || []);
    setPayments(data.payments || []);
    setAuditLogs(data.audit_logs || []);
    setMovements(data.inventory_movements || []);
    if (data.payments?.[0]) {
      setAttachMethod(data.payments[0].method);
      setAttachRef(data.payments[0].reference_number || '');
    }
  }, []);

  const loadOrder = useCallback(async () => {
    if (!slug || !id) return;
    setLoading(true);
    try {
      const [detailRes, pmRes] = await Promise.all([
        fetch(`/api/admin/${slug}/orders/${id}`, { cache: 'no-store' }),
        fetch(`/api/admin/${slug}/payment-methods`, { cache: 'no-store' }),
      ]);
      const detailData = await detailRes.json();
      if (!detailRes.ok) throw new Error(detailData.error || 'Pedido no encontrado');
      applyPayload(detailData);

      if (pmRes.ok) {
        const pmData = await pmRes.json();
        setPaymentMethods(pmData.methods || []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando detalle del pedido');
    } finally {
      setLoading(false);
    }
  }, [slug, id, applyPayload]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const sendPatch = async (payload: Record<string, unknown>, successMsg: string) => {
    setMutating(true);
    try {
      const res = await fetch(`/api/admin/${slug}/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el pedido');
      applyPayload(data);
      toast.success(successMsg);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar cambio');
      return false;
    } finally {
      setMutating(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedStatus) return;
    const ok = await sendPatch(
      {
        action: 'UPDATE_STATUS',
        status: selectedStatus,
        note: statusNote.trim() || undefined,
      },
      'Estado del pedido actualizado'
    );
    if (ok) setStatusNote('');
  };

  const handleVerifyPayment = async (paymentId: string) => {
    await sendPatch(
      {
        action: 'VERIFY_PAYMENT',
        payment_id: paymentId,
        auto_confirm_order: true,
      },
      'Pago verificado y pedido confirmado'
    );
  };

  const handleRejectPayment = async (paymentId: string) => {
    if (rejectionReason.trim().length < 3) {
      toast.error('Ingresa el motivo del rechazo (mínimo 3 caracteres)');
      return;
    }
    const ok = await sendPatch(
      {
        action: 'REJECT_PAYMENT',
        payment_id: paymentId,
        rejection_reason: rejectionReason.trim(),
      },
      'Pago marcado como rechazado'
    );
    if (ok) {
      setRejectingPaymentId(null);
      setRejectionReason('');
    }
  };

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const hash = await computeFileSha256(file);
      const data = await uploadTenantMedia(file, slug, 'proofs', 1200);
      setAttachProofUrl(data.url);
      setAttachProofHash(hash);
      toast.success('Comprobante subido y hash SHA-256 calculado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleAttachProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachRef.trim() && !attachProofUrl) {
      toast.error('Ingresa un número de referencia o adjunta una imagen');
      return;
    }
    const ok = await sendPatch(
      {
        action: 'ATTACH_PAYMENT_PROOF',
        payment_id: payments[0]?.id,
        method: attachMethod || undefined,
        reference_number: attachRef.trim() || null,
        proof_image_url: attachProofUrl || null,
        proof_file_hash: attachProofHash || null,
        bank_source: attachBankSource.trim() || null,
      },
      'Comprobante y referencia registrados (validado anti-fraude)'
    );
    if (ok) {
      setShowAttachForm(false);
      setAttachProofUrl('');
      setAttachProofHash('');
      setAttachBankSource('');
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    toast.success('Hash SHA-256 copiado');
    setTimeout(() => setCopiedHash(false), 1800);
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm font-semibold text-slate-700 dark:text-zinc-300">
        Cargando detalle y auditoría del pedido...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
        <p className="text-base font-bold text-slate-950 dark:text-white">Pedido no encontrado</p>
        <Link
          href={`/t/${slug}/admin/orders`}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--tenant-primary)] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al listado de pedidos
        </Link>
      </div>
    );
  }

  const orderStatusMeta = ORDER_STATUS_META[order.status] || {
    label: order.status,
    className: 'bg-slate-200 text-slate-900 border-slate-300',
  };
  const primaryPayment = payments[0] || null;
  const cleanPhone = (order.customer_phone || '').replace(/[^0-9]/g, '');
  const waHref = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
        `Hola ${order.customer_name}, te escribimos sobre tu pedido ${order.order_number} ($${parseFloat(order.total_usd).toFixed(2)} USD).`
      )}`
    : null;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="space-y-1.5">
          <Link
            href={`/t/${slug}/admin/orders`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:text-[var(--tenant-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Pedidos
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-950 dark:text-white tracking-tight">
              {order.order_number}
            </h1>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${orderStatusMeta.className}`}
            >
              {orderStatusMeta.label}
            </span>
            {order.is_offline_sale && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30">
                POS Offline ({order.offline_ticket_ref || 'Sync'})
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-slate-700 dark:text-zinc-300">
            Registrado el {formatDateTime(order.created_at)} · Sede:{' '}
            <strong className="text-slate-950 dark:text-white">
              {order.store_name || 'Sede Principal'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={loadOrder}
            disabled={mutating}
            className="bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-semibold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refrescar
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowTicketModal(true)}
            className="bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-semibold hover:border-[var(--tenant-primary)] transition-colors"
          >
            <Printer className="w-4 h-4 mr-2 text-[var(--tenant-primary)]" />
            Ticket POS / PDF
          </Button>
          <Link
            href={`/t/${slug}/order-success/${order.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white hover:border-[var(--tenant-primary)] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Recibo Cliente
          </Link>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Items & Total Breakdown */}
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--tenant-primary)]" />
                Productos del Pedido ({items.length})
              </h2>
              <span className="text-xs font-mono font-bold text-slate-600 dark:text-zinc-400">
                Core USD ($)
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-zinc-800 border-y border-slate-200 dark:border-zinc-800">
              {items.map((item) => {
                const rate = parseFloat(order.exchange_rate_applied || '0');
                const unitPriceUsd = parseFloat(item.unit_price_usd);
                const totalPriceUsd = parseFloat(item.total_price_usd);
                const unitPriceBs = rate > 0 ? unitPriceUsd * rate : 0;
                const totalPriceBs = rate > 0 ? totalPriceUsd * rate : 0;

                return (
                  <div
                    key={item.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-zinc-800 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-950 dark:text-white break-words">
                          {item.product_name}
                        </p>
                        <p className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                          {item.sku ? `SKU: ${item.sku} · ` : ''}
                          {item.quantity} × ${unitPriceUsd.toFixed(2)} USD
                          {rate > 0 && (
                            <span className="text-slate-700 dark:text-zinc-300 font-semibold ml-1.5">
                              (Bs. {unitPriceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-sm text-slate-950 dark:text-white">
                        ${totalPriceUsd.toFixed(2)}
                      </div>
                      {rate > 0 && (
                        <div className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300">
                          Bs. {totalPriceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5 text-sm pt-1">
              <div className="flex justify-between text-slate-700 dark:text-zinc-300">
                <span>Subtotal</span>
                <span className="font-mono font-semibold">
                  ${parseFloat(order.subtotal_usd || '0').toFixed(2)}
                </span>
              </div>
              {parseFloat(order.discount_usd || '0') > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>Descuento</span>
                  <span className="font-mono font-semibold">
                    -${parseFloat(order.discount_usd).toFixed(2)}
                  </span>
                </div>
              )}
              {parseFloat(order.tax_usd || '0') > 0 && (
                <div className="flex justify-between text-slate-700 dark:text-zinc-300">
                  <span>Impuesto</span>
                  <span className="font-mono font-semibold">
                    ${parseFloat(order.tax_usd).toFixed(2)}
                  </span>
                </div>
              )}
              {parseFloat(order.shipping_usd || '0') > 0 && (
                <div className="flex justify-between text-slate-700 dark:text-zinc-300">
                  <span>Envío</span>
                  <span className="font-mono font-semibold">
                    ${parseFloat(order.shipping_usd).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-zinc-800">
                <span className="text-base font-black text-slate-950 dark:text-white">
                  Total Pedido
                </span>
                <div className="text-right">
                  <span className="text-xl font-black font-mono text-[var(--tenant-primary)]">
                    ${parseFloat(order.total_usd).toFixed(2)} USD
                  </span>
                  {order.total_secondary && parseFloat(order.total_secondary) > 0 && (
                    <p className="text-xs font-mono font-bold text-slate-600 dark:text-zinc-400 mt-0.5">
                      Bs. {parseFloat(order.total_secondary).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {parseFloat(order.exchange_rate_applied || '0') > 0 && (
                        <span className="text-[11px] font-normal text-slate-500"> (Tasa: {parseFloat(order.exchange_rate_applied || '0').toFixed(2)})</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Payment & Receipt Verification */}
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[var(--tenant-primary)]" />
                Pago, Comprobante y Verificación
              </h2>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAttachForm((prev) => !prev)}
                className="bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-semibold"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {showAttachForm ? 'Cerrar formulario' : primaryPayment ? 'Actualizar Comprobante / Ref' : 'Adjuntar Pago'}
              </Button>
            </div>

            {payments.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-zinc-800 text-sm text-slate-700 dark:text-zinc-300">
                Este pedido aún no tiene registro en la tabla de pagos. Usa{' '}
                <strong>Adjuntar Pago</strong> para registrar referencia o comprobante manualmente.
              </div>
            ) : (
              <div className="space-y-4">
                {payments.map((pay) => (
                  <div
                    key={pay.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-sm font-black text-slate-950 dark:text-white">
                          {pay.method}
                        </span>
                        <span className="font-mono text-sm font-bold text-[var(--tenant-primary)]">
                          {pay.currency === 'VES'
                            ? `Bs. ${parseFloat(pay.amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : `$${parseFloat(pay.amount).toFixed(2)} ${pay.currency}`}
                        </span>
                        {pay.currency === 'USD' && order.total_secondary && parseFloat(order.total_secondary) > 0 && (
                          <span className="text-xs font-mono font-medium text-slate-500 dark:text-zinc-400">
                            (Bs. {parseFloat(order.total_secondary).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </span>
                        )}
                      </div>

                      {pay.status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pago Verificado
                        </span>
                      ) : pay.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30">
                          <XCircle className="w-3.5 h-3.5" />
                          Pago Rechazado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30">
                          <Clock className="w-3.5 h-3.5" />
                          Pendiente de Verificación
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                          Número de Referencia
                        </p>
                        <p className="font-mono font-bold text-slate-950 dark:text-white mt-0.5">
                          {pay.reference_number || 'Sin referencia registrada'}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                          Huella Anti-Fraude (SHA-256)
                        </p>
                        {pay.proof_file_hash ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <code className="text-xs font-mono text-slate-900 dark:text-zinc-200 truncate max-w-[180px]">
                              {pay.proof_file_hash}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyHash(pay.proof_file_hash!)}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                              title="Copiar hash completo"
                            >
                              {copiedHash ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                            No aplica / Sin captura digital
                          </p>
                        )}
                      </div>
                    </div>

                    {pay.verified_at && (
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                        Verificado el {formatDateTime(pay.verified_at)}
                        {pay.verified_by_name ? ` por ${pay.verified_by_name}` : ''}
                      </p>
                    )}

                    {pay.status === 'REJECTED' && pay.rejection_reason && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-900 dark:text-red-200">
                        <strong>Motivo de rechazo:</strong> {pay.rejection_reason}
                      </div>
                    )}

                    {pay.proof_image_url && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setPreviewImageUrl(pay.proof_image_url)}
                          className="group flex items-center gap-3 p-2 pr-4 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:border-[var(--tenant-primary)] transition-colors text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={pay.proof_image_url}
                            alt="Comprobante de pago"
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-zinc-800"
                          />
                          <div>
                            <p className="text-xs font-bold text-slate-950 dark:text-white flex items-center gap-1.5">
                              <FileImage className="w-3.5 h-3.5 text-[var(--tenant-primary)]" />
                              Ampliar comprobante
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                              Clic para inspeccionar imagen
                            </p>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Approval / Rejection Controls */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                      {pay.status !== 'VERIFIED' && (
                        <Button
                          size="sm"
                          disabled={mutating}
                          onClick={() => handleVerifyPayment(pay.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          Aprobar Pago y Confirmar Pedido
                        </Button>
                      )}

                      {pay.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mutating}
                          onClick={() =>
                            setRejectingPaymentId((prev) => (prev === pay.id ? null : pay.id))
                          }
                          className="border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-500/10 font-semibold"
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          Rechazar Pago
                        </Button>
                      )}
                    </div>

                    {rejectingPaymentId === pay.id && (
                      <div className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-red-300 dark:border-red-900/60 space-y-2.5">
                        <label className="text-xs font-bold text-slate-900 dark:text-white block">
                          Motivo del rechazo (quedará registrado en auditoría):
                        </label>
                        <Input
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Ej: Monto incompleto, referencia no encontrada en banco..."
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={mutating}
                            onClick={() => handleRejectPayment(pay.id)}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold"
                          >
                            Confirmar Rechazo
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectingPaymentId(null);
                              setRejectionReason('');
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Attach Proof / Reference Manual Form */}
            {showAttachForm && (
              <form
                onSubmit={handleAttachProofSubmit}
                className="p-4 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/80 space-y-3.5"
              >
                <p className="text-sm font-extrabold text-slate-950 dark:text-white">
                  Adjuntar o Actualizar Comprobante / Referencia
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                      Método de Pago
                    </label>
                    <select
                      value={attachMethod}
                      onChange={(e) => setAttachMethod(e.target.value)}
                      className="w-full h-9 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm font-medium text-slate-950 dark:text-white"
                    >
                      {paymentMethods.length > 0 ? (
                        paymentMethods.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.name} ({m.code})
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="BANK_TRANSFER">Transferencia Bancaria</option>
                          <option value="CASH_USD">Efectivo USD ($)</option>
                          <option value="CARD">Tarjeta / Punto</option>
                          <option value="OTHER">Otro</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                      Número de Referencia
                    </label>
                    <Input
                      value={attachRef}
                      onChange={(e) => setAttachRef(e.target.value)}
                      placeholder="Ej: 00459182"
                      className="bg-white dark:bg-zinc-950 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                      Banco / Plataforma Origen (opcional anti-fraude)
                    </label>
                    <Input
                      value={attachBankSource}
                      onChange={(e) => setAttachBankSource(e.target.value)}
                      placeholder="Ej: Zelle, Binance, Chase..."
                      className="bg-white dark:bg-zinc-950 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
                      Captura del Comprobante (imagen)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProofFileChange}
                      disabled={uploadingProof}
                      className="block w-full text-xs text-slate-700 dark:text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[var(--tenant-primary)] file:text-[var(--tenant-primary-fg)] cursor-pointer"
                    />
                  </div>
                </div>

                {attachProofUrl && (
                  <div className="flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Imagen subida y lista (SHA-256: {attachProofHash.slice(0, 16)}...)</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="submit"
                    disabled={mutating || uploadingProof}
                    style={{
                      backgroundColor: 'var(--tenant-primary)',
                      color: 'var(--tenant-primary-fg)',
                    }}
                    className="font-bold"
                  >
                    {uploadingProof ? 'Subiendo...' : 'Guardar Comprobante en Auditoría'}
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Card 3: Audit Logs Timeline */}
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--tenant-primary)]" />
              Auditoría Inmutable del Pedido ({auditLogs.length})
            </h2>

            {auditLogs.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                Sin eventos de auditoría registrados para este pedido todavía.
              </p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => {
                  const newItems = formatAuditPayload(log.new_data);
                  const oldItems = formatAuditPayload(log.old_data);
                  return (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-zinc-800 dark:text-zinc-100">
                            {AUDIT_ACTION_LABELS[log.action] || log.action}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            {log.actor_name || 'Sistema / Cliente'}
                            {log.actor_role ? ` (${log.actor_role})` : ''}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>

                      {oldItems.length > 0 && (
                        <div className="text-xs text-slate-600 dark:text-zinc-400 font-mono">
                          Anterior: {oldItems.join(' · ')}
                        </div>
                      )}
                      {newItems.length > 0 && (
                        <div className="text-xs text-slate-900 dark:text-zinc-200 font-mono font-medium">
                          Nuevo: {newItems.join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 4: Inventory Movements */}
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[var(--tenant-primary)]" />
              Trazabilidad de Inventario ({movements.length})
            </h2>

            {movements.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                No hay movimientos de inventario asociados al correlativo {order.order_number}.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 font-bold uppercase border-b border-slate-200 dark:border-zinc-800">
                      <th className="py-2.5 px-3">Producto</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3 text-right">Cambio</th>
                      <th className="py-2.5 px-3 text-right">Stock Ant → Nuevo</th>
                      <th className="py-2.5 px-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                    {movements.map((mv) => (
                      <tr key={mv.id} className="text-slate-900 dark:text-zinc-200">
                        <td className="py-2.5 px-3 font-semibold">
                          {mv.product_name || mv.product_id}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{mv.movement_type}</td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono font-bold ${
                            mv.quantity_change < 0
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {mv.quantity_change > 0 ? `+${mv.quantity_change}` : mv.quantity_change}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {mv.previous_quantity} → <strong>{mv.new_quantity}</strong>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-zinc-400">
                          {formatDateTime(mv.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6 print:hidden">
          {/* Status Workflow Control */}
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3.5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950 dark:text-white">
              Gestión del Estado
            </h2>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                Estado del Pedido
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-3 text-sm font-semibold text-slate-950 dark:text-white"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                Nota de auditoría (opcional)
              </label>
              <Input
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Ej: Empacado en caja #2"
                className="text-sm bg-slate-50 dark:bg-zinc-900"
              />
            </div>

            <Button
              onClick={handleUpdateStatus}
              disabled={mutating || selectedStatus === order.status}
              style={{
                backgroundColor: 'var(--tenant-primary)',
                color: 'var(--tenant-primary-fg)',
              }}
              className="w-full font-bold"
            >
              Guardar Cambio de Estado
            </Button>
          </div>

          {/* Customer Info */}
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3.5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--tenant-primary)]" />
              Cliente y Entrega
            </h2>

            <div className="space-y-2.5 text-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                  Cliente
                </p>
                <p className="font-bold text-slate-950 dark:text-white">
                  {order.customer_name}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                  Teléfono / WhatsApp
                </p>
                <p className="font-mono font-semibold text-slate-900 dark:text-zinc-200 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  {order.customer_phone}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                  Modalidad
                </p>
                <p className="font-semibold text-slate-900 dark:text-zinc-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {order.delivery_type === 'PICKUP'
                    ? 'Retiro en tienda (Pick-up)'
                    : order.delivery_type === 'DELIVERY'
                      ? 'Envío a domicilio'
                      : order.delivery_type === 'POS'
                        ? 'Venta en Mostrador POS'
                        : order.delivery_type}
                </p>
              </div>

              {order.delivery_address && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                    Dirección de Entrega
                  </p>
                  <p className="text-slate-800 dark:text-zinc-300">
                    {order.delivery_address}
                  </p>
                </div>
              )}

              {order.notes && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-0.5">
                    Notas del pedido
                  </p>
                  <p className="text-xs text-slate-800 dark:text-zinc-200 whitespace-pre-wrap">
                    {order.notes}
                  </p>
                </div>
              )}
            </div>

            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-10 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Escribir por WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Proof Image Lightbox Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-zinc-950 rounded-2xl p-3 border border-zinc-800 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Comprobante de Pago — {order.order_number}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImageUrl}
              alt="Comprobante ampliado"
              className="w-full max-h-[75vh] object-contain rounded-xl bg-slate-100 dark:bg-black"
            />
          </div>
        </div>
      )}

      {/* Modal Previsualización de Ticket POS de Alto Prestigio */}
      {showTicketModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white print:fixed print:inset-0"
          onClick={() => setShowTicketModal(false)}
        >
          <div
            className="relative max-w-md w-full bg-slate-900 text-white rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-w-none print:w-full print:border-none print:shadow-none print:p-0 print:bg-white print:text-black"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/70 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-[var(--tenant-primary)]" />
                <span className="text-sm font-extrabold tracking-tight">
                  Ticket de Venta Oficial (80mm)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowTicketModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Ticket Preview with realistic thermal paper design */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-zinc-950/40 flex justify-center print:p-0 print:overflow-visible print:bg-white">
              <div
                id="pos-thermal-ticket-content"
                className="w-full max-w-[360px] bg-white text-black p-5 shadow-2xl rounded-sm font-mono text-[11px] leading-relaxed border border-zinc-200 print:shadow-none print:border-none print:max-w-none print:p-0"
              >
                {/* Encabezado */}
                <div className="text-center pb-2.5 border-b border-black">
                  <h2 className="text-sm font-black uppercase tracking-wider">
                    {order.store_name || 'SHOP MARKET C.A.'}
                  </h2>
                  <p className="text-[10px] text-zinc-700">RIF: J-50000000-0 · CONTRIBUYENTE ORDINARIO</p>
                  <p className="text-[10px] text-zinc-700">{order.store_name || 'Sede Principal'}</p>
                  <p className="text-[10px] font-bold mt-1 text-black">
                    COMPROBANTE DE VENTA {order.is_offline_sale || order.delivery_type === 'POS_DESK' ? '(MOSTRADOR / POS)' : '(VITRINA DIGITAL)'}
                  </p>
                </div>

                {/* Metadatos de la Venta */}
                <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
                  <div className="flex justify-between">
                    <span className="font-bold">Nº DE ORDEN:</span>
                    <span className="font-bold">{order.order_number}</span>
                  </div>
                  {order.offline_ticket_ref && (
                    <div className="flex justify-between">
                      <span className="font-bold">TICKET POS:</span>
                      <span className="font-bold">{order.offline_ticket_ref}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>FECHA / HORA:</span>
                    <span>{formatDateTime(order.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CLIENTE:</span>
                    <span className="font-bold">{order.customer_name}</span>
                  </div>
                  {order.customer_phone && order.customer_phone !== '0000000000' && (
                    <div className="flex justify-between">
                      <span>TELÉFONO:</span>
                      <span>{order.customer_phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>CANAL / ENTREGA:</span>
                    <span>{order.delivery_type === 'POS_DESK' ? 'VENTA EN TIENDA / POS' : 'RETIRO EN TIENDA'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ESTADO:</span>
                    <span className="font-bold uppercase">{order.status}</span>
                  </div>
                </div>

                {/* Tabla de Productos */}
                <div className="py-2 border-b border-black">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-black text-[10px]">
                        <th className="py-1">CANT</th>
                        <th className="py-1">DESCRIPCIÓN</th>
                        <th className="py-1 text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dotted divide-zinc-400">
                      {items.map((it) => {
                        const rate = parseFloat(order.exchange_rate_applied || '0');
                        const totalUsd = parseFloat(it.total_price_usd);
                        const totalBs = rate > 0 ? totalUsd * rate : 0;
                        const unitPriceUsd = parseFloat(it.unit_price_usd);
                        const unitPriceBs = rate > 0 ? unitPriceUsd * rate : 0;

                        return (
                          <tr key={it.id}>
                            <td className="py-1.5 align-top font-bold">{Number(it.quantity).toFixed(0)}x</td>
                            <td className="py-1.5 align-top">
                              <div className="font-semibold text-black">{it.product_name}</div>
                              <div className="text-[9px] text-zinc-600">
                                @ ${unitPriceUsd.toFixed(2)} USD
                                {rate > 0 && ` (Bs. ${unitPriceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
                              </div>
                            </td>
                            <td className="py-1.5 align-top text-right font-bold whitespace-nowrap">
                              <div>${totalUsd.toFixed(2)}</div>
                              {rate > 0 && (
                                <div className="text-[9px] text-zinc-600 font-normal">
                                  Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totales y Liquidación */}
                <div className="py-2 border-b border-dashed border-black text-[11px] space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span>SUBTOTAL USD:</span>
                    <span>${parseFloat(order.subtotal_usd || '0').toFixed(2)}</span>
                  </div>
                  {parseFloat(order.discount_usd || '0') > 0 && (
                    <div className="flex justify-between text-[10px]">
                      <span>DESCUENTO:</span>
                      <span>-${parseFloat(order.discount_usd).toFixed(2)}</span>
                    </div>
                  )}
                  {parseFloat(order.tax_usd || '0') > 0 && (
                    <div className="flex justify-between text-[10px]">
                      <span>IVA (16%):</span>
                      <span>${parseFloat(order.tax_usd).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm pt-1 border-t border-black">
                    <span>TOTAL A PAGAR:</span>
                    <span>${parseFloat(order.total_usd).toFixed(2)} USD</span>
                  </div>
                  {((order.total_secondary && parseFloat(order.total_secondary) > 0) || (parseFloat(order.exchange_rate_applied || '0') > 0)) && (
                    <div className="flex justify-between font-black text-sm text-black">
                      <span>TOTAL EN BOLÍVARES:</span>
                      <span>
                        Bs. {(parseFloat(order.total_secondary || '0') > 0
                          ? parseFloat(order.total_secondary || '0')
                          : parseFloat(order.total_usd) * parseFloat(order.exchange_rate_applied || '0')
                        ).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {parseFloat(order.exchange_rate_applied || '0') > 0 && (
                    <div className="text-right text-[9px] text-zinc-600">
                      Tasa Oficial BCV: Bs. {parseFloat(order.exchange_rate_applied || '0').toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} / USD
                    </div>
                  )}
                </div>

                {/* Métodos de Pago Registrados */}
                <div className="py-2 border-b border-black text-[10px] space-y-1">
                  <p className="font-bold">MÉTODO DE PAGO:</p>
                  {payments.length > 0 ? (
                    payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-zinc-800">
                        <span>{p.method} {p.reference_number ? `(Ref: ${p.reference_number})` : ''}:</span>
                        <span className="font-bold">{p.currency} {parseFloat(p.amount).toFixed(2)} [{p.status}]</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between text-zinc-800">
                      <span>EFECTIVO / CAJA POS:</span>
                      <span className="font-bold">${parseFloat(order.total_usd).toFixed(2)} USD</span>
                    </div>
                  )}
                  {primaryPayment?.proof_file_hash && (
                    <p className="text-[8px] text-zinc-500 break-all pt-1">
                      HUELLA SEGURIDAD SHA-256: {primaryPayment.proof_file_hash}
                    </p>
                  )}
                </div>

                {/* Pie de Ticket */}
                <div className="pt-3 text-center text-[9px] text-zinc-700 space-y-0.5">
                  <p className="font-bold">¡GRACIAS POR SU COMPRA!</p>
                  <p>Conserve este comprobante para cualquier cambio o garantía.</p>
                  <p className="font-mono text-[8px] text-zinc-500 mt-1">MarketOS Retail Core v4.1.2 · Verificado Inmutable</p>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-zinc-800 bg-zinc-950/70 print:hidden">
              <Button
                variant="outline"
                onClick={() => setShowTicketModal(false)}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:text-white"
              >
                Cerrar
              </Button>
              <Button
                onClick={handlePrintTicket}
                className="bg-[var(--tenant-primary)] hover:opacity-90 text-white font-bold gap-2"
              >
                <Printer className="w-4 h-4" />
                <FileDown className="w-4 h-4" />
                Imprimir / Guardar PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
