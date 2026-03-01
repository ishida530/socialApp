import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ConnectedPlatforms } from './ConnectedPlatforms';
import { VideoUploader } from './VideoUploader';
import { PostComposer } from './PostComposer';
import { RecentActivity } from './RecentActivity';

export function Dashboard() {
  return (
    <div className="size-full flex bg-background dark">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/20 rounded-xl p-5">
                <p className="text-sm text-muted-foreground mb-1">Opublikowane</p>
                <p className="text-3xl font-bold text-foreground">248</p>
                <p className="text-xs text-green-500 mt-2">+12% w tym miesiącu</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-sm border border-blue-500/20 rounded-xl p-5">
                <p className="text-sm text-muted-foreground mb-1">Zaplanowane</p>
                <p className="text-3xl font-bold text-foreground">42</p>
                <p className="text-xs text-blue-500 mt-2">Na następny tydzień</p>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm border border-green-500/20 rounded-xl p-5">
                <p className="text-sm text-muted-foreground mb-1">Łączne wyświetlenia</p>
                <p className="text-3xl font-bold text-foreground">1.2M</p>
                <p className="text-xs text-green-500 mt-2">+18% w tym miesiącu</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 backdrop-blur-sm border border-yellow-500/20 rounded-xl p-5">
                <p className="text-sm text-muted-foreground mb-1">Zaangażowanie</p>
                <p className="text-3xl font-bold text-foreground">8.4%</p>
                <p className="text-xs text-yellow-500 mt-2">+2.1% w tym miesiącu</p>
              </div>
            </div>

            <ConnectedPlatforms />
            <VideoUploader />
            <RecentActivity />
          </div>

          <PostComposer />
        </main>
      </div>
    </div>
  );
}
