"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Link2, Image, Calendar, BarChart3 } from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Link2, label: 'Połączone konta', href: '/social-accounts' },
  { icon: Image, label: 'Biblioteka mediów', href: '/media-library' },
  { icon: Calendar, label: 'Harmonogram', href: '/schedule' },
  { icon: BarChart3, label: 'Analityka', href: '/analytics' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center">
            <span className="text-xl font-bold text-white">FS</span>
          </div>
          <span className="text-xl font-bold text-foreground">FlowState</span>
        </div>
      </div>

      {/* Navigation */}
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

      {/* Bottom section */}
      <div className="p-4 border-t border-border">
        <div className="bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/20 rounded-xl p-4">
          <p className="text-sm text-foreground font-medium mb-2">Plan Pro</p>
          <p className="text-xs text-muted-foreground mb-3">
            500/1000 filmów w tym miesiącu
          </p>
          <div className="w-full bg-secondary rounded-full h-2 mb-3">
            <div className="bg-gradient-to-r from-primary to-accent h-2 rounded-full" style={{ width: '50%' }} />
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
  );
}
