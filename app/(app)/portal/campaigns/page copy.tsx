// app/campaigns/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import SectionHeader from '@/components/SectionHeader';
import Table from '@/components/Table';
import StatCard from '@/components/StatCard';
import WalletBadge from '@/components/WalletBadge';
import { useSupabase } from '@/integrations/supabase/client';

import {
  getMySender,
  startEmailVerify,
  checkEmailStatus,
  changesLeft,
  type EmailIdentityRow,
} from '@/lib/sender';

import { getWalletBalance } from '@/lib/wallet';

import { mockCampaigns } from '@/lib/mock';
import { formatNumber } from '@/lib/utils.js';

import {
  Plus,
  Filter,
  Mail,
  TrendingUp,
  Info,
  Upload,
  CalendarClock,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';

const CHANGE_LIMIT = 2;

export default function CampaignsPage() {
  const supabase = useSupabase();

  // ===== page state =====
  const [showModal, setShowModal] = useState(false);

  // create campaign (demo)
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  // sender (one per user)
  const [fromEmail, setFromEmail] = useState('');
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [verStatus, setVerStatus] = useState<'idle' | 'pending' | 'verified' | 'failed' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<null | { kind: 'success' | 'error' | 'info' | 'warn'; msg: string }>(null);
  const [mySender, setMySender] = useState<EmailIdentityRow | null>(null);
  const [editingSender, setEditingSender] = useState(false); // hide verify UI when verified unless user clicks “Change”

  // wallet + test send
  const [walletBalance, setWalletBalance] = useState(0);
  const [testTo, setTestTo] = useState('');

  // recipients (demo)
  const [recipientSource, setRecipientSource] = useState<'mine' | 'customer'>('mine');
  const [sendType, setSendType] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  // table mock
  const headers = ['Campaign Name', 'Status', 'Sent', 'Opened', 'Clicked', 'Replies'];
  const tableData = mockCampaigns.map((c) => ({
    name: c.name,
    status: (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          c.status === 'Active' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-yellow-600/20 text-yellow-400'
        }`}
      >
        {c.status}
      </span>
    ),
    sent: formatNumber(c.sent),
    opened: formatNumber(c.opened),
    clicked: formatNumber(c.clicked),
    replies: formatNumber(c.replies),
  }));

  // totals
  const totalSent = mockCampaigns.reduce((sum, c) => sum + c.sent, 0);
  const totalOpened = mockCampaigns.reduce((sum, c) => sum + c.opened, 0);
  const totalClicked = mockCampaigns.reduce((sum, c) => sum + c.clicked, 0);

  // ===== derived & helpers =====
  const latestStatus: 'idle' | 'pending' | 'verified' | 'failed' | 'error' =
    verStatus !== 'idle' ? verStatus : (mySender?.status ?? 'idle');
  const isVerified = latestStatus === 'verified';
  const left = changesLeft(mySender, CHANGE_LIMIT);
  const showStatusRow = editingSender || !mySender || mySender.status !== 'verified';

  async function refreshMySender(prefill = false) {
    try {
      const row = await getMySender(supabase);
      setMySender(row);
      if (prefill && row?.email) setFromEmail(row.email);
      if (row?.status) setVerStatus(row.status as any);
    } catch { /* noop */ }
  }
  async function refreshWallet() {
    try {
      const bal = await getWalletBalance(supabase);
      setWalletBalance(bal);
    } catch { /* noop */ }
  }

  useEffect(() => { refreshMySender(true); }, []);
  useEffect(() => { setEditingSender(!isVerified); }, [isVerified]);
  useEffect(() => {
    if (showModal) {
      refreshMySender();
      refreshWallet();
    }
  }, [showModal]);

  // ===== verification actions =====
  async function handleStartVerify() {
    if (!fromEmail) return;

    const currentEmail = mySender?.email?.trim().toLowerCase();
    const targetEmail = fromEmail.trim().toLowerCase();
    const isNew = !currentEmail || currentEmail !== targetEmail;

    if (isNew && left === 0) {
      setBanner({ kind: 'error', msg: 'Change limit reached (2/2). Contact support to reset.' });
      return;
    }
    if (mySender && isNew) {
      const ok = confirm(`Replace your current sender:\n${mySender.email}\n→ ${fromEmail}?`);
      if (!ok) return;
    }

    setBusy(true);
    setBanner(null);
    try {
      const resp = await startEmailVerify(supabase, fromEmail); // server enforces limit + one-row-per-user
      setIdentityId(resp?.id ?? null);
      setVerStatus('pending');
      await refreshMySender(); // updates left count if it changed server-side
      setBanner({ kind: 'success', msg: 'Verification email sent. Please check your inbox and click the link to confirm.' });
    } catch (e: any) {
      const msg = e?.json?.error || e?.message || 'Could not start verification. Please try again later.';
      setVerStatus('error');
      setBanner({ kind: 'error', msg });
    } finally {
      setBusy(false);
    }
  }

  async function pollVerification() {
    if (!fromEmail && !identityId) return;
    setBusy(true);
    try {
      const args = identityId ? { identityId } : { email: fromEmail };
      const resp = await checkEmailStatus(supabase, args);
      setVerStatus(resp.status);
      if (resp.status === 'verified') {
        setBanner({ kind: 'success', msg: 'Sender verified! You can send from this address now.' });
        await refreshMySender();
        setEditingSender(false);
      } else if (resp.status === 'pending') {
        setBanner({ kind: 'info', msg: 'Still pending — please complete the verification from your inbox.' });
      } else if (resp.status === 'failed') {
        setBanner({ kind: 'error', msg: 'Verification failed. Please try again later.' });
      }
    } catch {
      setBanner({ kind: 'error', msg: 'Could not fetch status. Please try again later.' });
    } finally {
      setBusy(false);
    }
  }

  // ===== test send (costs 1 credit) =====
  async function sendTestEmail() {
    if (!testTo) return;
    setBusy(true);
    setBanner(null);
    try {
      // Use supabase.functions.invoke (auto handles Authorization header)
      const { data, error } = await supabase.functions.invoke('email-send-test', {
        body: { to: testTo },
      });
      if (error) {
        const status = (error as any)?.status ?? 500;
        if (status === 402) {
          setBanner({ kind: 'warn', msg: 'Not enough credits. Please top up.' });
        } else {
          setBanner({ kind: 'error', msg: (error as any)?.message || 'Test send failed.' });
        }
        return;
      }
      setBanner({ kind: 'success', msg: 'Test email sent!' });
      setTestTo('');
      await refreshWallet();
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Test send failed.' });
    } finally {
      setBusy(false);
    }
  }


  
  return (
    <AuthGuard>
      <div className="space-y-6">
        <SectionHeader
          title="Email Campaigns"
          description="Create, manage, and track your email marketing campaigns"
        >
          <WalletBadge />
          <button
            onClick={() => alert('Campaign filters functionality')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        </SectionHeader>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Campaigns"
            value={mockCampaigns.filter((c) => c.status === 'Active').length.toString()}
            icon={Mail}
          />
          <StatCard title="Total Sent" value={formatNumber(totalSent)} icon={Mail} />
          <StatCard
            title="Overall Open Rate"
            value={`${((totalOpened / Math.max(1, totalSent)) * 100).toFixed(1)}%`}
            icon={TrendingUp}
          />
          <StatCard
            title="Overall Click Rate"
            value={`${((totalClicked / Math.max(1, totalSent)) * 100).toFixed(1)}%`}
            icon={TrendingUp}
          />
        </div>

        <Table headers={headers} data={tableData} actions />

        {/* Create Campaign Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-4xl">
              {/* header */}
              <div className="p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10 rounded-t-2xl">
                <h2 className="text-xl font-semibold text-white">Create New Campaign</h2>
                <p className="text-gray-400 mt-1">Set up your email campaign</p>
              </div>

              {/* content */}
              <div className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
                {/* Sender */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-medium text-white">Sender</h3>
                    <Info className="w-4 h-4 text-gray-400" />
                  </div>

                  {banner && (
                    <div
                      className={`mb-4 p-3 rounded border text-sm ${
                        banner.kind === 'success'
                          ? 'border-emerald-600 bg-emerald-900/20 text-emerald-200'
                          : banner.kind === 'error'
                          ? 'border-red-600 bg-red-900/20 text-red-200'
                          : banner.kind === 'warn'
                          ? 'border-amber-600 bg-amber-900/20 text-amber-200'
                          : 'border-sky-600 bg-sky-900/20 text-sky-200'
                      }`}
                    >
                      {banner.msg}
                    </div>
                  )}

                  {mySender && (
                    <div className="mb-3 p-3 border border-gray-700 rounded-lg bg-gray-900/40">
                      <p className="text-xs text-gray-400 mb-1">Your sender</p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="text-sm text-white break-all">{mySender.email}</p>
                          {mySender.status !== 'verified' && (
                            <p className="text-xs text-amber-300">{mySender.status}</p>
                          )}
                        </div>

                        {isVerified ? (
                          <button
                            type="button"
                            onClick={() => { if (left > 0) { setEditingSender(true); setFromEmail(mySender.email); } }}
                            disabled={left === 0}
                            title={left === 0 ? 'Change limit reached (2/2 used)' : 'Change your sender'}
                            className={`px-2.5 py-1.5 text-xs rounded-md border self-start sm:self-auto ${
                              left === 0
                                ? 'border-gray-700 bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'border-gray-700 bg-gray-800 text-gray-200 hover:border-gray-600'
                            }`}
                          >
                            Change sender ({left} left)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={pollVerification}
                            disabled={busy}
                            className="px-2.5 py-1.5 text-xs rounded-md border border-gray-700 bg-gray-800 text-gray-200 hover:border-gray-600 self-start sm:self-auto flex items-center gap-1"
                          >
                            <RefreshCcw className="w-3.5 h-3.5" />
                            Check status
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Verify controls (only visible when creating/changing) */}
                  {editingSender && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            {isVerified ? 'New sender email' : 'From (sender email)'}
                          </label>
                          <input
                            type="email"
                            placeholder="you@company.com"
                            value={fromEmail}
                            onChange={(e) => setFromEmail(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none"
                          />
                          {mySender && (
                            <p className="text-xs text-gray-400">
                              You can change your sender <strong>{left}</strong> more {left === 1 ? 'time' : 'times'} (max {CHANGE_LIMIT}).
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={
                            !fromEmail ||
                            busy ||
                            (mySender &&
                              left === 0 &&
                              fromEmail.trim().toLowerCase() !== (mySender.email ?? '').trim().toLowerCase())
                          }
                          onClick={handleStartVerify}
                          className="h-[42px] px-4 md:px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500 rounded-lg text-white"
                        >
                          {busy ? 'Working…' : isVerified ? 'Send verification to new email' : 'Verify'}
                        </button>

                        <button
                          type="button"
                          disabled={busy || latestStatus === 'idle'}
                          onClick={pollVerification}
                          className="h-[42px] px-4 md:px-6 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 rounded-lg text-gray-200 flex items-center gap-1"
                        >
                          <RefreshCcw className="w-4 h-4" />
                          Check status
                        </button>
                      </div>

                      {/* Status is ONLY visible while creating/changing */}
                      {showStatusRow && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <span className="text-gray-400">Status:</span>
                          <span
                            className={`${
                              latestStatus === 'verified'
                                ? 'text-emerald-400'
                                : latestStatus === 'failed' || latestStatus === 'error'
                                ? 'text-red-400'
                                : latestStatus === 'pending'
                                ? 'text-amber-300'
                                : 'text-gray-400'
                            }`}
                          >
                            {latestStatus}
                          </span>
                          {latestStatus === 'verified' && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                        </div>
                      )}

                      <p className="text-xs text-gray-400 mt-1">
                        After you click <em>Verify</em>, we’ll email a confirmation link to this address. Open that email and complete the verification.
                      </p>
                    </>
                  )}

                  {/* Send Test (only when verified) */}
                  {isVerified && (
                    <div className="mt-4 p-4 border border-gray-700 rounded-xl bg-gray-900/40">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-white font-medium">Send a test email</h4>
                        <span className="text-xs text-gray-400">
                          Balance: <strong className="text-white">{walletBalance}</strong> cr
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">Test recipient</label>
                          <input
                            type="email"
                            placeholder="recipient@example.com"
                            value={testTo}
                            onChange={(e) => setTestTo(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none"
                          />
                          <p className="text-xs text-gray-500">Costs 1 credit.</p>
                        </div>
                        <button
                          type="button"
                          disabled={!testTo || walletBalance < 1 || busy}
                          onClick={sendTestEmail}
                          className="h-[42px] px-4 md:px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500 rounded-lg text-white"
                        >
                          Send test (1 cr)
                        </button>
                      </div>
                      {walletBalance < 1 && (
                        <p className="text-xs text-amber-300 mt-2">You don’t have enough credits to send a test.</p>
                      )}
                    </div>
                  )}
                </section>

                {/* Campaign Details */}
                <section>
                  <h3 className="text-lg font-medium text-white mb-4">Campaign Details</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Campaign Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Q1 Product Launch"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Subject Line</label>
                      <input
                        type="text"
                        placeholder="Enter email subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Email Content</label>
                      <textarea
                        rows={6}
                        placeholder="Enter your email content here..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:border-gray-600 transition-colors resize-none"
                      />
                    </div>
                  </div>
                </section>

                {/* Recipients */}
                <section>
                  <h3 className="text-lg font-medium text-white mb-4">Recipients</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <div className="inline-flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                        <button
                          onClick={() => setRecipientSource('mine')}
                          className={`px-3 py-1.5 rounded-md text-sm ${
                            recipientSource === 'mine' ? 'bg-emerald-600 text-white' : 'text-gray-300'
                          }`}
                        >
                          Use my contact lists
                        </button>
                        <button
                          onClick={() => setRecipientSource('customer')}
                          className={`px-3 py-1.5 rounded-md text-sm ${
                            recipientSource === 'customer' ? 'bg-emerald-600 text-white' : 'text-gray-300'
                          }`}
                        >
                          Upload customer contacts
                        </button>
                      </div>

                      <div className="mt-4 bg-gray-700/40 rounded-lg p-4 border border-gray-700">
                        {recipientSource === 'mine' ? (
                          <div className="text-sm text-gray-300">
                            <p>Select from your saved segments (demo state):</p>
                            <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-400">
                              <li>All prospects (12,340)</li>
                              <li>Warm leads (2,118)</li>
                              <li>Past customers (842)</li>
                            </ul>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-gray-300">
                              Upload CSV with columns: <code className="text-gray-200">email</code>,{' '}
                              <code className="text-gray-200">first_name</code>,{' '}
                              <code className="text-gray-200">last_name</code>
                            </p>
                            <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-dashed border-gray-600 rounded-lg text-gray-300 cursor-pointer w-fit">
                              <Upload className="w-4 h-4" />
                              <span>Choose CSV</span>
                              <input type="file" accept=".csv" className="hidden" onChange={() => alert('Demo: file selected')} />
                            </label>
                            <p className="text-xs text-gray-500">We will auto-deduplicate and validate addresses during import.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* compliance mini-card */}
                    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 space-y-3">
                      <h4 className="text-white font-medium">Compliance</h4>
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" className="accent-emerald-500" defaultChecked /> Include unsubscribe link
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" className="accent-emerald-500" defaultChecked /> Include sender postal address
                      </label>
                      <p className="text-xs text-gray-500">Helps with CAN-SPAM/GDPR compliance and deliverability.</p>
                    </div>
                  </div>
                </section>

                {/* Send Options */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-medium text-white">Send Options</h3>
                    <CalendarClock className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="bg-gray-700/40 rounded-lg p-4 border border-gray-700">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-2 text-gray-200">
                        <input type="radio" className="accent-emerald-500" checked={sendType === 'now'} onChange={() => setSendType('now')} />
                        Send now
                      </label>
                      <label className="inline-flex items-center gap-2 text-gray-200">
                        <input type="radio" className="accent-emerald-500" checked={sendType === 'schedule'} onChange={() => setSendType('schedule')} />
                        Schedule for later
                      </label>
                      {sendType === 'schedule' && (
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* footer */}
              <div className="p-6 border-t border-gray-700 flex flex-col sm:flex-row gap-3 sm:justify-end sticky bottom-0 bg-gray-800 z-10 rounded-b-2xl">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!fromEmail) {
                      setBanner({ kind: 'warn', msg: 'Please enter and verify a From address before creating a campaign.' });
                      return;
                    }
                    if (!isVerified) {
                      setBanner({
                        kind: 'warn',
                        msg: 'Sender not verified yet. Please verify the address or use your existing verified one.',
                      });
                      return;
                    }
                    alert('Campaign created successfully! (UI only)');
                    setShowModal(false);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Create Campaign
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
