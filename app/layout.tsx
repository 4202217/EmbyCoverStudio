import type { Metadata } from 'next';
import type { Viewport } from 'next';
import './globals.css';
import { MobileNav, Sidebar } from '@/components/sidebar';
import { ToastProvider } from '@/components/toast-provider';
import { TokenPrompt } from '@/components/token-prompt';
import pkg from '../package.json';

export const metadata: Metadata = {
  title: 'Emby 封面工坊',
  description: 'Emby 媒体库/合集封面自动生成工具',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Emby 封面工坊'
  }
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#10141e'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar version={pkg.version} />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileNav version={pkg.version} />
              <main className="mx-auto w-full min-w-0 max-w-[1200px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
            </div>
          </div>
          <TokenPrompt />
        </ToastProvider>
      </body>
    </html>
  );
}
