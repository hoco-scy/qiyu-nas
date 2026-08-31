'use client';

import { HardDrive, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || '登录没有完成');
      const requested = searchParams.get('next') || '/';
      const target = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
      window.location.assign(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录没有完成');
      setSubmitting(false);
    }
  }

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-12 text-foreground">
    <div className="login-glow pointer-events-none absolute inset-0" />
    <section className="relative w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-7 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-9">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><HardDrive className="size-6" /></div>
      <p className="mt-7 text-xs font-medium uppercase tracking-[0.24em] text-primary">Qiyu Private NAS</p>
      <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">欢迎回到栖屿</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">登录一次，文件、影音、采集和网页管理都在这里。</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm"><span className="mb-2 block text-muted-foreground">账号</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required className="w-full rounded-xl border border-border bg-background/65 px-3.5 py-3 outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15" placeholder="NAS 用户名" /></label>
        <label className="block text-sm"><span className="mb-2 block text-muted-foreground">密码</span><input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required type="password" className="w-full rounded-xl border border-border bg-background/65 px-3.5 py-3 outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15" placeholder="NAS 密码" /></label>
        {error ? <p className="rounded-xl border border-red-300/15 bg-red-300/[0.07] px-3 py-2.5 text-sm text-red-100">{error}</p> : null}
        <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-70">{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}{submitting ? '正在登录…' : '进入栖屿'}</button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">账号与现有 NAS / Jellyfin 服务凭据一致。</p>
    </section>
  </main>;
}
