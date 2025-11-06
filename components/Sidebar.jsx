"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Users,
  UserCheck,
  AlertCircle,
  Send,
  Target,
  Workflow,
  Bot,
  TrendingUp,
  ShoppingCart,
  BarChart,
  FileText,
  CreditCard,
  Settings,
  Shield,
  Briefcase,
  Smartphone,
  Database,
  MessageSquare,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/**
 * All items (flattened from your previous sections)
 * Mark enabled only for the four working routes.
 */
const ALL_ITEMS = [
  // Lead Generation
  { name: "Dashboard", href: "/app", icon: BarChart3, enabled: false },
  {
    name: "Companies",
    href: "/portal/companies",
    icon: Building2,
    enabled: true,
  },
  { name: "Contacts", href: "/portal/contacts", icon: Users, enabled: true },
  {
    name: "Contact ID Manager",
    href: "/portal/contact-id-manager",
    icon: UserCheck,
    enabled: false,
  },
  {
    name: "Import Failures",
    href: "/portal/import-failures",
    icon: AlertCircle,
    enabled: false,
  },

  // Outreach & Engagement
  {
    name: "Multi-Channel",
    href: "/portal/multi-channel",
    icon: Send,
    enabled: true,
  },
  { name: "Campaigns", href: "/portal/campaigns", icon: Target, enabled: true },
  {
    name: "Sequences",
    href: "/portal/sequences",
    icon: Workflow,
    enabled: false,
  },

  // Relationship Management
  {
    name: "CRM Automation",
    href: "/portal/crm-automation",
    icon: Bot,
    enabled: false,
  },
  {
    name: "Pipeline",
    href: "/portal/pipeline",
    icon: TrendingUp,
    enabled: false,
  },

  // Intelligence & Analytics
  {
    name: "AI Intelligence",
    href: "/portal/ai-intelligence",
    icon: Bot,
    enabled: false,
  },
  {
    name: "Data Intelligence",
    href: "/portal/data-intelligence",
    icon: BarChart,
    enabled: false,
  },
  {
    name: "Data Marketplace",
    href: "/portal/data-marketplace",
    icon: ShoppingCart,
    enabled: false,
  },
  {
    name: "Analytics",
    href: "/portal/analytics",
    icon: BarChart3,
    enabled: false,
  },
  {
    name: "Reporting",
    href: "/portal/reporting",
    icon: FileText,
    enabled: false,
  },

  // Business Operations
  {
    name: "Billing",
    href: "/portal/billing",
    icon: CreditCard,
    enabled: false,
  },
  {
    name: "Users & Roles",
    href: "/portal/users-roles",
    icon: Users,
    enabled: false,
  },
  {
    name: "Settings",
    href: "/portal/settings",
    icon: Settings,
    enabled: false,
  },

  // Admin Controls
  {
    name: "Platform Admin",
    href: "/portal/platform-admin",
    icon: Shield,
    enabled: false,
  },
  {
    name: "Marketing",
    href: "/portal/marketing",
    icon: Target,
    enabled: false,
  },
  {
    name: "Enterprise",
    href: "/portal/enterprise",
    icon: Briefcase,
    enabled: false,
  },
  {
    name: "Scalability",
    href: "/portal/scalability",
    icon: TrendingUp,
    enabled: false,
  },
  {
    name: "Integrations",
    href: "/portal/integrations",
    icon: Bot,
    enabled: false,
  },
  { name: "Mobile", href: "/portal/mobile", icon: Smartphone, enabled: false },
  { name: "CMS", href: "/portal/cms", icon: Database, enabled: false },

  // Support
  {
    name: "Support Sessions",
    href: "/portal/support",
    icon: MessageSquare,
    enabled: false,
  },
  {
    name: "Real-Time Activity",
    href: "/portal/activity",
    icon: Activity,
    enabled: false,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Put enabled items first, then disabled (preserve relative order within each bucket)
  const ordered = useMemo(() => {
    const enabled = ALL_ITEMS.filter((i) => i.enabled);
    const disabled = ALL_ITEMS.filter((i) => !i.enabled);
    return [...enabled, ...disabled];
  }, []);

  return (
    <div
      className={`${
        isCollapsed ? "w-18" : "w-64"
      } bg-gray-900 border-r border-gray-800 h-screen sticky top-0 overflow-y-auto sidebar-scrollbar transition-all duration-300`}
    >
      {/* Brand / collapse */}
      <div className={`${isCollapsed ? 'p-2' : 'p-4'} flex items-center justify-between`}>
        <Link
          href="/"
          className="flex items-center gap-2 group"
          aria-label="Go to home"
          title="Home"
        >
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold text-white">LeadSentra</span>
          )}
        </Link>
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-300"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Single segment */}
      <div className={`${isCollapsed ? 'px-2' : 'px-4'}`}>
        {!isCollapsed && (
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Navigation
          </div>
        )}

        <nav className="space-y-1">
          {ordered.map((item) => {
            const Icon = item.icon;
            const isActive = item.enabled && pathname === item.href;

            if (item.enabled) {
              // Clickable link (working routes)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                  title={item.name}
                >
                  <Icon className="w-4 h-4" />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              );
            }

            // Disabled item (shown but not a link)
            return (
              <div
                key={item.href}
                className="sidebar-nav-item opacity-50 cursor-not-allowed pointer-events-none"
                title={`${item.name} (disabled)`}
              >
                <Icon className="w-4 h-4" />
                {!isCollapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span>{item.name}</span>
                    <span className="text-[10px] uppercase text-gray-500">
                      Soon
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
