import { notFound } from 'next/navigation';
import { getCachedTenantShell } from '@/lib/tenant';
import { CartView } from './cart-view';

export const revalidate = 120;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default async function CartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shell = await getCachedTenantShell(slug);
  if (!shell) notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
      <CartView
        slug={slug}
        pickupAddress={shell.settings.address || 'Dirección física de mostrador'}
      />
    </div>
  );
}
