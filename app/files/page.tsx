import { Suspense } from 'react';
import { FileCenter } from '@/components/file-center';
import { requirePortalSession } from '@/lib/auth';

export default async function FilesPage() {
  await requirePortalSession('/files');
  return <Suspense fallback={<div className="min-h-screen bg-background" />}><FileCenter /></Suspense>;
}
