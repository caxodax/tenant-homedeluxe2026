import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { StaffManager } from './staff-manager';
import { pool } from '@/lib/db';

export default async function AdminStaffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'staff');

  const pluginsRes = await pool.query(
    `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
    [tenant.id]
  );
  const activePlugins = pluginsRes.rows.map((r: { plugin_id: string }) => r.plugin_id);

  return (
    <StaffManager 
      slug={slug} 
      currentStaffId={staff.id} 
      initialActivePlugins={activePlugins} 
    />
  );
}
