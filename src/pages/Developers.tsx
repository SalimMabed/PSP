import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CodeBlock, CopyButton, Notice, Section } from "@/components/ui/Blocks";
import { ToneBadge } from "@/components/ui/Badges";
import { Icon } from "@/components/ui/Icon";
import { useDocumentTitle } from "@/hooks/useData";
import {
  API_BASE_URL,
  ENDPOINTS,
  ERROR_CODES,
  ERROR_EXAMPLE,
  WEBHOOK_EVENTS,
  WEBHOOK_PAYLOAD,
  WEBHOOK_VERIFY_NODE,
} from "@/data/apiSpec";
import { ALL_STATUSES, ALLOWED_TRANSITIONS, STATUS_DESCRIPTION, STATUS_LABEL, STATUS_TONE } from "@/domain/status";
import { DEMO_API_KEYS, signWebhook } from "@/domain/webhook";
import { MAX_PAYMENT, MIN_PAYMENT } from "@/domain/money";

const TOC = [
  { id: "apercu", label: "Aperçu" },
  { id: "cles", label: "Clés fictives" },
  { id: "auth", label: "Authentification" },
  { id: "endpoints", label: "Endpoints" },
  { id: "statuts", label: "Cycle de vie" },
  { id: "webhooks", label: "Webhooks signés" },
  { id: "erreurs", label: "Erreurs" },
  { id: "limites", label: "Limites et production" },
];

const METHOD_TONE = { GET: "success", POST: "refund" } as const;

function WebhookDemo() {
  const body = JSON.stringify(WEBHOOK_PAYLOAD);
  const [signature, setSignature] = useState<string>("Calcul de la signature…");
  const timestamp = WEBHOOK_PAYLOAD.created;

  useEffect(() => {
    let cancelled = false;
    if (!globalThis.crypto?.subtle) {
      setSignature("Web Crypto indisponible dans ce contexte (HTTPS ou localhost requis).");
      return;
    }
    signWebhook(DEMO_API_KEYS.webhookSecret, timestamp, body)
      .then((s) => !cancelled && setSignature(s))
      .catch(() => !cancelled && setSignature("Impossible de calculer la signature."));
    return () => {
      cancelled = true;
    };
  }, [body, timestamp]);

  return (
    <div className="space-y-4">
      <CodeBlock label="Corps de l'événement (brut)" language="json" code={JSON.stringify(WEBHOOK_PAYLOAD, null, 2)} />
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">En-tête envoyé par le serveur (calculé ici avec le secret FICTIF)</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="num block max-w-full overflow-x-auto rounded-lg bg-ivory-soft px-3 py-2 text-[12.5px]">PSP-Signature: {signature}</code>
          <CopyButton value={`PSP-Signature: ${signature}`} />
        </div>
        <p className="mt-2 text-[12.5px] text-ink-muted">
          Cette signature est calculée dans votre navigateur uniquement pour illustrer l'algorithme, avec un secret d'exemple. En production, la signature est
          produite par le serveur du PSP et vérifiée par le serveur du commerçant — jamais côté navigateur.
        </p>
      </div>
      <CodeBlock label="Vérification côté serveur du commerçant" language="node.js" code={WEBHOOK_VERIFY_NODE} />
    </div>
  );
}

