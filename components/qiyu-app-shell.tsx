'use client';

import { CircleUserRound, Download, FileCode2, Film, FolderOpen, HardDrive, Home, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ThemeSwitcher } from '@/components/theme-switcher';

type ActiveSection = 'home' | 'files' | 'media' | 'collect' | 'sites';

const navigation: { label: string; href: string; icon: typeof Home; active?: ActiveSection }[] = [
  { label: '总览', href: '/', icon: Home, active: 'home' },
  { label: '文件', href: '/files', icon: FolderOpen, active: 'files' },
  { label: '影音', href: '/media', icon: Film, active: 'media' },
  { label: '采集', href: '/collect', icon: Download, active: 'collect' },
  { label: '网页', href: '/websites', icon: FileCode2, active: 'sites' },
];

export function QiyuAppShell({ active, eyebrow, title, children }: { active: ActiveSection; eyebrow: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ username?: string }> : null)
      .then((payload) => setUsername(payload?.username || ''))
      .catch(() => undefined);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/login');
  }
  const nav = <nav className="mt-9 space-y-1.5">
    {navigation.map((item) => {
      const isActive = item.active === active;
      return <a onClick={() => setOpen(false)} key={item.label} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}><item.icon className="size-4" /><span>{item.label}</span>{isActive ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}</a>;
    })}
  </nav>;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[224px] flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <Brand />
        {nav}
        <div className="mt-auto rounded-xl border border-white/7 bg-white/[0.025] p-3.5 text-xs leading-5 text-muted-foreground"><span className="mb-1.5 flex items-center gap-2 text-primary"><span className="size-1.5 rounded-full bg-primary" />私人空间</span>仅你可通过内网或 Tailscale 访问。</div>
      </aside>
      {open ? <div className="fixed inset-0 z-50 lg:hidden"><button onClick={() => setOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-label="关闭菜单遮罩" /><aside className="relative flex h-full w-[276px] flex-col border-r border-sidebar-border bg-sidebar p-4"><div className="flex items-center justify-between"><Brand /><button onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="关闭菜单"><X className="size-5" /></button></div>{nav}</aside></div> : null}
      <div className="lg:pl-[224px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9"><button onClick={() => setOpen(true)} aria-label="打开菜单" className="rounded-lg border border-border bg-card/65 p-2.5 lg:hidden"><Menu className="size-5" /></button><div><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p><h1 className="mt-0.5 text-base font-medium tracking-[-0.01em]">{title}</h1></div><div className="ml-auto flex items-center gap-1.5"><ThemeSwitcher /><div className="flex items-center gap-2 rounded-lg border border-border bg-card/65 px-2 py-1.5 pr-2.5"><div className="flex size-7 items-center justify-center rounded-md bg-primary/12 text-primary"><CircleUserRound className="size-3.5" /></div><div className="hidden sm:block"><p className="text-xs font-medium">{username || '栖屿用户'}</p></div></div><button onClick={() => void logout()} className="rounded-lg border border-border bg-card/65 p-2 text-muted-foreground transition hover:border-primary/25 hover:bg-muted hover:text-foreground" title="退出登录" aria-label="退出登录"><LogOut className="size-4" /></button></div></header>
        <div className="mx-auto max-w-[1440px] p-4 sm:p-7 lg:p-9">{children}</div>
      </div>
    </main>
  );
}

function Brand() {
  return <a href="/" className="flex items-center gap-3 px-2"><div className="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><HardDrive className="size-[18px]" /></div><div><p className="text-sm font-semibold tracking-[0.12em]">栖屿</p><p className="mt-0.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">YOUR PRIVATE NAS</p></div></a>;
}
