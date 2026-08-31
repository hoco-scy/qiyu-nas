'use client';

import Link from 'next/link';
import { ArrowUpRight, Code2, ExternalLink, FileCode2, Globe2, LoaderCircle, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { QiyuAppShell } from '@/components/qiyu-app-shell';

type SiteEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  modifiedAt: string;
};

type SitesPayload = { sites: SiteEntry[]; error?: string };

function siteUrl(name: string) {
  return `/sites/${encodeURIComponent(name)}/`;
}

export function SitesCenter() {
  const [payload, setPayload] = useState<SitesPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch('/api/sites', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as SitesPayload;
        if (!response.ok) throw new Error(data.error || '读取网页目录失败');
        if (active) setPayload(data);
      })
      .catch((error: unknown) => {
        if (active) setPayload({ sites: [], error: error instanceof Error ? error.message : '读取网页目录失败' });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const sites = useMemo(() => payload?.sites || [], [payload]);

  return <QiyuAppShell active="sites" eyebrow="栖屿网页" title="网页发布">
    <div className="space-y-7">
      <section className="flex flex-col gap-4 border-b border-white/7 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-primary">静态网页空间</p>
          <h2 className="mt-1.5 text-3xl font-medium tracking-[-0.045em]">把站点，也收进同一个入口。</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">每个文件夹就是一个站点；放入 index.html 后，即可从这里直接打开。</p>
        </div>
        <Link href="/files?path=sites" className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/85">
          <Upload className="size-4" />管理网页文件
        </Link>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">站点</p>
            <p className="mt-1 text-xs text-muted-foreground">点击卡片，直接打开首页。</p>
          </div>
          {!loading && <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-muted-foreground">{sites.length} 个站点</span>}
        </div>

        {loading ? <div className="flex min-h-44 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.025] text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />正在读取站点…</div>
          : payload?.error ? <EmptyState title="暂时无法读取网页目录" text={payload.error} />
            : sites.length === 0 ? <EmptyState title="还没有可访问的网站" text="在网页发布目录新建一个文件夹，放入 index.html 后，它会自动出现在这里。" />
              : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sites.map((site) => <Link key={site.path} href={siteUrl(site.name)} className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.055]">
                  <div className="flex items-start justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Globe2 className="size-5" /></div>
                    <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                  </div>
                  <h3 className="mt-7 truncate text-lg font-medium">{site.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">最近更新于 {site.modifiedAt}</p>
                  <div className="mt-5 flex items-center gap-1.5 text-sm text-primary">打开网站 <ExternalLink className="size-3.5" /></div>
                </Link>)}
              </div>}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Guide icon={FileCode2} title="建立一个目录" text="在 sites 下新建文件夹，例如 home。" />
        <Guide icon={Upload} title="放入首页文件" text="上传 index.html、CSS、图片等资源。" />
        <Guide icon={Code2} title="从这里直接打开" text="无需配置地址，刷新后即可访问。" />
      </section>
    </div>
  </QiyuAppShell>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.018] px-6 text-center">
    <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.04] text-primary"><Globe2 className="size-5" /></div>
    <h3 className="mt-4 text-sm font-medium">{title}</h3>
    <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">{text}</p>
    <Link href="/files?path=sites" className="mt-4 text-sm text-primary hover:underline">管理网页文件</Link>
  </div>;
}

function Guide({ icon: Icon, title, text }: { icon: typeof FileCode2; title: string; text: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.025] p-5">
    <Icon className="size-5 text-primary" />
    <h3 className="mt-5 text-sm font-medium">{title}</h3>
    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
  </div>;
}
