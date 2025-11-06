import { SupabaseProvider } from '@/integrations/supabase/client';
import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Lead Sentra',
  description: 'Lead Sentra',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}><SupabaseProvider>{children}</SupabaseProvider></body>
    </html>
  );
}
