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
      { name: 'Companies', href: '/admin/companies', icon: Building2 },
      { name: 'Contacts', href: '/admin/contacts', icon: Users },
      { name: 'Contact ID Manager', href: '/admin/contact-id-manager', icon: UserCheck },
      { name: 'Import Failures', href: '/admin/import-failures', icon: AlertCircle },
    ],
  },
  {
    title: 'Outreach & Engagement',
    items: [
      { name: 'Multi-Channel', href: '/admin/multi-channel', icon: Send },
      { name: 'Campaigns', href: '/admin/campaigns', icon: Target },
      { name: 'Sequences', href: '/admin/sequences', icon: Workflow },
    ],
  },
  {
    title: 'Relationship Management',
    items: [
      { name: 'CRM Automation', href: '/admin/crm-automation', icon: Bot },
      { name: 'Pipeline', href: '/admin/pipeline', icon: TrendingUp },
    ],
  },
  {
    title: 'Intelligence & Analytics',
    items: [
      { name: 'AI Intelligence', href: '/admin/ai-intelligence', icon: Bot },
      { name: 'Data Intelligence', href: '/admin/data-intelligence', icon: BarChart },
      { name: 'Data Marketplace', href: '/admin/data-marketplace', icon: ShoppingCart },
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      { name: 'Reporting', href: '/admin/reporting', icon: FileText },
    ],
  },
  {
    title: 'Business Operations',
    items: [
      { name: 'Billing', href: '/admin/billing', icon: CreditCard },
      { name: 'Users & Roles', href: '/admin/users-roles', icon: Users },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
  {
    title: 'Admin Controls',
    items: [
      { name: 'Platform Admin', href: '/admin/platform-admin', icon: Shield },
      { name: 'Marketing', href: '/admin/marketing', icon: Target },
      { name: 'Enterprise', href: '/admin/enterprise', icon: Briefcase },
      { name: 'Scalability', href: '/admin/scalability', icon: TrendingUp },
      { name: 'Integrations', href: '/admin/integrations', icon: Zap },
      { name: 'Mobile', href: '/admin/mobile', icon: Smartphone },
      { name: 'CMS', href: '/admin/cms', icon: Database },
    ],
  },
  {
    title: 'Support',
    items: [
      { name: 'Support Sessions', href: '/admin/support', icon: MessageSquare },
      { name: 'Real-Time Activity', href: '/admin/activity', icon: Activity },
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
