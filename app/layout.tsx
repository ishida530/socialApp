import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { GlobalPostComposerSheet } from '@/components/GlobalPostComposerSheet';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { getSiteUrl } from '@/lib/site-url';
import { WebVitalsReporter } from '@/components/WebVitalsReporter';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Panel Postfly',
  description: 'Panel Postfly do planowania i publikacji treści w social media.',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: ['/favicon.ico'],
    apple: ['/apple-icon.png?v=2'],
  },
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
    <html lang="pl" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col ">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <AppShell>{children}</AppShell>
            <GlobalPostComposerSheet />
            <WebVitalsReporter />
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
