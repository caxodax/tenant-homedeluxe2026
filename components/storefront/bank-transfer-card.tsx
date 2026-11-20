'use client';

import React, { useState } from 'react';
import { Building2, Copy, Check, ShieldCheck, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BankTransferConfig, PaymentFieldDetail } from '@/lib/payment-methods';
import { parseBankTransferFromDetails } from '@/lib/payment-methods';

export interface BankTransferCardProps {
  data?: BankTransferConfig;
  details?: PaymentFieldDetail[];
  currency?: string; // 'VES' | 'USD'
  amountBs?: number | null;
  amountUsd?: number;
  exchangeRate?: number;
  instructions?: string;
  className?: string;
}

export function BankTransferCard({
  data,
  details = [],
  currency = 'USD',
  amountBs,
  amountUsd,
  exchangeRate,
  instructions,
  className = '',
}: BankTransferCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Resolver datos bancarios consolidados
  const resolved: BankTransferConfig =
    data?.bank_name || data?.account_number || data?.id_doc
      ? data
      : parseBankTransferFromDetails(details);

  const isVes = currency === 'VES';
  const cleanAccount = (resolved.account_number || '').replace(/\D/g, '');
  const cleanIdDoc = (resolved.id_doc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Formato visual de cuenta bancaria (0108-0123-45-0100123456)
  const formatAccountDisplay = (acc: string) => {
    const d = acc.replace(/\D/g, '');
    if (d.length === 20) {
      return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 10)}-${d.slice(10)}`;
    }
    return acc;
  };

  // Formato visual para documento (V-12345678 o J-12345678-0)
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
        'p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121214] border-2 border-slate-200 dark:border-zinc-800 text-xs space-y-3.5 shadow-sm transition-all',
        isVes ? 'border-amber-500/30' : 'border-emerald-500/30',
        className
      )}
    >
      {/* Cabecera de la Tarjeta */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
              isVes
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            )}
          >
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-extrabold text-sm text-slate-950 dark:text-white block leading-tight">
              Datos para Transferencia Bancaria
            </span>
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">
              {isVes ? 'Transferencia nacional en Bolívares' : 'Transferencia bancaria en Dólares (USD)'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-[10px] font-mono font-black px-2.5 py-1 rounded-full border shrink-0',
              isVes
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
            )}
          >
            {isVes ? 'VES (Bs.)' : 'USD ($)'}
          </span>
          {resolved.bank_name && (
            <span className="hidden sm:inline-block text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold px-2 py-1 rounded-lg">
              {resolved.bank_name}
            </span>
          )}
        </div>
      </div>

      {/* Bloque Destacado de Monto a Transferir */}
      {isVes && amountBs ? (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-black tracking-wider text-amber-900 dark:text-amber-200">
                Monto Exacto a Transferir en Bolívares
              </span>
              <span className="text-[9px] bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold">
                Tasa BCV
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-950 dark:text-white">
                Bs. {amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {exchangeRate && exchangeRate > 0 && (
                <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                  (1 USD = {exchangeRate.toFixed(2)} Bs.)
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleCopy(amountBs.toFixed(2), 'amount')}
            title="Copiar monto en Bs. para la banca en línea"
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0',
              copiedField === 'amount'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-xs'
            )}
          >
            {copiedField === 'amount' ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>¡Monto Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Monto Bs.</span>
              </>
            )}
          </button>
        </div>
      ) : amountUsd ? (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase font-black tracking-wider text-emerald-900 dark:text-emerald-200 block">
              Monto Exacto a Transferir en Dólares
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-950 dark:text-white mt-0.5 block">
              ${amountUsd.toFixed(2)} USD
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleCopy(amountUsd.toFixed(2), 'amount')}
            title="Copiar monto en USD"
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0',
              copiedField === 'amount'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-xs'
            )}
          >
            {copiedField === 'amount' ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>¡Monto Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Monto $</span>
              </>
            )}
          </button>
        </div>
      ) : null}

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

        {/* Tipo de Cuenta */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Tipo de Cuenta
            </span>
            <span className="font-bold text-xs text-slate-950 dark:text-white truncate block">
              Cuenta {resolved.account_type || 'Corriente'}
            </span>
          </div>
          <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
        </div>

        {/* Número de Cuenta (20 dígitos con copia limpia) */}
        <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Número de Cuenta (20 Dígitos)
            </span>
            <span className="font-mono font-black text-xs sm:text-sm text-slate-950 dark:text-white truncate block tracking-wide">
              {formatAccountDisplay(resolved.account_number || 'N/A')}
            </span>
          </div>
          {cleanAccount && (
            <button
              type="button"
              onClick={() => handleCopy(cleanAccount, 'account')}
              title="Copiar los 20 dígitos seguidos sin guiones"
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0',
                copiedField === 'account'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700'
              )}
            >
              {copiedField === 'account' ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Cuenta</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Documento de Identidad (Cédula o RIF, copia limpia) */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Cédula / RIF del Titular
            </span>
            <span className="font-mono font-black text-xs text-slate-950 dark:text-white truncate block">
              {formatDocDisplay(resolved.id_doc || 'N/A')}
            </span>
          </div>
          {cleanIdDoc && (
            <button
              type="button"
              onClick={() => handleCopy(cleanIdDoc, 'id_doc')}
              title="Copiar documento limpio para la banca en línea"
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0',
                copiedField === 'id_doc'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700'
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

        {/* Titular / Beneficiario */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400 block tracking-wider">
              Titular de la Cuenta
            </span>
            <span className="font-bold text-xs text-slate-950 dark:text-white truncate block">
              {resolved.beneficiary || 'No especificado'}
            </span>
          </div>
          {resolved.beneficiary && (
            <button
              type="button"
              onClick={() => handleCopy(resolved.beneficiary, 'beneficiary')}
              title="Copiar nombre del titular"
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0',
                copiedField === 'beneficiary'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700'
              )}
            >
              {copiedField === 'beneficiary' ? (
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
      </div>

      {/* Instrucciones del Comercio */}
      {instructions && (
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-zinc-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-700 dark:text-zinc-300 leading-relaxed font-medium">
            {instructions}
          </p>
        </div>
      )}
    </div>
  );
}
