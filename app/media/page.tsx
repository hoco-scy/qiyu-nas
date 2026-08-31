import { MediaFront } from '@/components/media-front';
import { requirePortalSession } from '@/lib/auth';

export default async function MediaPage() {
  await requirePortalSession('/media');
  return <MediaFront />;
}