export function Developers() {
  useDocumentTitle("Espace développeur");

  return (
    <div className="space-y-6">
      <nav aria-label="Sommaire de la documentation" className="card flex flex-wrap gap-x-5 gap-y-2 px-5 py-3 text-[13.5px]">
        {TOC.map((t) => (
          <Link key={t.id} to={`#${t.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
            {t.label}
          </Link>
        ))}
      </nav>

      <Section id="apercu" title="Aperçu de l'intégration" description="Spécification illustrative — aucune API n'est exposée par ce prototype">
        <Notice tone="sandbox" title="Ce que ce prototype n'est pas">
          Aucun serveur, aucune API réelle, aucun prestataire de paiement ni acquéreur n'est connecté. Cette page décrit le contrat visé pour un futur backend ;
          les exemples ci-dessous ne peuvent pas être exécutés contre ce projet.
        </Notice>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["1. Créer", "Votre serveur appelle POST /payments avec le montant (en centimes), la commande et le client. Vous recevez un checkout_url."],
            ["2. Encaisser", "Le client est redirigé vers la page hébergée du PSP. Vos pages ne manipulent jamais de données de carte."],
            ["3. Être notifié", "Le PSP vous notifie par webhook signé (payment.succeeded, refund.created…). Vous vérifiez la signature, puis mettez à jour la commande."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-ivory-line p-4">
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <p className="m-0 mt-1.5 text-[13.5px] text-ink-muted">{text}</p>
            </div>
          ))}
        </div>
        <p className="m-0 mt-4 text-[13.5px] text-ink-muted">
          URL de base illustrative : <code className="num rounded bg-ivory-soft px-1.5 py-0.5">{API_BASE_URL}</code> (domaine réservé « .example », inexistant).
        </p>
      </Section>

      <Section id="cles" title="Clés d'API (fictives)" description="Valeurs d'exemple sans aucune valeur d'accès">
        <div className="overflow-x-auto">
          <table className="data-table compact">
            <caption className="sr-only">Clés d'exemple</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Valeur d'exemple</th>
                <th scope="col">Où l'utiliser</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Clé publique", DEMO_API_KEYS.publishable, "Navigateur / application mobile (identifie le compte, ne donne aucun pouvoir)."],
                ["Clé secrète", DEMO_API_KEYS.secret, "Serveur uniquement. Jamais dans un frontend, un dépôt Git ou un journal."],
                ["Secret de webhook", DEMO_API_KEYS.webhookSecret, "Serveur uniquement : signature et vérification des webhooks."],
              ].map(([type, value, where]) => (
                <tr key={type}>
                  <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-semibold">
                    {type}
                  </th>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <code className="num text-[12.5px]">{value}</code>
                      <CopyButton value={value} />
                    </span>
                  </td>
                  <td className="text-ink-muted">{where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Notice tone="warning" title="Aucun secret dans le frontend">
            Ces valeurs sont inventées et n'ouvrent l'accès à rien. Dans une vraie intégration, les clés secrètes sont créées par le serveur, stockées dans un
            gestionnaire de secrets, rotatives et révocables.
          </Notice>
        </div>
      </Section>

      <Section id="auth" title="Authentification, idempotence et conventions">
        <ul className="m-0 space-y-2.5 pl-5 text-[14px] text-ink-soft">
          <li>
            <strong>Authentification :</strong> <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">Authorization: Bearer &lt;clé secrète&gt;</code>, TLS
            obligatoire.
          </li>
          <li>
            <strong>Idempotence :</strong> toute écriture (<code className="text-[12.5px]">POST</code>) porte un en-tête{" "}
            <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">Idempotency-Key</code>. Rejeu avec la même clé et le même corps = même réponse, sans doublon ;
            même clé avec un corps différent = <code className="text-[12.5px]">409</code>.
          </li>
          <li>
            <strong>Montants :</strong> entiers en centimes (<code className="text-[12.5px]">1250000</code> = 12 500,00 DA), devise <code className="text-[12.5px]">DZD</code>. Limites sandbox :{" "}
            {MIN_PAYMENT} à {MAX_PAYMENT.toLocaleString("fr-FR")}.
          </li>
          <li>
            <strong>Dates :</strong> ISO 8601 en UTC. <strong>Pagination :</strong> par curseur (<code className="text-[12.5px]">starting_after</code>, <code className="text-[12.5px]">limit</code>).
          </li>
        </ul>
      </Section>

      <section id="endpoints" aria-labelledby="endpoints-title" className="space-y-4">
        <h2 id="endpoints-title" className="text-[20px] font-semibold">
          Endpoints
        </h2>
        {ENDPOINTS.map((e) => (
          <article key={e.id} id={e.id} className="card p-5" aria-labelledby={`${e.id}-title`}>
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge tone={METHOD_TONE[e.method]}>{e.method}</ToneBadge>
              <h3 id={`${e.id}-title`} className="num font-mono text-[15px] font-semibold">
                {e.path}
              </h3>
            </div>
            <p className="m-0 mt-2 text-[14px] text-ink-soft">{e.summary}</p>
            {e.notes && (
              <ul className="m-0 mt-2 space-y-1 pl-5 text-[13.5px] text-ink-muted">
                {e.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {e.request && <CodeBlock label={e.request.label} language={e.request.language} code={e.request.code} />}
              <CodeBlock label={`Réponse ${e.response.status}`} language="json" code={e.response.code} />
            </div>
          </article>
        ))}
      </section>

      <Section id="statuts" title="Cycle de vie d'un paiement" description="Transitions autorisées — mêmes règles que le prototype">
        <div className="overflow-x-auto">
          <table className="data-table compact">
            <caption className="sr-only">Statuts et transitions autorisées</caption>
            <thead>
              <tr>
                <th scope="col">Statut</th>
                <th scope="col">Signification</th>
                <th scope="col">Transitions possibles</th>
              </tr>
            </thead>
            <tbody>
              {ALL_STATUSES.map((s) => (
                <tr key={s}>
                  <td>
                    <ToneBadge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</ToneBadge>
                    <div className="num mt-1 text-[11.5px] text-ink-muted">{s}</div>
                  </td>
                  <td className="text-ink-soft">{STATUS_DESCRIPTION[s]}</td>
                  <td>
                    {ALLOWED_TRANSITIONS[s].length === 0 ? (
                      <span className="text-ink-muted">Statut final</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {ALLOWED_TRANSITIONS[s].map((t) => (
                          <ToneBadge key={t} tone={STATUS_TONE[t]}>
                            {STATUS_LABEL[t]}
                          </ToneBadge>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-3 text-[13px] text-ink-muted">
          Les statuts « remboursé » s'obtiennent uniquement via un remboursement ; le solde remboursable est toujours recalculé côté serveur.
        </p>
      </Section>

      <Section id="webhooks" title="Webhooks signés" description="Modèle à implémenter côté serveur">
        <div className="overflow-x-auto">
          <table className="data-table compact">
            <caption className="sr-only">Événements webhook</caption>
            <thead>
              <tr>
                <th scope="col">Événement</th>
                <th scope="col">Déclencheur</th>
              </tr>
            </thead>
            <tbody>
              {WEBHOOK_EVENTS.map((ev) => (
                <tr key={ev.type}>
                  <td className="num font-mono text-[13px] font-semibold">{ev.type}</td>
                  <td className="text-ink-soft">{ev.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="m-0 mt-4 space-y-1.5 pl-5 text-[13.5px] text-ink-soft">
          <li>
            Signature : <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">HMAC-SHA256(secret, "&lt;t&gt;.&lt;corps brut&gt;")</code> en hexadécimal, dans l'en-tête{" "}
            <code className="text-[12.5px]">PSP-Signature: t=…,v1=…</code>.
          </li>
          <li>Vérifier la tolérance d'horloge (5 min), comparer en temps constant, dédupliquer sur <code className="text-[12.5px]">event.id</code>, répondre 2xx rapidement.</li>
          <li>Relivraison avec backoff exponentiel en cas d'échec ; les événements peuvent arriver dans le désordre.</li>
        </ul>
        <div className="mt-5">
          <WebhookDemo />
        </div>
      </Section>

      <Section id="erreurs" title="Erreurs">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <CodeBlock label="Format d'erreur" language="json" code={ERROR_EXAMPLE} />
          <div className="overflow-x-auto">
            <table className="data-table compact">
              <caption className="sr-only">Codes d'erreur</caption>
              <thead>
                <tr>
                  <th scope="col">HTTP</th>
                  <th scope="col">code</th>
                  <th scope="col">Signification</th>
                </tr>
              </thead>
              <tbody>
                {ERROR_CODES.map((c) => (
                  <tr key={`${c.status}-${c.code}`}>
                    <td className="num font-semibold">{c.status}</td>
                    <td className="num font-mono text-[12.5px]">{c.code}</td>
                    <td className="text-ink-soft">{c.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="limites" title="Limites du prototype et prérequis de production">
        <Notice tone="warning" title="Ce prototype n'est ni agréé, ni certifié, ni prêt pour de vrais paiements">
          Les contrôles côté navigateur et le stockage local (IndexedDB) ne fournissent aucune sécurité serveur : tout utilisateur peut les modifier. Aucune conformité
          réglementaire n'est revendiquée.
        </Notice>
        <ul className="m-0 mt-4 grid grid-cols-1 gap-x-8 gap-y-2 pl-5 text-[13.5px] text-ink-soft md:grid-cols-2">
          {[
            "Backend autoritaire : seul le serveur calcule statuts, soldes, remboursements et règlements",
            "Authentification forte (MFA) et autorisations par rôle appliquées côté serveur",
            "Idempotence persistante et verrouillage des écritures concurrentes",
            "Journalisation immuable et traçabilité (qui / quoi / quand)",
            "Chiffrement en transit et au repos ; gestion et rotation des secrets (KMS / HSM)",
            "Webhooks signés, relivrables, dédupliqués ; protection anti-rejeu",
            "Rapprochement bancaire quotidien avec les relevés de l'acquéreur / banque partenaire",
            "Prévention de la fraude, limites, KYC / KYB des commerçants, lutte anti-blanchiment",
            "Cadre légal et réglementaire applicable en Algérie (autorisation de l'activité de paiement, supervision bancaire, protection des données personnelles, sécurité des données de carte)",
            "Intégration à un prestataire / acquéreur réel via sa documentation et ses accès contractuels",
          ].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="m-0 mt-4 flex items-center gap-2 text-[13px] text-ink-muted">
          <Icon name="info" size={15} />
          Le détail figure dans <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">docs/PRODUCTION-CHECKLIST.md</code> et <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">docs/API.md</code> du dépôt.
        </p>
      </Section>
    </div>
  );
}
