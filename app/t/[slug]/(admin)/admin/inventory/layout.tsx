import { requireTenantStaff } from '@/lib/auth/tenant-guard';

export default async function InventoryGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTenantStaff(slug, 'inventory');
  return <>{children}</>;
}
