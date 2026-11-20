'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  Check,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModalPortal } from '@/components/ui/modal-portal';
import {
  ROLE_LABELS_ES,
  ROLE_PERMISSIONS,
  getAvailableRoles,
  getAvailablePermissions,
  type StaffRole,
  type TenantPermission,
} from '@/lib/auth/rbac';

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
  has_supabase_link: boolean;
  has_password: boolean;
  custom_permissions?: string[] | null;
  created_at: string;
}

export function StaffManager({
  slug,
  currentStaffId,
  initialActivePlugins = [],
}: {
  slug: string;
  currentStaffId: string;
  initialActivePlugins?: string[];
}) {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [activePlugins, setActivePlugins] = useState<string[]>(initialActivePlugins);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [permissionsModalMember, setPermissionsModalMember] = useState<StaffRow | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);

  // Formulario de creación
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('CASHIER');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    ROLE_PERMISSIONS.CASHIER || []
  );

  // Filtros y Paginación
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  // Reset password inline
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  // Roles y Permisos disponibles condicionados a los plugins activos
  const assignableRoles = useMemo(() => getAvailableRoles(activePlugins), [activePlugins]);
  const availablePermissions = useMemo(() => getAvailablePermissions(activePlugins), [activePlugins]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/${slug}/staff`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando equipo');
      setStaffList(data.staff || []);
      if (Array.isArray(data.active_plugins)) {
        setActivePlugins(data.active_plugins);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando personal');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Al cambiar de rol en el modal de creación, sugerir los permisos de ese rol
  const handleRoleSelection = (nextRole: StaffRole) => {
    setRole(nextRole);
    const defaults = ROLE_PERMISSIONS[nextRole] || [];
    setSelectedPermissions(defaults);
  };

  const handleTogglePermission = (permId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleToggleEditingPermission = (permId: string) => {
    setEditingPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('La contraseña debe tener mínimo 6 caracteres');
      return;
    }
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
          custom_permissions: selectedPermissions.length > 0 ? selectedPermissions : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario');

      toast.success(`Usuario ${data.member.full_name} registrado exitosamente`);
      setIsCreateModalOpen(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole('CASHIER');
      setSelectedPermissions(ROLE_PERMISSIONS.CASHIER || []);
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

  const handleSaveMemberPermissions = async () => {
    if (!permissionsModalMember) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${slug}/staff`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: permissionsModalMember.id,
          custom_permissions: editingPermissions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron actualizar los permisos');
      toast.success(`Permisos de ${permissionsModalMember.full_name} actualizados`);
      setPermissionsModalMember(null);
      await loadStaff();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error guardando permisos');
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
      toast.success(`${member.full_name} ${!member.is_active ? 'activado' : 'desactivado'}`);
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

  // Filtrado reactivo en memoria
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffList.filter((m) => {
      if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.full_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q)) ||
        ROLE_LABELS_ES[m.role]?.toLowerCase().includes(q)
      );
    });
  }, [staffList, search, roleFilter]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedStaff = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStaff.slice(start, start + PAGE_SIZE);
  }, [filteredStaff, currentPage]);

  return (
    <div className="space-y-6">
      {/* Cabecera Principal y Acción Destacada */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-950 dark:text-white tracking-tight">
            Equipo y Control de Roles (RBAC)
          </h1>
          <p className="text-sm text-stone-600 dark:text-zinc-400 mt-1">
            Administra los usuarios del comercio, asigna roles operativos y personaliza los módulos visibles por miembro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadStaff}
            disabled={loading}
            className="h-9 px-3 bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 font-semibold"
            title="Recargar listado"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setFullName('');
              setEmail('');
              setPhone('');
              setPassword('');
              setRole('CASHIER');
              setSelectedPermissions(ROLE_PERMISSIONS.CASHIER || []);
              setIsCreateModalOpen(true);
            }}
            className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Usuario</span>
          </Button>
        </div>
      </div>

      {/* Tarjetas Informativas de Roles (Filtradas según plugins activos) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {assignableRoles.map((r) => (
          <div
            key={r}
            className="p-3 rounded-2xl bg-white dark:bg-[#141416] border border-stone-200/80 dark:border-zinc-800/80 space-y-1 shadow-2xs"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-stone-900 dark:text-zinc-100 truncate">
              {ROLE_LABELS_ES[r]}
            </p>
            <p className="text-[10px] text-stone-500 dark:text-zinc-400 truncate">
              {ROLE_PERMISSIONS[r]?.length || 0} módulos base
            </p>
          </div>
        ))}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="p-3.5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Buscar por nombre, correo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 h-9 text-xs bg-stone-50 dark:bg-zinc-900"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-stone-900 dark:text-zinc-100 focus:outline-none"
          >
            <option value="ALL">Todos los Roles ({staffList.length})</option>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS_ES[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Personal Registrado */}
      <div className="bg-white dark:bg-[#141416] border border-stone-200/80 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-stone-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Personal Registrado ({filteredStaff.length})</span>
          </h2>
          {totalPages > 1 && (
            <span className="text-xs text-stone-500 font-medium">
              Página {currentPage} de {totalPages}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-stone-500 py-10 text-center">Cargando equipo...</p>
        ) : paginatedStaff.length === 0 ? (
          <div className="py-12 text-center text-stone-500 space-y-1">
            <p className="text-sm font-bold">No se encontraron usuarios</p>
            <p className="text-xs">Prueba ajustando la búsqueda o los filtros.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {paginatedStaff.map((member) => {
              const isCustom = Array.isArray(member.custom_permissions) && member.custom_permissions.length > 0;
              const permsCount = member.role === 'OWNER' 
                ? 'Acceso Total' 
                : isCustom 
                  ? `${member.custom_permissions?.length} módulos (Personalizado)`
                  : `${ROLE_PERMISSIONS[member.role]?.length || 0} módulos (Por rol)`;

              return (
                <div
                  key={member.id}
                  className="p-3.5 rounded-xl border border-stone-200/80 dark:border-zinc-800/80 bg-stone-50/50 dark:bg-zinc-900/40 space-y-3 transition hover:border-stone-300 dark:hover:border-zinc-700"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-stone-950 dark:text-white truncate">
                          {member.full_name}
                        </span>
                        {member.id === currentStaffId && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            Tú
                          </span>
                        )}
                        {member.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <XCircle className="w-3 h-3" />
                            Inactivo
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          member.role === 'OWNER'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300'
                            : isCustom
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}>
                          {permsCount}
                        </span>
                        {!member.has_password && !member.has_supabase_link && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Sin clave
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-stone-600 dark:text-zinc-400">
                        {member.email}
                        {member.phone ? ` · ${member.phone}` : ''}
                      </p>
                    </div>

                    {/* Acciones del Usuario (Barra Simétrica y Compacta) */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {/* Selector de Rol Operativo */}
                      <div className="flex items-center gap-1">
                        <select
                          value={member.role}
                          disabled={saving || member.role === 'OWNER'}
                          onChange={(e) => handleRoleChange(member, e.target.value as StaffRole)}
                          className="h-8 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 text-xs font-bold text-stone-900 dark:text-zinc-100 focus:outline-none disabled:opacity-60"
                        >
                          {assignableRoles.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS_ES[r]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Botón Permisos Modulares */}
                      {member.role !== 'OWNER' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPermissionsModalMember(member);
                            setEditingPermissions(
                              member.custom_permissions && member.custom_permissions.length > 0
                                ? member.custom_permissions
                                : ROLE_PERMISSIONS[member.role] || []
                            );
                          }}
                          className="h-8 px-2.5 text-xs font-bold text-stone-700 dark:text-zinc-300 hover:text-stone-950 dark:hover:text-white gap-1"
                          title="Personalizar qué módulos puede ver"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Módulos</span>
                        </Button>
                      )}

                      {/* Botón Clave */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => {
                          setResetId((prev) => (prev === member.id ? null : member.id));
                          setResetPassword('');
                        }}
                        className="h-8 px-2.5 text-xs font-semibold"
                        title={member.has_password ? 'Cambiar contraseña' : 'Crear contraseña'}
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1 text-stone-500" />
                        <span>{member.has_password ? 'Clave' : 'Asignar'}</span>
                      </Button>

                      {/* Botón Activar / Desactivar */}
                      {member.role !== 'OWNER' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => handleToggleActive(member)}
                          className={`h-8 px-2.5 text-xs font-semibold ${
                            member.is_active
                              ? 'text-rose-600 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                              : 'text-emerald-600 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          }`}
                        >
                          {member.is_active ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Reset inline de contraseña */}
                  {resetId === member.id && (
                    <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-stone-200/80 dark:border-zinc-800 animate-in fade-in">
                      <Input
                        type="password"
                        minLength={6}
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        placeholder="Nueva contraseña (mín. 6 caracteres)"
                        className="max-w-xs h-8 text-xs bg-white dark:bg-zinc-950"
                      />
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() => handleResetPassword(member.id)}
                        className="h-8 px-3 bg-stone-900 hover:bg-stone-800 dark:bg-white dark:text-stone-900 text-white font-bold text-xs"
                      >
                        Guardar Clave
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setResetId(null)}
                        className="h-8 px-2 text-xs text-stone-500"
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Paginador Simétrico & Compacto */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-stone-200/80 dark:border-zinc-800">
            <span className="text-xs text-stone-500">
              Mostrando {paginatedStaff.length} de {filteredStaff.length} miembros
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="w-8 h-8 p-0"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <span className="px-2.5 text-xs font-mono font-bold text-stone-800 dark:text-zinc-200">
                {currentPage} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="w-8 h-8 p-0"
                title="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal 1: Registrar Nuevo Miembro con Permisos Modulares */}
      <ModalPortal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}>
        <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-stone-950 dark:text-white">
                  Registrar Nuevo Miembro
                </h3>
                <p className="text-xs text-stone-500">
                  Crea credenciales y configura los módulos visibles.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-stone-800 dark:text-zinc-200 block mb-1">
                  Nombre Completo *
                </label>
                <Input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Carlos Silva"
                  className="text-xs h-9 bg-stone-50 dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 dark:text-zinc-200 block mb-1">
                  Correo Electrónico *
                </label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carlos@comercio.com"
                  className="text-xs h-9 bg-stone-50 dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 dark:text-zinc-200 block mb-1">
                  Teléfono / WhatsApp (opcional)
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+58 412 0000000"
                  className="text-xs h-9 bg-stone-50 dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 dark:text-zinc-200 block mb-1">
                  Rol Operativo Base *
                </label>
                <select
                  value={role}
                  onChange={(e) => handleRoleSelection(e.target.value as StaffRole)}
                  className="w-full h-9 rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900 px-3 text-xs font-semibold text-stone-950 dark:text-white focus:outline-none"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS_ES[r]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-stone-800 dark:text-zinc-200 block mb-1">
                  Contraseña Inicial *
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="text-xs h-9 pr-9 bg-stone-50 dark:bg-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Matriz de Permisos Modulares */}
            <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold uppercase tracking-wider text-stone-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Módulos y Accesos Permitidos</span>
                </label>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedPermissions.length} activos
                </span>
              </div>
              <p className="text-[11px] text-stone-500">
                Selecciona qué secciones del sistema podrá abrir este colaborador:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1">
                {availablePermissions.map((perm) => {
                  const isChecked = selectedPermissions.includes(perm.id);
                  return (
                    <button
                      key={perm.id}
                      type="button"
                      onClick={() => handleTogglePermission(perm.id)}
                      className={`p-2.5 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                        isChecked
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100'
                          : 'border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 hover:bg-stone-50'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 mt-0.5 rounded-md flex items-center justify-center shrink-0 border transition ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-stone-300 dark:border-zinc-600'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold leading-tight truncate">{perm.label}</p>
                        <p className="text-[10px] opacity-75 truncate">{perm.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-xs text-stone-500"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4"
              >
                {saving ? 'Guardando...' : 'Crear Usuario'}
              </Button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* Modal 2: Editar Permisos de Miembro Existente */}
      <ModalPortal
        isOpen={Boolean(permissionsModalMember)}
        onClose={() => setPermissionsModalMember(null)}
      >
        <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-stone-950 dark:text-white">
                  Permisos de {permissionsModalMember?.full_name}
                </h3>
                <p className="text-xs text-stone-500">
                  Rol base: <strong>{ROLE_LABELS_ES[permissionsModalMember?.role || 'CASHIER']}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPermissionsModalMember(null)}
              className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-stone-800 dark:text-zinc-200">
                Módulos activos: {editingPermissions.length} de {availablePermissions.length}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (permissionsModalMember) {
                    setEditingPermissions(ROLE_PERMISSIONS[permissionsModalMember.role] || []);
                  }
                }}
                className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
              >
                Restablecer por defecto del rol
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
              {availablePermissions.map((perm) => {
                const isChecked = editingPermissions.includes(perm.id);
                return (
                  <button
                    key={perm.id}
                    type="button"
                    onClick={() => handleToggleEditingPermission(perm.id)}
                    className={`p-2.5 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                      isChecked
                        ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100'
                        : 'border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 hover:bg-stone-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 rounded-md flex items-center justify-center shrink-0 border transition ${
                        isChecked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-stone-300 dark:border-zinc-600'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold leading-tight truncate">{perm.label}</p>
                      <p className="text-[10px] opacity-75 truncate">{perm.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPermissionsModalMember(null)}
              className="text-xs text-stone-500"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={handleSaveMemberPermissions}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4"
            >
              {saving ? 'Guardando...' : 'Guardar Permisos'}
            </Button>
          </div>
        </div>
      </ModalPortal>
    </div>
  );
}
