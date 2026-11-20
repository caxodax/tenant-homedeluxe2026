'use client';

import React, { useState } from 'react';
import { Smartphone, Copy, Check, QrCode, Building2, UserCheck, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PagoMovilConfig, PaymentFieldDetail } from '@/lib/payment-methods';
import { parsePagoMovilFromDetails } from '@/lib/payment-methods';

export interface PagoMovilCardProps {
  data?: PagoMovilConfig;
  details?: PaymentFieldDetail[];
  amountBs?: number;
  exchangeRate?: number;
  className?: string;
}

export function PagoMovilCard({
  data,
  details = [],
  amountBs,
  exchangeRate,
  className = '',
}: PagoMovilCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Resolver datos consolidados
  const resolved: PagoMovilConfig = data?.bank_name || data?.phone || data?.id_doc
    ? data
    : parsePagoMovilFromDetails(details);

  const cleanPhone = (resolved.phone || '').replace(/\D/g, '');
  const cleanIdDoc = (resolved.id_doc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Formato visual legible para el teléfono (0414-123.4567)
  const formatPhoneDisplay = (phone: string) => {
    const d = phone.replace(/\D/g, '');
    if (d.length === 11) {
      return `${d.slice(0, 4)}-${d.slice(4, 7)}.${d.slice(7)}`;
    }
    return phone;
  };

  // Formato visual para documento (V-12345678)
  const formatDocDisplay = (doc: string) => {
    const clean = doc.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length >= 7 && /^[VEJG]/.test(clean)) {
      return `${clean[0]}-${clean.slice(1)}`;
    }
    return doc;
  };

  return (
    <div
      className={cn(
        'p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121214] border-2 border-lime-500/30 text-xs space-y-3.5 shadow-sm transition-all',
        className
      )}
    >
      {/* Cabecera de la Tarjeta */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-lime-500/15 text-lime-600 dark:text-lime-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-sm text-slate-950 dark:text-white block leading-tight">
              Datos para Pago Móvil
            </span>
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">
              Transfiere desde la app de cualquier banco venezolano
            </span>
          </div>
        </div>

        {resolved.bank_name && (
          <span className="text-[10px] bg-lime-500/15 border border-lime-500/30 text-lime-700 dark:text-lime-400 font-extrabold px-2.5 py-1 rounded-full shrink-0">
            {resolved.bank_code ? `${resolved.bank_code} - ` : ''}
            {resolved.bank_name}
          </span>
        )}
      </div>

      {/* Grid de Datos Bancarios con botones de copia de un toque */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
        {/* Banco Receptor */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Banco Receptor
            </span>
            <span className="font-bold text-xs text-slate-950 dark:text-white truncate block">
              {resolved.bank_name || 'No especificado'}
            </span>
          </div>
          {resolved.bank_code && (
            <span className="font-mono text-xs font-black text-slate-700 dark:text-zinc-300 px-2 py-0.5 rounded bg-slate-200/60 dark:bg-zinc-800 shrink-0">
              {resolved.bank_code}
            </span>
          )}
        </div>

        {/* Teléfono Celular (Copia limpia sin guiones) */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Teléfono Celular
            </span>
            <span className="font-mono font-black text-xs text-slate-950 dark:text-white truncate block">
              {formatPhoneDisplay(resolved.phone || 'N/A')}
            </span>
          </div>
          {cleanPhone && (
            <button
              type="button"
              onClick={() => handleCopy(cleanPhone, 'phone')}
              title="Copiar número para la app bancaria (solo dígitos)"
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0',
                copiedField === 'phone'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-zinc-800 hover:bg-lime-500 hover:text-black text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700'
              )}
            >
              {copiedField === 'phone' ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Documento de Identidad (Cédula o RIF, copia limpia) */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Cédula / RIF
            </span>
            <span className="font-mono font-black text-xs text-slate-950 dark:text-white truncate block">
              {formatDocDisplay(resolved.id_doc || 'N/A')}
            </span>
          </div>
          {cleanIdDoc && (
            <button
              type="button"
              onClick={() => handleCopy(cleanIdDoc, 'id_doc')}
              title="Copiar documento limpio para la app bancaria"
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0',
                copiedField === 'id_doc'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-zinc-800 hover:bg-lime-500 hover:text-black text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700'
              )}
            >
              {copiedField === 'id_doc' ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Titular de la Cuenta */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Titular de la Cuenta
            </span>
            <span className="font-semibold text-xs text-slate-950 dark:text-white truncate block">
              {resolved.beneficiary || 'Comercio'}
            </span>
          </div>
          {resolved.beneficiary && (
            <button
              type="button"
              onClick={() => handleCopy(resolved.beneficiary.trim(), 'beneficiary')}
              className={cn(
                'px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 opacity-80 hover:opacity-100',
                copiedField === 'beneficiary' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
              )}
              title="Copiar titular"
            >
              {copiedField === 'beneficiary' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Monto exacto a transferir en Bolívares (Bs.) */}
      {amountBs !== undefined && amountBs > 0 && (
        <div className="p-3.5 rounded-xl bg-lime-500/10 border border-lime-500/40 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-lime-700 dark:text-lime-400 block">
              Monto Exacto a Transferir
            </span>
            <span className="text-base sm:text-lg font-black font-mono text-slate-950 dark:text-white truncate block">
              Bs. {amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {exchangeRate && exchangeRate > 0 && (
              <span className="text-[10px] text-slate-600 dark:text-zinc-400 font-mono block">
                Tasa BCV oficial: Bs. {exchangeRate.toFixed(4)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleCopy(amountBs.toFixed(2), 'amount')}
            className={cn(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs',
              copiedField === 'amount'
                ? 'bg-emerald-600 text-white'
                : 'bg-lime-500 hover:bg-lime-400 text-black font-extrabold'
            )}
          >
            {copiedField === 'amount' ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Bs.</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
