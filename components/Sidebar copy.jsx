'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, Building2, Users, UserCheck, AlertCircle, Send,
  Target, Workflow, Bot, TrendingUp, ShoppingCart, BarChart,
  FileText, CreditCard, Settings, Shield, Briefcase,
  Smartphone, Globe, ChevronDown, ChevronRight, MessageSquare,
  Activity, Zap, Database
} from 'lucide-react';

const navigationSections = [
  {
    title: 'Lead Generation',
    items: [
      { name: 'Dashboard', href: '/app', icon: BarChart3 },
      { name: 'Companies', href: '/portal/companies', icon: Building2 },
      { name: 'Contacts', href: '/portal/contacts', icon: Users },
      { name: 'Contact ID Manager', href: '/portal/contact-id-manager', icon: UserCheck },
      { name: 'Import Failures', href: '/portal/import-failures', icon: AlertCircle },
    ],
  },
  {
    title: 'Outreach & Engagement',
    items: [
      { name: 'Multi-Channel', href: '/portal/multi-channel', icon: Send },
      { name: 'Campaigns', href: '/portal/campaigns', icon: Target },
      { name: 'Sequences', href: '/portal/sequences', icon: Workflow },
    ],
  },
  {
    title: 'Relationship Management',
    items: [
      { name: 'CRM Automation', href: '/portal/crm-automation', icon: Bot },
      { name: 'Pipeline', href: '/portal/pipeline', icon: TrendingUp },
    ],
  },
  {
    title: 'Intelligence & Analytics',
    items: [
      { name: 'AI Intelligence', href: '/portal/ai-intelligence', icon: Bot },
      { name: 'Data Intelligence', href: '/portal/data-intelligence', icon: BarChart },
      { name: 'Data Marketplace', href: '/portal/data-marketplace', icon: ShoppingCart },
      { name: 'Analytics', href: '/portal/analytics', icon: BarChart3 },
      { name: 'Reporting', href: '/portal/reporting', icon: FileText },
    ],
  },
  {
    title: 'Business Operations',
    items: [
      { name: 'Billing', href: '/portal/billing', icon: CreditCard },
      { name: 'Users & Roles', href: '/portal/users-roles', icon: Users },
      { name: 'Settings', href: '/portal/settings', icon: Settings },
    ],
  },
  {
    title: 'Admin Controls',
    items: [
      { name: 'Platform Admin', href: '/portal/platform-admin', icon: Shield },
      { name: 'Marketing', href: '/portal/marketing', icon: Target },
      { name: 'Enterprise', href: '/portal/enterprise', icon: Briefcase },
      { name: 'Scalability', href: '/portal/scalability', icon: TrendingUp },
      { name: 'Integrations', href: '/portal/integrations', icon: Zap },
      { name: 'Mobile', href: '/portal/mobile', icon: Smartphone },
      { name: 'CMS', href: '/portal/cms', icon: Database },
    ],
  },
  {
    title: 'Support',
    items: [
      { name: 'Support Sessions', href: '/portal/support', icon: MessageSquare },
      { name: 'Real-Time Activity', href: '/portal/activity', icon: Activity },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => {
    // Expand sections that contain the current path
    const expanded = {};
    navigationSections.forEach((section, index) => {
      expanded[index] = section.items.some(item => pathname === item.href);
    });
    return expanded;
  });

  const toggleSection = (index) => {
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-gray-900 border-r border-gray-800 h-screen sticky top-0 overflow-y-auto sidebar-scrollbar transition-all duration-300`}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">LeadSentra</span>
        </div>

        <nav className="space-y-6">
          {navigationSections.map((section, sectionIndex) => (
            <div key={section.title}>
              <button
                onClick={() => toggleSection(sectionIndex)}
                className="flex items-center justify-between w-full text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 hover:text-gray-300"
              >
                {section.title}
                {expandedSections[sectionIndex] ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>

              {expandedSections[sectionIndex] && (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
