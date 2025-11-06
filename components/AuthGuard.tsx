'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/integrations/supabase/client';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      const { data } = await supabase.auth.getSession();
      const hasSession = !!data.session;

      if (!hasSession) {
        const full = pathname + (search?.toString() ? `?${search.toString()}` : '');
        router.replace(`/auth/signin?next=${encodeURIComponent(full)}`);
        return;
      }
      setChecking(false);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          const full = pathname + (search?.toString() ? `?${search.toString()}` : '');
          router.replace(`/auth/signin?next=${encodeURIComponent(full)}`);
        }
      });
      unsubscribe = sub.subscription.unsubscribe;
    })();

    return () => unsubscribe();
  }, [supabase, router, pathname, search]);

  if (checking) {
    return (
      <div className="min-h-[50vh] grid place-items-center text-gray-400">
        Checking authentication…
      </div>
    );
  }

  return <>{children}</>;
}
