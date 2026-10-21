import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Notice, Tabs } from "@/components/ui/Blocks";
import { SelectField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/States";
import { ToneBadge } from "@/components/ui/Badges";
import { useAction } from "@/hooks/useAction";
import { useData, useDocumentTitle, useRole } from "@/hooks/useData";
import { normalize, paginate } from "@/domain/filters";
import { MAX_REFUND_OPERATOR, formatDA } from "@/domain/money";
import { DEMO_USERS, PERMISSION_LABEL, ROLE_LABEL, ROLE_PERMISSIONS, can, type Permission } from "@/domain/permissions";
import { PERIOD_KEYS, PERIOD_LABEL, formatDateTime } from "@/domain/period";
import { validateOrganization } from "@/domain/validation";
import type { AuditAction, Density, OrganizationProfile, PeriodKey, Role } from "@/domain/types";
import { usePspStore } from "@/store/usePspStore";
import { formatPhone } from "@/utils/format";

const TABS = [
  { id: "organization", label: "Organization" },
  { id: "preferences", label: "Preferences" },
  { id: "roles", label: "Roles and permissions" },
  { id: "audit", label: "Audit log" },
  { id: "demo", label: "Demo data" },
];

const AUDIT_LABEL: Record<AuditAction, string> = {
  "payment.created": "Payment created",
  "payment.status_changed": "Status changed",
  "refund.created": "Refund",
  "settlement.created": "Batch generated",
  "settlement.settled": "Batch settled",
  "settlement.failed": "Batch failed",
  "settings.updated": "Settings changed",
  "role.switched": "Role changed",
  "export.csv": "CSV export",
  "demo.reset": "Demo reset",
  "demo.seeded": "Demo initialized",
};

function OrganizationTab() {
  const data = useData();
  const role = useRole();
  const update = usePspStore((s) => s.updateOrganization);
  const editable = can(role, "settings.edit");
  const [values, setValues] = useState<OrganizationProfile>(data.settings.organization);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const action = useAction((profile: OrganizationProfile) => update(profile), { success: "Organization profile saved.", inlineError: true });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = validateOrganization(values);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    await action.run(res.data);
  }
  const set = (k: keyof OrganizationProfile) => (e: { target: { value: string } }) => setValues({ ...values, [k]: e.target.value });

  return (
    <div className="space-y-5">
      {!editable && (
        <Notice tone="warning" title="Read-only">
          The "{ROLE_LABEL[role]}" role cannot edit the organization profile. Switch to the "Administrator" role through the profile menu.
        </Notice>
      )}
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Organization profile">
        <TextField label="Business name" required value={values.name} onChange={set("name")} error={errors.name} disabled={!editable} />
        <TextField label="Legal name (fictitious)" required value={values.legalName} onChange={set("legalName")} error={errors.legalName} disabled={!editable} />
        <TextField label="Contact email" type="email" required value={values.email} onChange={set("email")} error={errors.email} disabled={!editable} />
        <TextField label="Phone" inputMode="tel" value={values.phone} onChange={set("phone")} error={errors.phone} disabled={!editable} hint={`Displayed: ${formatPhone(values.phone)}`} />
        <TextField label="City" required value={values.city} onChange={set("city")} error={errors.city} disabled={!editable} />
        <TextField label="Tax ID (fictitious)" value={values.taxId} onChange={set("taxId")} error={errors.taxId} disabled={!editable} hint="Example value: do not enter any real identifier." />
        {action.error && (
          <p role="alert" className="field-error sm:col-span-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {action.error}
          </p>
        )}
        {editable && (
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary" loading={action.busy}>
              Save
            </Button>
          </div>
        )}
      </form>
      <dl className="grid grid-cols-1 gap-3 border-t border-ivory-line pt-4 text-[14px] sm:grid-cols-3">
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Account</dt>
          <dd className="m-0">Demo account (sandbox)</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Currency</dt>
          <dd className="m-0">DZD — Algerian dinar (DA), not editable</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Language</dt>
          <dd className="m-0">English</dd>
        </div>
      </dl>
    </div>
  );
}

