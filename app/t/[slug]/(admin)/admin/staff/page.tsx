import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { StaffManager } from './staff-manager';

export default async function AdminStaffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { staff } = await requireTenantStaff(slug, 'staff');

  return <StaffManager slug={slug} currentStaffId={staff.id} />;
}
