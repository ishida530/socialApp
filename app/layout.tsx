import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/auth-context';
import { GlobalPostComposerSheet } from '@/components/GlobalPostComposerSheet';

export const metadata: Metadata = {
  title: 'FlowState Dashboard',
  description: 'FlowState social publishing dashboard',
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
          {children}
          <GlobalPostComposerSheet />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
