import { Link, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { ToneBadge } from "@/components/ui/Badges";
import { useAlerts, useData, useRole } from "@/hooks/useData";
import { useAction } from "@/hooks/useAction";
import { DEMO_USERS, ROLE_LABEL } from "@/domain/permissions";
import { PERIOD_KEYS, PERIOD_LABEL } from "@/domain/period";
import type { PeriodKey, Role } from "@/domain/types";
import { pageInfo } from "@/routes";
import { usePspStore } from "@/store/usePspStore";
import { initials } from "@/utils/format";

function PeriodSelect() {
  const period = usePspStore((s) => s.period);
  const setPeriod = usePspStore((s) => s.setPeriod);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="period-select" className="hidden text-[13px] font-semibold text-ink-muted xl:block">
        Période
      </label>
      <div className="relative">
        <Icon name="clock" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <select
          id="period-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          className="field-input field-select !min-h-[38px] !py-1 pl-9 text-[13.5px]"
          aria-label="Période d'analyse"
        >
          {PERIOD_KEYS.map((k) => (
            <option key={k} value={k}>
              {PERIOD_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const SEVERITY_TONE = { danger: "danger", warning: "pending", info: "neutral" } as const;
const SEVERITY_LABEL = { danger: "Critique", warning: "À surveiller", info: "Information" } as const;

function NotificationsMenu() {
  const alerts = useAlerts();
  return (
    <Popover
      triggerLabel={alerts.length ? `Notifications : ${alerts.length} alerte${alerts.length > 1 ? "s" : ""}` : "Notifications : aucune alerte"}
      triggerClassName="relative flex h-10 w-10 items-center justify-center rounded-full border border-ivory-line bg-white text-ink-soft hover:bg-ivory-soft"
      trigger={
        <>
          <Icon name="bell" size={19} />
          {alerts.length > 0 && (
            <span
              aria-hidden="true"
              className="num absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-1 text-[11px] font-bold text-white"
            >
              {alerts.length}
            </span>
          )}
        </>
      }
      panelClassName="w-[min(92vw,380px)]"
    >
      {(close) => (
        <div>
          <p className="border-b border-ivory-line px-4 py-3 text-sm font-semibold">Alertes</p>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">Aucune alerte pour le moment.</p>
          ) : (
            <ul className="m-0 max-h-[60vh] list-none divide-y divide-ivory-line overflow-y-auto p-0">
              {alerts.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="mb-1">
                    <ToneBadge tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</ToneBadge>
                  </div>
                  <p className="m-0 text-[14px] font-semibold leading-snug">{a.title}</p>
                  <p className="m-0 mt-0.5 text-[13px] text-ink-muted">{a.detail}</p>
                  <Link to={a.href} onClick={close} className="mt-1.5 inline-block text-[13px] font-semibold text-teal underline-offset-2 hover:underline">
                    {a.cta} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

function ProfileMenu() {
  const role = useRole();
  const data = useData();
  const user = DEMO_USERS[role];
  const switchRole = usePspStore((s) => s.switchRole);
  const pushToast = usePspStore((s) => s.pushToast);
  const action = useAction(async (next: Role) => {
    await switchRole(next);
    pushToast("info", `Rôle de démonstration : ${ROLE_LABEL[next]}. Les droits changent immédiatement.`);
  });

  return (
    <Popover
      triggerLabel={`Profil : ${user.name}, ${ROLE_LABEL[role]}`}
      triggerClassName="flex items-center gap-2 rounded-full border border-ivory-line bg-white py-1 pl-1 pr-3 hover:bg-ivory-soft"
      trigger={
        <>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-[12px] font-bold text-white">{initials(user.name)}</span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-[13px] font-semibold">{user.name}</span>
            <span className="block text-[11.5px] text-ink-muted">{ROLE_LABEL[role]}</span>
          </span>
          <Icon name="chevron-down" size={14} className="hidden text-ink-muted md:block" />
        </>
      }
      panelClassName="w-[min(92vw,300px)]"
    >
      {(close) => (
        <div className="p-4">
          <p className="m-0 text-sm font-semibold">{user.name}</p>
          <p className="m-0 text-[12.5px] text-ink-muted">{user.email}</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">{data.settings.organization.name}</p>
          <fieldset className="m-0 mt-3 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Rôle de démonstration</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["admin", "operator"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  disabled={action.busy}
                  onClick={() => void action.run(r)}
                  className={`rounded-lg border px-2 py-2 text-[13px] font-semibold transition-colors ${
                    role === r ? "border-teal bg-teal-light text-teal" : "border-ivory-line bg-white text-ink-soft hover:bg-ivory-soft"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-ink-muted">
              Simulation sans authentification : aucun contrôle de sécurité réel côté navigateur.
            </p>
          </fieldset>
          <Link to="/parametres" onClick={close} className="btn btn-secondary btn-sm mt-3 w-full">
            <Icon name="settings" size={15} />
            Paramètres et journal d'audit
          </Link>
        </div>
      )}
    </Popover>
  );
}

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { pathname } = useLocation();
  const info = pageInfo(pathname);
  return (
    <header className="sticky top-0 z-30 border-b border-ivory-line bg-ivory/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Ouvrir le menu de navigation"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ivory-line bg-white text-ink-soft hover:bg-ivory-soft lg:hidden"
        >
          <Icon name="menu" size={19} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[20px] font-semibold sm:text-[22px]">{info.title}</h1>
        {info.usesPeriod && <PeriodSelect />}
        <NotificationsMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}
