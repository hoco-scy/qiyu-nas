import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:8080'),
  title: '栖屿 NAS · 私人数字空间',
  description: '统一进入个人文件、家庭影片与自建网页的本地 NAS 门户。',
  openGraph: {
    title: '栖屿 NAS · 私人数字空间',
    description: '文件、影音和自建网页，都回到自己的空间。',
    images: [{ url: '/qiyu-media-hero.png', width: 1717, height: 916, alt: '栖屿 NAS 私人影音空间' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '栖屿 NAS · 私人数字空间',
    description: '文件、影音和自建网页，都回到自己的空间。',
    images: ['/qiyu-media-hero.png'],
  },
};

const themeBootScript = `(() => { try { const theme = localStorage.getItem('qiyu-theme'); if (theme === 'forest' || theme === 'cloud' || theme === 'dawn') { document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle('dark', theme === 'forest'); } } catch {} })();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark" data-theme="forest" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
