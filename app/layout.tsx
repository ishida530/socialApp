import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/auth-context';
import { GlobalPostComposerSheet } from '@/components/GlobalPostComposerSheet';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Postfly Dashboard',
  description: 'Postfly social publishing dashboard',
  openGraph: {
    title: 'Postfly Dashboard',
    description: 'Postfly social publishing dashboard',
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
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <footer className="border-t border-border bg-card/70">
            <div className="mx-auto flex max-w-7xl items-center justify-center gap-6 px-6 py-4 text-sm text-muted-foreground">
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
