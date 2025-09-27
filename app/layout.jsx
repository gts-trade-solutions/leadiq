import './globals.css';
import { Inter } from 'next/font/google';
import { SupabaseProvider } from '@/integrations/supabase/client';
const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'LeadIQ - Sales Intelligence Platform',
  description: 'The future of sales intelligence and lead generation',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-900 text-gray-100 antialiased`}>
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  );
}