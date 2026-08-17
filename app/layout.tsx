import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
import { ToastProvider } from '@/components/toast-provider';
import { TokenPrompt } from '@/components/token-prompt';
import pkg from '../package.json';

export const metadata: Metadata = {
  title: 'Emby 封面工坊',
  description: 'Emby 媒体库/合集封面自动生成工具'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar version={pkg.version} />
            <main className="mx-auto w-full min-w-0 max-w-[1160px] flex-1 p-8">{children}</main>
          </div>
          <TokenPrompt />
        </ToastProvider>
      </body>
    </html>
  );
}
