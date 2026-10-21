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
  { id: "overview", label: "Overview" },
  { id: "keys", label: "Fictitious keys" },
  { id: "auth", label: "Authentication" },
  { id: "endpoints", label: "Endpoints" },
  { id: "lifecycle", label: "Lifecycle" },
  { id: "webhooks", label: "Signed webhooks" },
  { id: "errors", label: "Errors" },
  { id: "limits", label: "Limitations and production" },
];

const METHOD_TONE = { GET: "success", POST: "refund" } as const;

function WebhookDemo() {
  const body = JSON.stringify(WEBHOOK_PAYLOAD);
  const [signature, setSignature] = useState<string>("Computing the signature…");
  const timestamp = WEBHOOK_PAYLOAD.created;

  useEffect(() => {
    let cancelled = false;
    if (!globalThis.crypto?.subtle) {
      setSignature("Web Crypto is unavailable in this context (HTTPS or localhost required).");
      return;
    }
    signWebhook(DEMO_API_KEYS.webhookSecret, timestamp, body)
      .then((s) => !cancelled && setSignature(s))
      .catch(() => !cancelled && setSignature("Unable to compute the signature."));
    return () => {
      cancelled = true;
    };
  }, [body, timestamp]);

  return (
    <div className="space-y-4">
      <CodeBlock label="Event body (raw)" language="json" code={JSON.stringify(WEBHOOK_PAYLOAD, null, 2)} />
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">Header sent by the server (computed here with the FICTITIOUS secret)</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="num block max-w-full overflow-x-auto rounded-lg bg-ivory-soft px-3 py-2 text-[12.5px]">PSP-Signature: {signature}</code>
          <CopyButton value={`PSP-Signature: ${signature}`} />
        </div>
        <p className="mt-2 text-[12.5px] text-ink-muted">
          This signature is computed in your browser only to illustrate the algorithm, with an example secret. In production, the signature is
          produced by the PSP's server and verified by the merchant's server — never in the browser.
        </p>
      </div>
      <CodeBlock label="Verification on the merchant's server" language="node.js" code={WEBHOOK_VERIFY_NODE} />
    </div>
  );
}

