"use client";

import Link from "next/link";
import {
  BarChart3,
  FileCheck2,
  Scale,
  ShieldCheck,
  Building2,
  CreditCard,
  Gavel,
  Info,
} from "lucide-react";

export default function TermsPage() {
  const year = new Date().getFullYear();
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
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
            <span className="text-xl font-semibold text-white">LeadSentra</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-sm text-gray-300 hover:text-white"
            >
              Privacy
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
            <FileCheck2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-300">Legal</span>
          </div>
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
                Terms of Service
              </h1>
              {/* <p className="mt-3 max-w-2xl text-gray-400">
                These Terms govern your access to and use of LeadSentra’s platform, APIs, and related services.
              </p> */}
            </div>
            {/*<div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">
              <span className="mr-2 inline-flex items-center gap-2">
                <Info className="h-4 w-4 text-emerald-400" />
                Last updated:
              </span>
              <span className="font-medium text-gray-300">{lastUpdated}</span>
            </div> */}
          </div>

          {/* At-a-glance */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
                <Scale className="h-4 w-4 text-emerald-400" /> Agreement
              </div>
              <p className="text-sm text-gray-400">
                By using LeadSentra, you accept these Terms and our Privacy
                Policy.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
                <CreditCard className="h-4 w-4 text-emerald-400" /> Credits &
                Billing
              </div>
              <p className="text-sm text-gray-400">
                Credit-based usage with tiered plans. Non-refundable unless
                required by law.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Acceptable
                Use
              </div>
              <p className="text-sm text-gray-400">
                No spam, scraping abuse, or unlawful activity. Respect rate
                limits.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
                <Gavel className="h-4 w-4 text-emerald-400" /> Law & Venue
              </div>
              <p className="text-sm text-gray-400">
                Governed by your specified jurisdiction.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          {/* Main */}
          <section className="lg:col-span-8 space-y-10">
            <Section id="agreement" title="1. Agreement & Acceptance">
              <p>
                These Terms of Service (“Terms”) are a binding agreement between
                you and LeadSentra (“we”, “us”). By accessing or using our
                websites, applications, or services (collectively, the
                “Services”), you agree to these Terms and our{" "}
                <Link
                  href="/privacy"
                  className="text-emerald-400 hover:underline"
                >
                  Privacy Policy
                </Link>
                . If you use the Services on behalf of an entity, you represent
                that you are authorized to bind that entity.
              </p>
            </Section>

            <Section id="accounts" title="2. Accounts & Eligibility">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  You must be at least 18 years old and able to form a contract.
                </li>
                <li>
                  You are responsible for safeguarding your credentials and all
                  activity under your account.
                </li>
                <li>
                  Provide accurate registration information and promptly update
                  it when it changes.
                </li>
              </ul>
            </Section>

            <Section id="credits" title="3. Subscription, Credits & Billing">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  The Services operate on a credit-based model. Features consume
                  credits as shown in the product UI.
                </li>
                <li>
                  Plan tiers (e.g., Pro, Premium) and pricing are presented at
                  checkout; taxes may apply.
                </li>
                <li>
                  Unless otherwise specified, credits are granted upfront and
                  may not expire; promotional credits may have limits.
                </li>
                <li>
                  Payments are processed by our third-party provider. By
                  purchasing, you authorize recurring or one-time charges as
                  selected.
                </li>
                <li>
                  Except where required by law or stated otherwise, purchases
                  are non-refundable.
                </li>
              </ul>
            </Section>

            <Section id="use" title="4. Acceptable Use">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  No unlawful, infringing, deceptive, harassing, or harmful
                  activity.
                </li>
                <li>
                  No spam or unsolicited outreach; comply with applicable
                  marketing and anti-spam laws.
                </li>
                <li>
                  Do not bypass security, probe the system, or exceed documented
                  rate limits.
                </li>
                <li>
                  Do not resell or bulk export data where prohibited by your
                  plan or by law.
                </li>
              </ul>
            </Section>

            <Section id="privacy" title="5. Data, Privacy & Security">
              <p>
                We process account, usage, and business contact data as
                described in our{" "}
                <Link
                  href="/privacy"
                  className="text-emerald-400 hover:underline"
                >
                  Privacy Policy
                </Link>
                . You are responsible for providing required notices and
                obtaining any necessary consents regarding data you submit to
                the Services. We implement administrative and technical
                safeguards appropriate to the risk.
              </p>
            </Section>

            <Section id="integrations" title="6. Third-Party Integrations">
              <p>
                Optional integrations (e.g., CRM, email) are provided by third
                parties and subject to their terms and privacy policies. We are
                not responsible for third-party services.
              </p>
            </Section>

            <Section id="ip" title="7. Intellectual Property">
              <p>
                We (and our licensors) retain all rights to the Services,
                including software, designs, and content, excluding your data.
                Subject to these Terms, we grant you a limited, non-exclusive,
                non-transferable, revocable license to use the Services.
              </p>
            </Section>

            <Section id="confidentiality" title="8. Confidentiality">
              <p>
                “Confidential Information” means non-public information
                disclosed by a party that is marked or should reasonably be
                understood as confidential. The receiving party will use the
                same degree of care it uses to protect its own confidential
                information (and at least reasonable care) and will not disclose
                it except as permitted here.
              </p>
            </Section>

            <Section id="warranties" title="9. Warranties & Disclaimers">
              <p>
                The Services are provided “as is” and “as available.” To the
                fullest extent allowed by law, we disclaim all warranties,
                express or implied, including merchantability, fitness for a
                particular purpose, and non-infringement.
              </p>
            </Section>

            <Section id="liability" title="10. Limitation of Liability">
              <p>
                To the maximum extent permitted by law, we will not be liable
                for indirect, incidental, special, consequential, exemplary, or
                punitive damages, or lost profits or revenues. Our aggregate
                liability arising from or relating to the Services will not
                exceed the amounts you paid in the twelve (12) months preceding
                the event giving rise to liability.
              </p>
            </Section>

            <Section id="indemnity" title="11. Indemnification">
              <p>
                You agree to defend, indemnify, and hold harmless LeadSentra and
                its affiliates from any claims, damages, losses, liabilities,
                costs, and expenses (including reasonable attorneys’ fees)
                arising from your use of the Services or violation of these
                Terms.
              </p>
            </Section>

            <Section id="termination" title="12. Suspension & Termination">
              <p>
                We may suspend or terminate access for actual or suspected
                violations of these Terms, for security risks, or where required
                by law. You may stop using the Services at any time; certain
                provisions survive termination (e.g., IP, confidentiality,
                liability limits).
              </p>
            </Section>

            <Section id="changes" title="13. Changes to Service or Terms">
              <p>
                We may update the Services and these Terms from time to time. If
                changes are material, we will provide reasonable notice via the
                Service or email. Your continued use after the effective date
                constitutes acceptance.
              </p>
            </Section>

            <Section id="law" title="14. Governing Law & Dispute Resolution">
              <p>
                These Terms are governed by the laws of{" "}
                <span className="font-medium">[your jurisdiction]</span>,
                excluding conflict-of-laws principles. The courts located in{" "}
                <span className="font-medium">[your venue]</span> have exclusive
                jurisdiction. You and LeadSentra waive any right to a jury trial
                where permitted by law.
              </p>
            </Section>

            <Section id="contact" title="15. Contact">
              <p>
                Questions about these Terms? Email{" "}
                <a
                  href="mailto:support@LeadSentra.app"
                  className="text-emerald-400 hover:underline"
                >
                  support@LeadSentra.app
                </a>
                .
              </p>
              <p className="mt-6 rounded-lg border border-amber-700/40 bg-amber-900/10 p-4 text-amber-200">
                This page provides general information and does not constitute
                legal advice. Please consult your counsel.
              </p>
            </Section>
          </section>

          {/* Right rail */}
          <aside className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              {/* TOC */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="mb-3 text-sm font-semibold text-white">
                  Table of contents
                </h3>
                <nav className="text-sm">
                  <ul className="space-y-2">
                    {[
                      ["agreement", "Agreement & Acceptance"],
                      ["accounts", "Accounts & Eligibility"],
                      ["credits", "Subscription, Credits & Billing"],
                      ["use", "Acceptable Use"],
                      ["privacy", "Data, Privacy & Security"],
                      ["integrations", "Third-Party Integrations"],
                      ["ip", "Intellectual Property"],
                      ["confidentiality", "Confidentiality"],
                      ["warranties", "Warranties & Disclaimers"],
                      ["liability", "Limitation of Liability"],
                      ["indemnity", "Indemnification"],
                      ["termination", "Suspension & Termination"],
                      ["changes", "Changes to Service or Terms"],
                      ["law", "Governing Law & Dispute Resolution"],
                      ["contact", "Contact"],
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

              {/* Help card */}
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <Building2 className="h-4 w-4 text-emerald-400" /> Need a DPA?
                </div>
                <p className="mb-4 text-sm text-gray-400">
                  If your organization requires a Data Processing Addendum (DPA)
                  or vendor security review, reach out and our team will help.
                </p>
                <a
                  href="mailto:legal@LeadSentra.app"
                  className="inline-flex items-center justify-center rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/30"
                >
                  Contact Legal
                </a>
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
            <span className="text-xl font-semibold text-white">LeadSentra</span>
          </div>
          <div className="text-sm text-gray-400">
            © {year} LeadSentra. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- tiny section component for consistent card styling ---------- */
function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
        <h2 className="mb-3 text-2xl font-semibold text-white">{title}</h2>
        <div className="space-y-3 leading-relaxed text-gray-300">
          {children}
        </div>
      </div>
    </section>
  );
}
