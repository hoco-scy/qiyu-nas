'use client';

import { CloudSun, Leaf, Sunrise } from 'lucide-react';
import { useEffect, useState } from 'react';

export type ThemeName = 'forest' | 'cloud' | 'dawn';

const storageKey = 'qiyu-theme';

const themes: { name: ThemeName; label: string; icon: typeof Leaf; swatch: string }[] = [
  { name: 'forest', label: '深林', icon: Leaf, swatch: 'linear-gradient(135deg, #17332f, #82d4aa)' },
  { name: 'cloud', label: '晴空', icon: CloudSun, swatch: 'linear-gradient(135deg, #eaf5ff, #4385e8)' },
  { name: 'dawn', label: '晨光', icon: Sunrise, swatch: 'linear-gradient(135deg, #fff4df, #ef8064)' },
];

function isTheme(value: string | null): value is ThemeName {
  return value === 'forest' || value === 'cloud' || value === 'dawn';
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'forest');
  localStorage.setItem(storageKey, theme);
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeName>('forest');

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    const current = isTheme(stored) ? stored : 'forest';
    setTheme(current);
    applyTheme(current);
  }, []);

  return <div className="hidden items-center gap-1 rounded-lg border border-border bg-card/65 p-1 sm:flex" aria-label="界面主题">
    <span className="hidden px-1 text-[11px] text-muted-foreground lg:inline">主题</span>
    {themes.map((item) => {
      const Icon = item.icon;
      const selected = item.name === theme;
      return <button key={item.name} onClick={() => { setTheme(item.name); applyTheme(item.name); }} title={`切换到${item.label}主题`} aria-label={`切换到${item.label}主题`} aria-pressed={selected} className={`flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] transition ${selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
        <span className="size-3.5 rounded-full border border-black/10 shadow-sm" style={{ background: item.swatch }} />
        <Icon className="size-3.5" />
        <span className="hidden xl:inline">{item.label}</span>
      </button>;
    })}
  </div>;
}
