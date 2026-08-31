import { SitesCenter } from '@/components/sites-center';
import { requirePortalSession } from '@/lib/auth';

export default async function WebsitesPage() {
  await requirePortalSession('/websites');
  return <SitesCenter />;
}
