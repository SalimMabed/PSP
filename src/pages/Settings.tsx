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
  { id: "organisation", label: "Organisation" },
  { id: "preferences", label: "Préférences" },
  { id: "roles", label: "Rôles et droits" },
  { id: "audit", label: "Journal d'audit" },
  { id: "demo", label: "Données de démo" },
];

const AUDIT_LABEL: Record<AuditAction, string> = {
  "payment.created": "Paiement créé",
  "payment.status_changed": "Statut modifié",
  "refund.created": "Remboursement",
  "settlement.created": "Lot généré",
  "settlement.settled": "Lot réglé",
  "settlement.failed": "Lot échoué",
  "settings.updated": "Paramètres modifiés",
  "role.switched": "Changement de rôle",
  "export.csv": "Export CSV",
  "demo.reset": "Démo réinitialisée",
  "demo.seeded": "Démo initialisée",
};

function OrganizationTab() {
  const data = useData();
  const role = useRole();
  const update = usePspStore((s) => s.updateOrganization);
  const editable = can(role, "settings.edit");
  const [values, setValues] = useState<OrganizationProfile>(data.settings.organization);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const action = useAction((profile: OrganizationProfile) => update(profile), { success: "Profil de l'organisation enregistré.", inlineError: true });

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
        <Notice tone="warning" title="Lecture seule">
          Le rôle « {ROLE_LABEL[role]} » ne peut pas modifier le profil de l'organisation. Passez au rôle « Administrateur » via le menu profil.
        </Notice>
      )}
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Profil de l'organisation">
        <TextField label="Nom commercial" required value={values.name} onChange={set("name")} error={errors.name} disabled={!editable} />
        <TextField label="Raison sociale (fictive)" required value={values.legalName} onChange={set("legalName")} error={errors.legalName} disabled={!editable} />
        <TextField label="E-mail de contact" type="email" required value={values.email} onChange={set("email")} error={errors.email} disabled={!editable} />
        <TextField label="Téléphone" inputMode="tel" value={values.phone} onChange={set("phone")} error={errors.phone} disabled={!editable} hint={`Affiché : ${formatPhone(values.phone)}`} />
        <TextField label="Ville" required value={values.city} onChange={set("city")} error={errors.city} disabled={!editable} />
        <TextField label="Identifiant fiscal (fictif)" value={values.taxId} onChange={set("taxId")} error={errors.taxId} disabled={!editable} hint="Valeur d'exemple : n'indiquez aucun identifiant réel." />
        {action.error && (
          <p role="alert" className="field-error sm:col-span-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {action.error}
          </p>
        )}
        {editable && (
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary" loading={action.busy}>
              Enregistrer
            </Button>
          </div>
        )}
      </form>
      <dl className="grid grid-cols-1 gap-3 border-t border-ivory-line pt-4 text-[14px] sm:grid-cols-3">
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Compte</dt>
          <dd className="m-0">Compte de démonstration (sandbox)</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Devise</dt>
          <dd className="m-0">DZD — Dinar algérien (DA), non modifiable</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Langue</dt>
          <dd className="m-0">Français (Algérie)</dd>
        </div>
      </dl>
    </div>
  );
}

