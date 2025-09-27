'use client';
import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { useSupabase } from '@/integrations/supabase/client';



export default function WalletBadge() {
const supabase = useSupabase();
const [balance, setBalance] = useState<number>(0);
async function refresh() {
const { data: { user } } = await supabase.auth.getUser();
if (!user) return setBalance(0);
const { data } = await supabase.from('wallet').select('balance').eq('user_id', user.id).single();
setBalance(data?.balance ?? 0);
}
useEffect(() => { refresh(); }, []);
return (
<div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm">
<Coins className="w-4 h-4" /> {balance.toLocaleString()} cr
</div>
);
}