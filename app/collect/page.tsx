import { CollectorCenter } from '@/components/collector-center';
import { requirePortalSession } from '@/lib/auth';

export default async function CollectPage() {
  await requirePortalSession('/collect');
  return <CollectorCenter />;
}
