'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  backdropClassName?: string;
  containerClassName?: string;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
}

export function ModalPortal({
  isOpen,
  onClose,
  children,
  backdropClassName = 'bg-black/70 backdrop-blur-xs',
  containerClassName = 'p-3 sm:p-4 md:p-6',
  closeOnBackdropClick = true,
  closeOnEscape = true,
}: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Bloqueo de scroll en body mientras el modal esté activo
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Manejo de tecla Escape
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain flex items-start sm:items-center justify-center animate-in fade-in duration-150"
    >
      {/* Backdrop de fondo */}
      <div
        className={`fixed inset-0 transition-opacity ${backdropClassName}`}
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* 
        Contenedor hijo seguro: 
        'my-auto' garantiza centrado armónico en viewports amplios
        y alineación superior sin desbordamiento negativo en móviles o con teclado virtual abierto.
      */}
      <div
        className={`relative z-10 w-full flex justify-center my-auto ${containerClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