export function Developers() {
  useDocumentTitle("Developer area");

  return (
    <div className="space-y-6">
      <nav aria-label="Documentation contents" className="card flex flex-wrap gap-x-5 gap-y-2 px-5 py-3 text-[13.5px]">
        {TOC.map((t) => (
          <Link key={t.id} to={`#${t.id}`} className="font-semibold text-teal underline-offset-2 hover:underline">
            {t.label}
          </Link>
        ))}
      </nav>

      <Section id="overview" title="Integration overview" description="Illustrative specification — this prototype exposes no API">
        <Notice tone="sandbox" title="What this prototype is not">
          No server, no real API, no payment provider and no acquirer is connected. This page describes the contract targeted for a future backend;
          the examples below cannot be executed against this project.
        </Notice>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["1. Create", "Your server calls POST /payments with the amount (in centimes), the order and the customer. You receive a checkout_url."],
            ["2. Collect", "The customer is redirected to the PSP's hosted page. Your pages never handle card data."],
            ["3. Get notified", "The PSP notifies you with a signed webhook (payment.succeeded, refund.created…). You verify the signature, then update the order."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-ivory-line p-4">
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <p className="m-0 mt-1.5 text-[13.5px] text-ink-muted">{text}</p>
            </div>
          ))}
        </div>
        <p className="m-0 mt-4 text-[13.5px] text-ink-muted">
          Illustrative base URL: <code className="num rounded bg-ivory-soft px-1.5 py-0.5">{API_BASE_URL}</code> (reserved ".example" domain, non-existent).
        </p>
      </Section>

      <Section id="keys" title="API keys (fictitious)" description="Example values with no access value whatsoever">
        <div className="overflow-x-auto">
          <table className="data-table compact">
            <caption className="sr-only">Example keys</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Example value</th>
                <th scope="col">Where to use it</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Publishable key", DEMO_API_KEYS.publishable, "Browser / mobile app (identifies the account, grants no power)."],
                ["Secret key", DEMO_API_KEYS.secret, "Server only. Never in a frontend, a Git repository or a log."],
                ["Webhook secret", DEMO_API_KEYS.webhookSecret, "Server only: signing and verification of webhooks."],
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
          <Notice tone="warning" title="No secret in the frontend">
            These values are made up and open access to nothing. In a real integration, secret keys are created by the server, stored in a
            secrets manager, rotated and revocable.
          </Notice>
        </div>
      </Section>

      <Section id="auth" title="Authentication, idempotency and conventions">
        <ul className="m-0 space-y-2.5 pl-5 text-[14px] text-ink-soft">
          <li>
            <strong>Authentication:</strong> <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">Authorization: Bearer &lt;secret key&gt;</code>, TLS
            required.
          </li>
          <li>
            <strong>Idempotency:</strong> every write (<code className="text-[12.5px]">POST</code>) carries an{" "}
            <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">Idempotency-Key</code> header. Replay with the same key and the same body = same response, no duplicate;
            same key with a different body = <code className="text-[12.5px]">409</code>.
          </li>
          <li>
            <strong>Amounts:</strong> integers in centimes (<code className="text-[12.5px]">1250000</code> = 12 500.00 DA), currency <code className="text-[12.5px]">DZD</code>. Sandbox limits:{" "}
            {MIN_PAYMENT} to {MAX_PAYMENT.toLocaleString("fr-FR")} (centimes).
          </li>
          <li>
            <strong>Dates:</strong> ISO 8601 in UTC. <strong>Pagination:</strong> cursor-based (<code className="text-[12.5px]">starting_after</code>, <code className="text-[12.5px]">limit</code>).
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
              <CodeBlock label={`Response ${e.response.status}`} language="json" code={e.response.code} />
            </div>
          </article>
        ))}
      </section>

      <Section id="lifecycle" title="Payment lifecycle" description="Allowed transitions — same rules as the prototype">
        <div className="overflow-x-auto">
          <table className="data-table compact">
            <caption className="sr-only">Statuses and allowed transitions</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Meaning</th>
                <th scope="col">Possible transitions</th>
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
                      <span className="text-ink-muted">Final status</span>
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
          "Refunded" statuses are only reached through a refund; the refundable balance is always recomputed server-side.
        </p>
      </Section>

      <Section id="webhooks" title="Signed webhooks" description="Model to implement server-side">
        <div className="overflow-x-auto">
          <table className="data-table compact">
            <caption className="sr-only">Webhook events</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Trigger</th>
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
            Signature: <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">HMAC-SHA256(secret, "&lt;t&gt;.&lt;raw body&gt;")</code> in hexadecimal, in the{" "}
            <code className="text-[12.5px]">PSP-Signature: t=…,v1=…</code> header.
          </li>
          <li>Check the clock tolerance (5 min), compare in constant time, deduplicate on <code className="text-[12.5px]">event.id</code>, answer 2xx quickly.</li>
          <li>Redelivery with exponential backoff on failure; events may arrive out of order.</li>
        </ul>
        <div className="mt-5">
          <WebhookDemo />
        </div>
      </Section>

      <Section id="errors" title="Errors">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <CodeBlock label="Error format" language="json" code={ERROR_EXAMPLE} />
          <div className="overflow-x-auto">
            <table className="data-table compact">
              <caption className="sr-only">Error codes</caption>
              <thead>
                <tr>
                  <th scope="col">HTTP</th>
                  <th scope="col">code</th>
                  <th scope="col">Meaning</th>
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

      <Section id="limits" title="Prototype limitations and production prerequisites">
        <Notice tone="warning" title="This prototype is not licensed, not certified and not ready for real payments">
          Browser-side controls and local storage (IndexedDB) provide no server-side security: any user can modify them. No regulatory
          compliance is claimed.
        </Notice>
        <ul className="m-0 mt-4 grid grid-cols-1 gap-x-8 gap-y-2 pl-5 text-[13.5px] text-ink-soft md:grid-cols-2">
          {[
            "Authoritative backend: only the server computes statuses, balances, refunds and settlements",
            "Strong authentication (MFA) and role-based authorization enforced server-side",
            "Persistent idempotency and locking of concurrent writes",
            "Immutable logging and traceability (who / what / when)",
            "Encryption in transit and at rest; secrets management and rotation (KMS / HSM)",
            "Signed, redeliverable, deduplicated webhooks; anti-replay protection",
            "Daily bank reconciliation with the acquirer / partner bank statements",
            "Fraud prevention, limits, merchant KYC / KYB, anti-money-laundering",
            "Legal and regulatory framework applicable in Algeria (authorization of payment activity, banking supervision, personal data protection, card data security)",
            "Integration with a real provider / acquirer through its documentation and contractual access",
          ].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="m-0 mt-4 flex items-center gap-2 text-[13px] text-ink-muted">
          <Icon name="info" size={15} />
          The details are in <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">docs/PRODUCTION-CHECKLIST.md</code> and <code className="rounded bg-ivory-soft px-1.5 py-0.5 text-[12.5px]">docs/API.md</code> in the repository.
        </p>
      </Section>
    </div>
  );
}
