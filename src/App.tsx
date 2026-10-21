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
          title="Local storage is unavailable"
          message={`${error ?? "Unknown error."} The sandbox needs IndexedDB (disabled in private browsing in some browsers).`}
          onRetry={() => void init()}
          extra={
            <Button onClick={() => window.location.reload()} icon="refresh">
              Reload the page
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
      <Route path="/collect" element={<Shell><Collect /></Shell>} />
      <Route path="/customers" element={<Shell><Customers /></Shell>} />
      <Route path="/customers/:id" element={<Shell><CustomerDetail /></Shell>} />
      <Route path="/merchants" element={<Shell><Merchants /></Shell>} />
      <Route path="/merchants/:id" element={<Shell><MerchantDetail /></Shell>} />
      <Route path="/settlements" element={<Shell><Settlements /></Shell>} />
      <Route path="/developers" element={<Shell><Developers /></Shell>} />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />
      <Route path="*" element={<Shell><NotFound /></Shell>} />
    </Routes>
  );
}
