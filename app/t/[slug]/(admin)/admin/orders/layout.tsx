import { requireTenantStaff } from '@/lib/auth/tenant-guard';

export default async function OrdersGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTenantStaff(slug, 'orders');
  return <>{children}</>;
}
