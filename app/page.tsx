import { Portal } from '@/components/portal';
import { requirePortalSession } from '@/lib/auth';

export default async function HomePage() {
  await requirePortalSession('/');
  return <Portal />;
}
