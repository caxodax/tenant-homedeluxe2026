import { requireTenantStaff } from '@/lib/auth/tenant-guard';

export default async function SettingsGuardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTenantStaff(slug, 'settings');
  return <>{children}</>;
}
