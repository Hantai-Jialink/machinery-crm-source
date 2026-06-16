import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="min-h-screen">
        <Sidebar />
        <main className="lg:pl-60 pt-14 lg:pt-0">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </Providers>
  );
}
