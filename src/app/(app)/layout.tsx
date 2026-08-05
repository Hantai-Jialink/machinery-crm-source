import { Providers } from "@/components/providers";
import { FloatingPet } from "@/components/dachuan-pet/FloatingPet";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>
        {children}
      </AppShell>
      <FloatingPet />
    </Providers>
  );
}