function PreferencesTab() {
  const prefs = useData().settings.preferences;
  const update = usePspStore((s) => s.updatePreferences);
  const setPeriod = usePspStore((s) => s.setPeriod);
  const action = useAction((next: typeof prefs) => update(next), { success: "Preferences saved." });

  return (
    <div className="max-w-xl space-y-5">
      <fieldset className="m-0 border-0 p-0">
        <legend className="field-label">Table display density</legend>
        <div role="radiogroup" className="inline-flex rounded-xl border border-ivory-line bg-ivory-soft p-1">
          {([
            ["comfortable", "Comfortable"],
            ["compact", "Compact"],
          ] as [Density, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={prefs.density === value}
              disabled={action.busy}
              onClick={() => void action.run({ ...prefs, density: value })}
              className={`rounded-lg px-4 py-1.5 text-[13.5px] font-semibold ${prefs.density === value ? "bg-white text-teal shadow-sm" : "text-ink-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <SelectField
        label="Rows per page (lists)"
        value={String(prefs.pageSize)}
        onChange={(e) => void action.run({ ...prefs, pageSize: Number(e.target.value) as 10 | 25 | 50 })}
      >
        {[10, 25, 50].map((n) => (
          <option key={n} value={n}>
            {n} rows
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Default period"
        value={prefs.defaultPeriod}
        hint="Applied when the application opens and after a reset."
        onChange={(e) => {
          const defaultPeriod = e.target.value as PeriodKey;
          setPeriod(defaultPeriod);
          void action.run({ ...prefs, defaultPeriod });
        }}
      >
        {PERIOD_KEYS.map((k) => (
          <option key={k} value={k}>
            {PERIOD_LABEL[k]}
          </option>
        ))}
      </SelectField>
      <dl className="grid grid-cols-1 gap-3 border-t border-ivory-line pt-4 text-[14px] sm:grid-cols-2">
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Amount format</dt>
          <dd className="num m-0">{formatDA(1_250_050)}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Date time zone</dt>
          <dd className="m-0">Algeria (UTC+1, no daylight saving time)</dd>
        </div>
      </dl>
    </div>
  );
}

function RolesTab() {
  const current = useRole();
  const switchRole = usePspStore((s) => s.switchRole);
  const pushToast = usePspStore((s) => s.pushToast);
  const action = useAction(async (r: Role) => {
    await switchRole(r);
    pushToast("info", `Demo role: ${ROLE_LABEL[r]}.`);
  });
  const permissions = Object.keys(PERMISSION_LABEL) as Permission[];
  const roles: Role[] = ["admin", "operator"];

  return (
    <div className="space-y-5">
      <Notice tone="sandbox" title="Visual role management — no authentication">
        Switching role is a local simulation: there is no account, no password and no server check. In production, permissions are carried by an
        authenticated identity and verified by the backend on every request.
      </Notice>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <div key={r} className={`rounded-xl border-2 p-4 ${current === r ? "border-teal bg-teal-light" : "border-ivory-line"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-[15px] font-semibold">{ROLE_LABEL[r]}</p>
              {current === r && <ToneBadge tone="teal">Active role</ToneBadge>}
            </div>
            <p className="m-0 text-[13px] text-ink-muted">
              {DEMO_USERS[r].name} · {DEMO_USERS[r].email}
            </p>
            <Button className="mt-3" size="sm" disabled={current === r || action.busy} onClick={() => void action.run(r)}>
              {current === r ? "Current role" : `Use the ${ROLE_LABEL[r].toLowerCase()} role`}
            </Button>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-ivory-line">
        <table className="data-table compact">
          <caption className="sr-only">Permission matrix by role</caption>
          <thead>
            <tr>
              <th scope="col">Permission</th>
              {roles.map((r) => (
                <th key={r} scope="col" className="text-center">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p}>
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {PERMISSION_LABEL[p]}
                </th>
                {roles.map((r) => {
                  const ok = ROLE_PERMISSIONS[r].includes(p);
                  return (
                    <td key={r} className="text-center">
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <Icon name="check" size={16} />
                          <span className="sr-only">Allowed</span>
                        </span>
                      ) : (
                        <span className="text-ink-muted" aria-label="Not allowed">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[13px] text-ink-muted">Per-refund ceiling for the operator: {formatDA(MAX_REFUND_OPERATOR)}.</p>
    </div>
  );
}

function AuditTab() {
  const data = useData();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const rows = useMemo(
    () =>
      data.auditLogs.filter(
        (a) => (!kind || a.action === kind) && (!q || normalize(`${a.actor} ${a.summary} ${AUDIT_LABEL[a.action]}`).includes(normalize(q)))
      ),
    [data.auditLogs, q, kind]
  );
  const page = paginate(rows, pageNum, 15);

  return (
    <div className="space-y-4">
      <p className="m-0 text-[13.5px] text-ink-muted">
        Local log of the demonstration's sensitive actions. It can be erased at any time (reset): it is not a probative audit trail.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="audit-search" className="field-label">
            Search
          </label>
          <input id="audit-search" type="search" className="field-input" value={q} placeholder="Actor, reference, action…" onChange={(e) => { setQ(e.target.value); setPageNum(1); }} autoComplete="off" />
        </div>
        <SelectField label="Action type" value={kind} onChange={(e) => { setKind(e.target.value); setPageNum(1); }}>
          <option value="">All actions</option>
          {(Object.keys(AUDIT_LABEL) as AuditAction[]).map((k) => (
            <option key={k} value={k}>
              {AUDIT_LABEL[k]}
            </option>
          ))}
        </SelectField>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="shield" title="No entries">
          No action matches these criteria.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ivory-line">
          <div className="overflow-x-auto">
            <table className="data-table compact">
              <caption className="sr-only">Audit log</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((a) => (
                  <tr key={a.id}>
                    <td className="num whitespace-nowrap">{formatDateTime(a.at)}</td>
                    <td className="whitespace-nowrap">
                      {a.actor}
                      <div className="text-[12px] text-ink-muted">{ROLE_LABEL[a.role]}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <ToneBadge tone={a.action.startsWith("demo.") || a.action === "role.switched" ? "pending" : a.action.endsWith("failed") ? "danger" : "neutral"}>{AUDIT_LABEL[a.action]}</ToneBadge>
                    </td>
                    <td className="text-ink-soft">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} onPage={setPageNum} label="entries" />
        </div>
      )}
    </div>
  );
}

function DemoTab() {
  const data = useData();
  const role = useRole();
  const reset = usePspStore((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  const action = useAction(() => reset(), { success: "Demo reset: original data restored.", inlineError: true });
  const canReset = can(role, "demo.reset");

  async function onConfirm() {
    const out = await action.run();
    if (out.ok) setConfirm(false);
  }

  return (
    <div className="space-y-5">
      <Notice tone="sandbox" title="Local storage only">
        Data is kept in IndexedDB, in this browser: it persists after a refresh but is neither shared, nor backed up, nor
        secured server-side. Clearing the site data erases it.
      </Notice>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          ["Transactions", data.transactions.length],
          ["Customers", data.customers.length],
          ["Merchants", data.merchants.length],
          ["Settlement batches", data.settlements.length],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-ivory-line p-3">
            <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
            <dd className="num m-0 font-serif text-[22px] font-semibold">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-[13.5px] text-ink-muted">
        Dataset loaded on <span className="num">{formatDateTime(data.settings.seededAt)}</span> (version {data.settings.seedVersion}). It is reproducible:
        a reset recreates exactly the same entities, dated relative to today.
      </p>
      <div>
        <Button variant="accent" icon="refresh" disabled={!canReset} onClick={() => setConfirm(true)}>
          Reset the demo
        </Button>
        {!canReset && <p className="field-hint">Reserved for the "Administrator" role.</p>}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Reset all the data?"
        confirmLabel="Yes, reset"
        tone="danger"
        busy={action.busy}
        error={action.error}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void onConfirm()}
        message="All transactions, refunds, batches, created customers and audit entries will be replaced by the original demonstration dataset. This action is irreversible (fictitious data only)."
      />
    </div>
  );
}

export function Settings() {
  useDocumentTitle("Settings");
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as string) : "organization";

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} active={tab} onChange={(id) => setParams(id === "organization" ? new URLSearchParams() : new URLSearchParams({ tab: id }), { replace: true })} label="Settings sections" />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="card p-5">
        {tab === "organization" && <OrganizationTab />}
        {tab === "preferences" && <PreferencesTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "demo" && <DemoTab />}
      </div>
    </div>
  );
}
