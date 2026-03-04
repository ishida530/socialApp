"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Link2, Image, BarChart3, Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

const navItems = [
  { icon: LayoutDashboard, label: 'Pulpit', href: '/' },
  { icon: Layers, label: 'Kampanie', href: '/campaigns' },
  { icon: Link2, label: 'Połączone konta', href: '/social-accounts' },
  { icon: Image, label: 'Biblioteka mediów', href: '/media-library' },
  { icon: BarChart3, label: 'Analityka', href: '/analytics' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [planLabel, setPlanLabel] = useState('Plan bezpłatny');
  const [usageLabel, setUsageLabel] = useState('0/0 filmów w tym miesiącu');
  const [trialLabel, setTrialLabel] = useState<string | null>(null);
  const [usageProgress, setUsageProgress] = useState(0);

  useEffect(() => {
    const loadSubscriptionCard = async () => {
      try {
        const response = await apiClient.get<{
          subscription: {
            plan: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
            basePlan?: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
            trial?: {
              isActive: boolean;
              endsAt: string;
            } | null;
          };
          usage: {
            video_uploads: {
              count: number;
              limit: number | null;
            };
          };
        }>('/billing/subscription');

        const activePlan = response.data.subscription.plan;
        setPlanLabel(
          activePlan === 'FREE'
            ? 'Plan Free'
            : activePlan === 'STARTER'
              ? 'Plan Starter'
              : activePlan === 'PRO'
                ? 'Plan Pro'
                : 'Plan Business',
        );

        const count = response.data.usage.video_uploads.count;
        const limit = response.data.usage.video_uploads.limit;
        setUsageLabel(`${count}/${limit ?? '∞'} filmów w tym miesiącu`);

        if (limit && limit > 0) {
          setUsageProgress(Math.max(0, Math.min(100, Math.round((count / limit) * 100))));
        } else {
          setUsageProgress(100);
        }

        if (response.data.subscription.trial?.isActive && response.data.subscription.basePlan === 'FREE') {
          const endsAt = new Date(response.data.subscription.trial.endsAt).getTime();
          const remainingMs = Math.max(0, endsAt - Date.now());
          const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          setTrialLabel(`Trial PRO: ${days}d ${hours}h`);
        } else {
          setTrialLabel(null);
        }
      } catch {
        setPlanLabel('Plan bezpłatny');
        setUsageLabel('0/0 filmów w tym miesiącu');
        setUsageProgress(0);
        setTrialLabel(null);
      }
    };

    void loadSubscriptionCard();

    const timer = window.setInterval(() => {
      void loadSubscriptionCard();
    }, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <aside className="hidden lg:flex w-64 bg-card border-r border-border flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center">
              <span className="text-xl font-bold text-white">PF</span>
            </div>
            <span className="text-xl font-bold text-foreground">Postfly</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/20 rounded-xl p-4">
            <p className="text-sm text-foreground font-medium mb-2">{planLabel}</p>
            <p className="text-xs text-muted-foreground mb-3">
              {usageLabel}
            </p>
            {trialLabel && <p className="text-xs text-primary mb-2">{trialLabel}</p>}
            <div className="w-full bg-secondary rounded-full h-2 mb-3">
              <div
                className="bg-gradient-to-r from-primary to-accent h-2 rounded-full"
                style={{ width: `${usageProgress}%` }}
              />
            </div>
            <Link
              href="/billing"
              className="text-xs text-primary hover:text-accent transition-colors"
            >
              Ulepsz plan →
            </Link>
          </div>
        </div>
      </aside>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm">
        <div className="grid grid-cols-5 px-1 py-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] transition-all ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span className="truncate max-w-[60px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
