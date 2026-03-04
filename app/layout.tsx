import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/auth-context';
import { GlobalPostComposerSheet } from '@/components/GlobalPostComposerSheet';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Panel Postfly',
  description: 'Panel Postfly do planowania i publikacji treści w social media.',
  openGraph: {
    title: 'Panel Postfly',
    description: 'Panel Postfly do planowania i publikacji treści w social media.',
    siteName: 'Postfly',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className="dark">
      <body className="flex min-h-dvh flex-col overflow-hidden">
        <AuthProvider>
          <div className="min-h-0 flex-1">
            <AppShell>{children}</AppShell>
          </div>
          <footer className="w-full overflow-x-clip border-t border-border bg-card/70">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Regulamin
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Polityka Prywatności
              </Link>
            </div>
          </footer>
          <GlobalPostComposerSheet />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
