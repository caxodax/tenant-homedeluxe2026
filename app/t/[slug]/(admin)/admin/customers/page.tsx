import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Phone, Mail } from 'lucide-react';

export default async function CustomersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantStaff(slug, 'customers');

  const customers = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    const res = await client.query(`
      SELECT id, name as full_name, phone, email, id_number as identification_number, created_at
      FROM customers
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return res.rows;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Directorio de Clientes
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            {customers.length} clientes registrados en mostrador y vitrina web.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Clientes Registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-zinc-900/50 text-slate-600 dark:text-zinc-400">
                <tr>
                  <th className="text-left text-xs font-medium px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-medium px-4 py-3">Cédula / RIF</th>
                  <th className="text-left text-xs font-medium px-4 py-3">Contacto</th>
                  <th className="text-left text-xs font-medium px-4 py-3">Fecha Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-slate-400 dark:text-zinc-500 text-xs">
                      No hay clientes registrados aún. Se crearán automáticamente con las compras del POS y la Vitrina.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/30">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-400" />
                          <span>{c.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600 dark:text-zinc-400">
                        {c.identification_number || 'No especificado'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-zinc-400">
                        <div className="space-y-0.5">
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-emerald-500" /> {c.phone}
                            </span>
                          )}
                          {c.email && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Mail className="w-3 h-3" /> {c.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                        {new Date(c.created_at).toLocaleDateString('es-VE')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
