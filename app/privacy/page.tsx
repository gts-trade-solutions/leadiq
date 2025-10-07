'use client';

import Link from 'next/link';
import {
  BarChart3,
  Lock,
  Shield,
  Database,
  Cookie,
  Globe2,
  ShieldCheck,
  Clock4,
  UserCheck,
  Info,
} from 'lucide-react';

export default function PrivacyPage() {
  const year = new Date().getFullYear();
  const lastUpdated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      {/* Top Nav */}
      <nav className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950/80 backdrop-blur supports-[backdrop-filter]:bg-gray-950/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-white">LeadIQ</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-sm text-gray-300 hover:text-white">
              Terms
            </Link>
            <Link
              href="/#pricing"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="border-b border-gray-800 bg-gradient-to-b from-gray-950 via-gray-950 to-gray-900">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-900/20 px-3 py-1">
            <Lock className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-300">Privacy</span>
          </div>

          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
                Privacy Policy
              </h1>
              {/* <p className="mt-3 max-w-2xl text-gray-400">
                How LeadIQ collects, uses, and protects information when you use our platform,
                website, and integrations.
              </p> */}
            </div>

            {/* <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">
              <span className="mr-2 inline-flex items-center gap-2">
                <Info className="h-4 w-4 text-emerald-400" />
                Last updated:
              </span>
              <span className="font-medium text-gray-300">{lastUpdated}</span>
            </div> */}
          </div>

          {/* At-a-glance */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Database className="h-4 w-4 text-emerald-400" />} title="What we collect">
              Account, usage, billing, and professional contact data.
            </StatCard>
            <StatCard icon={<Shield className="h-4 w-4 text-emerald-400" />} title="How we use it">
              To operate, improve, secure, and support the Services.
            </StatCard>
            <StatCard icon={<UserCheck className="h-4 w-4 text-emerald-400" />} title="Your choices">
              Access the applicable data.
            </StatCard>
            <StatCard icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />} title="Security">
              Encryption in transit, access controls, and monitoring.
            </StatCard>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          {/* Main */}
          <section className="space-y-10 lg:col-span-8">
            <Section id="scope" title="1. Scope">
              <p>
                This Privacy Policy describes how LeadIQ (“we”, “us”) handles information when you visit our
                websites, use our applications and APIs, or otherwise interact with our sales intelligence
                platform (collectively, the “Services”). Use of the Services is also governed by our{' '}
                <Link href="/terms" className="text-emerald-400 hover:underline">
                  Terms of Service
                </Link>.
              </p>
            </Section>

            <Section id="data-we-collect" title="2. Data We Collect">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <span className="font-medium">Account &amp; Billing:</span> name, email, company, role,
                  authentication identifiers; billing details and transaction records.
                </li>
                <li>
                  <span className="font-medium">Usage &amp; Device:</span> log data, IP address, device/browser
                  info, product telemetry, and support communications.
                </li>
                <li>
                  <span className="font-medium">Payment:</span> processed by our payment provider; we receive
                  limited billing metadata (no full card numbers).
                </li>
                <li>
                  <span className="font-medium">Business Contact Data:</span> professional profiles and company
                  information from public sources, partners, and user contributions to help customers find and
                  engage relevant prospects.
                </li>
                <li>
                  <span className="font-medium">Cookies &amp; Similar Tech:</span> for authentication,
                  preferences, analytics, performance, and fraud prevention.
                </li>
              </ul>
            </Section>

            <Section id="how-we-use-data" title="3. How We Use Data">
              <ul className="list-disc space-y-2 pl-6">
                <li>Provide, maintain, and improve the Services and your experience.</li>
                <li>Process purchases and manage credit balances and entitlements.</li>
                <li>Personalize features and recommendations; provide customer support.</li>
                <li>Monitor, detect, and prevent fraud, abuse, and security incidents.</li>
                <li>Comply with legal obligations and enforce our Terms.</li>
              </ul>
            </Section>

            <Section id="legal-bases" title="4. Legal Bases (EEA/UK)">
              <p>
                Where GDPR or similar laws apply, we rely on legitimate interests (e.g., to provide and secure
                the Service), contract performance, consent where required, and legal obligation. You may object
                to processing based on legitimate interests.
              </p>
            </Section>

            <Section id="cookies" title="5. Cookies & Tracking">
              <p>
                We use cookies and similar technologies to keep you signed in, remember preferences, analyze
                usage, and improve performance. You can manage cookies in your browser settings. Some features
                require cookies to function.
              </p>
            </Section>

            <Section id="sharing" title="6. Sharing & Disclosure">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <span className="font-medium">Service Providers:</span> hosting, analytics, email delivery,
                  payments, and support vendors acting on our behalf under contracts.
                </li>
                <li>
                  <span className="font-medium">Integrations:</span> if you connect a CRM or outbound tool, we
                  share data as needed per your configuration and the third party’s terms.
                </li>
                <li>
                  <span className="font-medium">Compliance &amp; Safety:</span> to comply with law or protect
                  rights, property, or safety.
                </li>
                <li>
                  <span className="font-medium">Business Transfers:</span> as part of a merger, acquisition,
                  financing, or asset sale consistent with this Policy.
                </li>
              </ul>
            </Section>

            <Section id="international" title="7. International Transfers">
              <p>
                We may process data globally. Where required, we implement appropriate safeguards (e.g., approved
                transfer mechanisms) for cross-border data transfers.
              </p>
            </Section>

            <Section id="security" title="8. Security">
              <p>
                We implement administrative, technical, and physical safeguards designed to protect information,
                including encryption in transit, access controls, and monitoring. No method is 100% secure, but
                we continually improve our practices.
              </p>
            </Section>

            <Section id="retention" title="9. Data Retention">
              <p>
                We retain information as long as necessary to provide the Services, comply with legal obligations,
                resolve disputes, and enforce agreements. We may de-identify or aggregate data for longer retention.
              </p>
            </Section>

            <Section id="your-rights" title="10. Your Rights & Choices">
              <ul className="list-disc space-y-2 pl-6">
                <li>Access, correct, or delete your information, subject to legal limits.</li>
                <li>Object to or restrict certain processing; request data portability.</li>
                <li>Opt out of marketing communications (transactional notices may still be sent).</li>
                <li>
                  Lodge a complaint with your local data protection authority where applicable.
                </li>
              </ul>
            </Section>

            <Section id="children" title="11. Children">
              <p>
                The Services are not directed to children under 16, and we do not knowingly collect personal
                information from them. If you believe a child provided data, contact us and we will take
                appropriate action.
              </p>
            </Section>

            <Section id="controller" title="12. Data Controller & Contact">
              <p>
                LeadIQ is the controller of personal data processed under this Policy unless stated otherwise.
                For requests or questions, email{' '}
                <a href="mailto:privacy@leadiq.app" className="text-emerald-400 hover:underline">
                  privacy@leadiq.app
                </a>.
              </p>
            </Section>

            <Section id="changes" title="13. Changes to This Policy">
              <p>
                We may update this Policy from time to time. If changes are material, we will provide reasonable
                notice via the Service or by email. Your continued use after the effective date constitutes
                acceptance of the updated Policy.
              </p>
            </Section>
          </section>

          {/* Right rail */}
          <aside className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              {/* TOC */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="mb-3 text-sm font-semibold text-white">Table of contents</h3>
                <nav className="text-sm">
                  <ul className="space-y-2">
                    {[
                      ['scope', 'Scope'],
                      ['data-we-collect', 'Data We Collect'],
                      ['how-we-use-data', 'How We Use Data'],
                      ['legal-bases', 'Legal Bases (EEA/UK)'],
                      ['cookies', 'Cookies & Tracking'],
                      ['sharing', 'Sharing & Disclosure'],
                      ['international', 'International Transfers'],
                      ['security', 'Security'],
                      ['retention', 'Data Retention'],
                      ['your-rights', 'Your Rights & Choices'],
                      ['children', 'Children'],
                      ['controller', 'Data Controller & Contact'],
                      ['changes', 'Changes to This Policy'],
                    ].map(([id, label]) => (
                      <li key={id}>
                        <a
                          href={`#${id}`}
                          className="inline-block rounded-md px-2 py-1 text-gray-300 hover:bg-gray-800 hover:text-white"
                        >
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>

              {/* Cookie note */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <Cookie className="h-4 w-4 text-emerald-400" /> Cookie preferences
                </div>
                <p className="mb-4 text-sm text-gray-400">
                  You can manage cookies in your browser. If you need a per-site toggle, we can add a cookie banner with granular controls.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/30"
                  onClick={() => alert('Cookie preferences UI not implemented in this template.')}
                >
                  Open preferences
                </button>
              </div>

              {/* Transfer note */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <Globe2 className="h-4 w-4 text-emerald-400" /> Data transfers
                </div>
                <p className="text-sm text-gray-400">
                  We use appropriate safeguards for cross-border transfers where required (e.g., approved contractual clauses).
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-white">LeadIQ</span>
          </div>
          <div className="text-sm text-gray-400">© {year} LeadIQ. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- tiny helpers ---------- */
function StatCard({ icon, title, children }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
        {icon} {title}
      </div>
      <p className="text-sm text-gray-400">{children}</p>
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
        <h2 className="mb-3 text-2xl font-semibold text-white">{title}</h2>
        <div className="space-y-3 leading-relaxed text-gray-300">{children}</div>
      </div>
    </section>
  );
}
