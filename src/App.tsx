import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorState, LoadingScreen } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { usePspStore } from "@/store/usePspStore";
import { Checkout } from "@/pages/Checkout";
import { Collect } from "@/pages/Collect";
import { CustomerDetail } from "@/pages/CustomerDetail";
import { Customers } from "@/pages/Customers";
import { Dashboard } from "@/pages/Dashboard";
import { Developers } from "@/pages/Developers";
import { MerchantDetail } from "@/pages/MerchantDetail";
import { Merchants } from "@/pages/Merchants";
import { NotFound } from "@/pages/NotFound";
import { Settings } from "@/pages/Settings";
import { Settlements } from "@/pages/Settlements";
import { TransactionDetail } from "@/pages/TransactionDetail";
import { Transactions } from "@/pages/Transactions";

function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <AppShell>
      <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
    </AppShell>
  );
}

export function App() {
  const phase = usePspStore((s) => s.phase);
  const error = usePspStore((s) => s.error);
  const init = usePspStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-ivory">
        <ErrorState
          title="Le stockage local est inaccessible"
          message={`${error ?? "Erreur inconnue."} La sandbox a besoin d'IndexedDB (désactivé en navigation privée dans certains navigateurs).`}
          onRetry={() => void init()}
          extra={
            <Button onClick={() => window.location.reload()} icon="refresh">
              Recharger la page
            </Button>
          }
        />
      </div>
    );
  }
  if (phase !== "ready") return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/pay/:token" element={<Checkout />} />
      <Route path="/" element={<Shell><Dashboard /></Shell>} />
      <Route path="/transactions" element={<Shell><Transactions /></Shell>} />
      <Route path="/transactions/:id" element={<Shell><TransactionDetail /></Shell>} />
      <Route path="/encaissement" element={<Shell><Collect /></Shell>} />
      <Route path="/clients" element={<Shell><Customers /></Shell>} />
      <Route path="/clients/:id" element={<Shell><CustomerDetail /></Shell>} />
      <Route path="/commercants" element={<Shell><Merchants /></Shell>} />
      <Route path="/commercants/:id" element={<Shell><MerchantDetail /></Shell>} />
      <Route path="/reglements" element={<Shell><Settlements /></Shell>} />
      <Route path="/developpeurs" element={<Shell><Developers /></Shell>} />
      <Route path="/parametres" element={<Shell><Settings /></Shell>} />
      <Route path="*" element={<Shell><NotFound /></Shell>} />
    </Routes>
  );
}