function PreferencesTab() {
  const prefs = useData().settings.preferences;
  const update = usePspStore((s) => s.updatePreferences);
  const setPeriod = usePspStore((s) => s.setPeriod);
  const action = useAction((next: typeof prefs) => update(next), { success: "Préférences enregistrées." });

  return (
    <div className="max-w-xl space-y-5">
      <fieldset className="m-0 border-0 p-0">
        <legend className="field-label">Densité d'affichage des tableaux</legend>
        <div role="radiogroup" className="inline-flex rounded-xl border border-ivory-line bg-ivory-soft p-1">
          {([
            ["comfortable", "Confortable"],
            ["compact", "Compacte"],
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
        label="Lignes par page (listes)"
        value={String(prefs.pageSize)}
        onChange={(e) => void action.run({ ...prefs, pageSize: Number(e.target.value) as 10 | 25 | 50 })}
      >
        {[10, 25, 50].map((n) => (
          <option key={n} value={n}>
            {n} lignes
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Période par défaut"
        value={prefs.defaultPeriod}
        hint="Appliquée à l'ouverture de l'application et après une réinitialisation."
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
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Format des montants</dt>
          <dd className="num m-0">{formatDA(1_250_050)}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Fuseau horaire des dates</dt>
          <dd className="m-0">Algérie (UTC+1, sans heure d'été)</dd>
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
    pushToast("info", `Rôle de démonstration : ${ROLE_LABEL[r]}.`);
  });
  const permissions = Object.keys(PERMISSION_LABEL) as Permission[];
  const roles: Role[] = ["admin", "operator"];

  return (
    <div className="space-y-5">
      <Notice tone="sandbox" title="Gestion visuelle des rôles — sans authentification">
        Le changement de rôle est une simulation locale : il n'existe ni compte, ni mot de passe, ni contrôle serveur. En production, les droits sont portés par une
        identité authentifiée et vérifiés par le backend à chaque requête.
      </Notice>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <div key={r} className={`rounded-xl border-2 p-4 ${current === r ? "border-teal bg-teal-light" : "border-ivory-line"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-[15px] font-semibold">{ROLE_LABEL[r]}</p>
              {current === r && <ToneBadge tone="teal">Rôle actif</ToneBadge>}
            </div>
            <p className="m-0 text-[13px] text-ink-muted">
              {DEMO_USERS[r].name} · {DEMO_USERS[r].email}
            </p>
            <Button className="mt-3" size="sm" disabled={current === r || action.busy} onClick={() => void action.run(r)}>
              {current === r ? "Rôle actuel" : `Utiliser le rôle ${ROLE_LABEL[r].toLowerCase()}`}
            </Button>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-ivory-line">
        <table className="data-table compact">
          <caption className="sr-only">Matrice des droits par rôle</caption>
          <thead>
            <tr>
              <th scope="col">Droit</th>
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
                          <span className="sr-only">Autorisé</span>
                        </span>
                      ) : (
                        <span className="text-ink-muted" aria-label="Non autorisé">
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
      <p className="m-0 text-[13px] text-ink-muted">Plafond de remboursement unitaire pour l'opérateur : {formatDA(MAX_REFUND_OPERATOR)}.</p>
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
        Journal local des actions sensibles de la démonstration. Il peut être effacé à tout moment (réinitialisation) : ce n'est pas une piste d'audit probante.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="audit-search" className="field-label">
            Recherche
          </label>
          <input id="audit-search" type="search" className="field-input" value={q} placeholder="Acteur, référence, action…" onChange={(e) => { setQ(e.target.value); setPageNum(1); }} autoComplete="off" />
        </div>
        <SelectField label="Type d'action" value={kind} onChange={(e) => { setKind(e.target.value); setPageNum(1); }}>
          <option value="">Toutes les actions</option>
          {(Object.keys(AUDIT_LABEL) as AuditAction[]).map((k) => (
            <option key={k} value={k}>
              {AUDIT_LABEL[k]}
            </option>
          ))}
        </SelectField>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="shield" title="Aucune entrée">
          Aucune action ne correspond à ces critères.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ivory-line">
          <div className="overflow-x-auto">
            <table className="data-table compact">
              <caption className="sr-only">Journal d'audit</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Acteur</th>
                  <th scope="col">Action</th>
                  <th scope="col">Détail</th>
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
          <Pagination page={page} onPage={setPageNum} label="entrées" />
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
  const action = useAction(() => reset(), { success: "Démo réinitialisée : données d'origine restaurées.", inlineError: true });
  const canReset = can(role, "demo.reset");

  async function onConfirm() {
    const out = await action.run();
    if (out.ok) setConfirm(false);
  }

  return (
    <div className="space-y-5">
      <Notice tone="sandbox" title="Stockage local uniquement">
        Les données sont conservées dans IndexedDB, dans ce navigateur : elles persistent après actualisation mais ne sont ni partagées, ni sauvegardées, ni
        sécurisées côté serveur. Vider les données du site les efface.
      </Notice>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          ["Transactions", data.transactions.length],
          ["Clients", data.customers.length],
          ["Commerçants", data.merchants.length],
          ["Lots de règlement", data.settlements.length],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-ivory-line p-3">
            <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
            <dd className="num m-0 font-serif text-[22px] font-semibold">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-[13.5px] text-ink-muted">
        Jeu de données chargé le <span className="num">{formatDateTime(data.settings.seededAt)}</span> (version {data.settings.seedVersion}). Il est reproductible :
        la réinitialisation recrée exactement les mêmes entités, datées relativement à aujourd'hui.
      </p>
      <div>
        <Button variant="accent" icon="refresh" disabled={!canReset} onClick={() => setConfirm(true)}>
          Réinitialiser la démonstration
        </Button>
        {!canReset && <p className="field-hint">Réservé au rôle « Administrateur ».</p>}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Réinitialiser toutes les données ?"
        confirmLabel="Oui, réinitialiser"
        tone="danger"
        busy={action.busy}
        error={action.error}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void onConfirm()}
        message="Toutes les transactions, remboursements, lots, clients créés et entrées d'audit seront remplacés par le jeu de démonstration d'origine. Cette action est irréversible (données fictives uniquement)."
      />
    </div>
  );
}

export function Settings() {
  useDocumentTitle("Paramètres");
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as string) : "organisation";

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} active={tab} onChange={(id) => setParams(id === "organisation" ? new URLSearchParams() : new URLSearchParams({ tab: id }), { replace: true })} label="Sections des paramètres" />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="card p-5">
        {tab === "organisation" && <OrganizationTab />}
        {tab === "preferences" && <PreferencesTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "demo" && <DemoTab />}
      </div>
    </div>
  );
}
