'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Shield, Globe, Users, BarChart3, Zap, CheckCircle } from 'lucide-react';
import { useSupabase } from '@/integrations/supabase/client';

export default function MarketingHome() {
  const supabase = useSupabase();
  const [signedIn, setSignedIn] = useState(null); // null = unknown (avoid flicker)

  useEffect(() => {
    let unsub = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(!!data.session);

      const sub = supabase.auth.onAuthStateChange((_event, session) => {
        setSignedIn(!!session);
      });
      unsub = sub.data.subscription;
    })();

    return () => {
      unsub?.unsubscribe?.();
    };
  }, [supabase]);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Navigation */}
      <nav className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">LeadIQ</span>
              </div>

              <div className="hidden md:flex items-center gap-6">
                <Link href="#features" className="text-gray-300 hover:text-white text-sm">Features</Link>
                <Link href="#pricing" className="text-gray-300 hover:text-white text-sm">Pricing</Link>
                <Link href="#about" className="text-gray-300 hover:text-white text-sm">About</Link>
                <Link href="#contact" className="text-gray-300 hover:text-white text-sm">Contact</Link>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* While auth is loading, render nothing to avoid flicker */}
              {signedIn === null ? null : signedIn ? (
                <Link
                  href="/admin/companies"
                  className="bg-emerald-600 hover:bg-emerald-700 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm"
                >
                  Portal
                </Link>
              ) : (
                <Link
                  href="/auth/signin"
                  className="text-gray-300 hover:text-white text-sm"
                >
                  Sign In
                </Link>
              )}

              <Link
                href="/"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            The Future of
            <span className="text-emerald-400"> Sales Intelligence</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
            Unlock unprecedented growth with AI-powered lead generation, multi-channel outreach,
            and intelligent sales automation. Turn prospects into revenue faster than ever.
          </p>

          {/* KPI Badges */}
          <div className="flex flex-wrap justify-center gap-8 mb-12">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">500M+</div>
              <div className="text-sm text-gray-400">Global Contacts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">70M+</div>
              <div className="text-sm text-gray-400">Companies</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">200+</div>
              <div className="text-sm text-gray-400">Data Points</div>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition-colors"
          >
            Start Your Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-12 border-y border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap justify-center items-center gap-12">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-emerald-400" />
              <span className="text-gray-300 font-medium">SOC2 Compliant</span>
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-6 h-6 text-emerald-400" />
              <span className="text-gray-300 font-medium">GDPR Ready</span>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-emerald-400" />
              <span className="text-gray-300 font-medium">Enterprise Security</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">
              Everything you need to accelerate sales
            </h2>
            <p className="text-gray-300 text-lg">
              Comprehensive sales intelligence platform built for modern sales teams
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <Users className="w-10 h-10 text-emerald-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-3">Lead Intelligence</h3>
              <p className="text-gray-300">
                Access 500M+ verified contacts and 70M+ companies with real-time data updates and AI-powered insights.
              </p>
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <Zap className="w-10 h-10 text-emerald-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-3">Multi-Channel Outreach</h3>
              <p className="text-gray-300">
                Engage prospects across email, LinkedIn, and phone with automated sequences and personalized messaging.
              </p>
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <BarChart3 className="w-10 h-10 text-emerald-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-3">Sales Analytics</h3>
              <p className="text-gray-300">
                Track performance, optimize campaigns, and forecast revenue with advanced analytics and reporting.
              </p>
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <Shield className="w-10 h-10 text-emerald-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-3">CRM Integration</h3>
              <p className="text-gray-300">
                Seamlessly sync with Salesforce, HubSpot, and 50+ other platforms to centralize your sales workflow.
              </p>
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <Globe className="w-10 h-10 text-emerald-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-3">Global Coverage</h3>
              <p className="text-gray-300">
                Reach prospects worldwide with localized data and compliance tools for international markets.
              </p>
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
              <CheckCircle className="w-10 h-10 text-emerald-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-3">Enterprise Ready</h3>
              <p className="text-gray-300">
                Scale with confidence using enterprise-grade security, compliance, and dedicated support.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 border-t border-gray-800 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">LeadIQ</span>
            </div>
            <div className="text-sm text-gray-400">
              © 2024 LeadIQ. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
