import { LayoutDashboard, Link, Image, Calendar, BarChart3 } from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Link, label: 'Połączone konta', active: false },
  { icon: Image, label: 'Biblioteka mediów', active: false },
  { icon: Calendar, label: 'Harmonogram', active: false },
  { icon: BarChart3, label: 'Analityka', active: false },
];

export function Sidebar() {
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
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              item.active
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </button>
        ))}
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
          <button className="text-xs text-primary hover:text-accent transition-colors">
            Ulepsz plan →
          </button>
        </div>
      </div>
    </aside>
  );
}
