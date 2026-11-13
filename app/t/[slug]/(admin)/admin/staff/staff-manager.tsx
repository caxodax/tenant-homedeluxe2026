'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ROLE_LABELS_ES, ROLE_PERMISSIONS, type StaffRole } from '@/lib/auth/rbac';

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
  has_supabase_link: boolean;
  has_password: boolean;
  created_at: string;
}

const ASSIGNABLE_ROLES: StaffRole[] = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'INVENTORY',
  'DELIVERY',
];

export function StaffManager({
  slug,
  currentStaffId,
}: {
  slug: string;
  currentStaffId: string;
}) {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('CASHIER');
  const [password, setPassword] = useState('');

  // Reset password inline
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/${slug}/staff`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando equipo');
      setStaffList(data.staff || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando personal');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${slug}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          role,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario');
      toast.success(`Usuario ${data.member.full_name} creado con rol ${ROLE_LABELS_ES[role]}`);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole('CASHIER');
      await loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (member: StaffRow, nextRole: StaffRole) => {
    if (nextRole === member.role) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${slug}/staff`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el rol');
      toast.success(`Rol de ${member.full_name} actualizado a ${ROLE_LABELS_ES[nextRole]}`);
      await loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error actualizando rol');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: StaffRow) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${slug}/staff`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, is_active: !member.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar estado');
      toast.success(
        `${member.full_name} ${!member.is_active ? 'activado' : 'desactivado'}`
      );
      await loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar estado');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (id: string) => {
    if (resetPassword.length < 6) {
      toast.error('Mínimo 6 caracteres para la nueva contraseña');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${slug}/staff`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error asignando contraseña');
      toast.success('Contraseña actualizada correctamente');
      setResetId(null);
      setResetPassword('');
      await loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error guardando contraseña');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Equipo y Control de Roles (RBAC)
          </h1>
          <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">
            Administra usuarios del comercio, asigna accesos por rol e inicializa contraseñas para Panel y Caja POS.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={loadStaff}
          disabled={loading}
          className="self-start sm:self-auto bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 font-semibold"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Roles Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {ASSIGNABLE_ROLES.map((r) => (
          <div
            key={r}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 space-y-1"
          >
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--tenant-primary)]">
              {ROLE_LABELS_ES[r]} ({r})
            </p>
            <p className="text-[11px] text-slate-700 dark:text-zinc-300 leading-snug">
              Acceso: {ROLE_PERMISSIONS[r].join(', ')}
            </p>
          </div>
        ))}
      </div>

      {/* Create Staff Form */}
      <form
        onSubmit={handleCreate}
        className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <h2 className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[var(--tenant-primary)]" />
          Nuevo Usuario de Equipo
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
              Nombre Completo *
            </label>
            <Input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: María Pérez"
              className="text-sm bg-slate-50 dark:bg-zinc-900"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
              Correo Electrónico *
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cajero@comercio.com"
              className="text-sm bg-slate-50 dark:bg-zinc-900"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
              Teléfono (opcional)
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+58 412 0000000"
              className="text-sm bg-slate-50 dark:bg-zinc-900"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
              Rol Operativo *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="w-full h-9 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-3 text-sm font-semibold text-slate-950 dark:text-white"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS_ES[r]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 block mb-1">
              Contraseña Inicial *
            </label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mín. 6 caracteres"
              className="text-sm bg-slate-50 dark:bg-zinc-900"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            style={{
              backgroundColor: 'var(--tenant-primary)',
              color: 'var(--tenant-primary-fg)',
            }}
            className="font-bold"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Registrar Usuario
          </Button>
        </div>
      </form>

      {/* Staff List */}
      <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--tenant-primary)]" />
          Personal Registrado ({staffList.length})
        </h2>

        {loading ? (
          <p className="text-sm text-slate-600 dark:text-zinc-400 py-6 text-center">
            Cargando equipo...
          </p>
        ) : (
          <div className="space-y-3">
            {staffList.map((member) => (
              <div
                key={member.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 space-y-3"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-950 dark:text-white">
                        {member.full_name}
                      </span>
                      {member.id === currentStaffId && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30">
                          Sesión actual
                        </span>
                      )}
                      {member.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30">
                          <XCircle className="w-3 h-3" />
                          Inactivo
                        </span>
                      )}
                      {!member.has_password && !member.has_supabase_link && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                          Sin contraseña asignada
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-700 dark:text-zinc-300">
                      {member.email}
                      {member.phone ? ` · ${member.phone}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-slate-500" />
                      <select
                        value={member.role}
                        disabled={saving}
                        onChange={(e) =>
                          handleRoleChange(member, e.target.value as StaffRole)
                        }
                        aria-label={`Rol de ${member.full_name}`}
                        className="h-9 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 text-xs font-bold text-slate-900 dark:text-zinc-100"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS_ES[r]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setResetId((prev) => (prev === member.id ? null : member.id));
                        setResetPassword('');
                      }}
                      className="text-xs font-semibold"
                    >
                      <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                      {member.has_password ? 'Cambiar Clave' : 'Asignar Clave'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => handleToggleActive(member)}
                      className={`text-xs font-semibold ${
                        member.is_active
                          ? 'text-red-700 dark:text-red-300 border-red-300 dark:border-red-900/50'
                          : 'text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-900/50'
                      }`}
                    >
                      {member.is_active ? 'Desactivar' : 'Reactivar'}
                    </Button>
                  </div>
                </div>

                {resetId === member.id && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                    <Input
                      type="password"
                      minLength={6}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="Nueva contraseña (mín. 6 caracteres)"
                      className="max-w-xs text-sm bg-white dark:bg-zinc-950"
                    />
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() => handleResetPassword(member.id)}
                      style={{
                        backgroundColor: 'var(--tenant-primary)',
                        color: 'var(--tenant-primary-fg)',
                      }}
                      className="font-bold"
                    >
                      Guardar Clave
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
