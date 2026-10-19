/**
 * Spécification d'API REST ILLUSTRATIVE (non implémentée).
 * Elle décrit le contrat visé pour un futur backend ; le prototype actuel n'expose aucune API réseau.
 * Les montants sont des entiers en centimes (unité mineure), devise ISO 4217 « DZD ».
 */

export interface Endpoint {
  id: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  notes?: string[];
  request?: { label: string; language: string; code: string };
  response: { status: string; code: string };
}

export const API_BASE_URL = "https://api.psp-sandbox.example/v1";

export const ENDPOINTS: Endpoint[] = [
  {
    id: "create-payment",
    method: "POST",
    path: "/payments",
    summary: "Crée une demande de paiement et renvoie le lien de la page hébergée.",
    notes: [
      "En-tête Idempotency-Key obligatoire : un rejeu avec la même clé renvoie la même réponse sans créer de doublon.",
      "amount est un entier en centimes (1 250 000 = 12 500,00 DA). Limites sandbox : 5 000 à 500 000 000.",
      "Ne transmettez jamais de numéro de carte : la saisie se fait sur la page hébergée du prestataire.",
    ],
    request: {
      label: "Requête",
      language: "bash",
      code: `curl -X POST ${API_BASE_URL}/payments \\
  -H "Authorization: Bearer sk_test_DEMO_NE_PAS_UTILISER_0000000000" \\
  -H "Idempotency-Key: 6b0c1f1e-2c3d-4a8e-9b7a-1d2e3f4a5b6c" \\
  -H "Content-Type: application/json" \\
  -d '{
    "merchant_id": "mrc_001",
    "amount": 1250000,
    "currency": "DZD",
    "order_reference": "CMD-20261019-A7K2",
    "description": "Abonnement trimestriel",
    "customer": { "name": "Amine Benali", "email": "amine.benali@client-demo.example" },
    "return_url": "https://boutique.example/commande/CMD-20261019-A7K2"
  }'`,
    },
    response: {
      status: "201 Created",
      code: `{
  "id": "txn_01HZX3QK8M2V",
  "object": "payment",
  "reference": "PAY-7K3M9Q2X",
  "status": "created",
  "amount": 1250000,
  "currency": "DZD",
  "amount_refunded": 0,
  "order_reference": "CMD-20261019-A7K2",
  "checkout_url": "https://pay.psp-sandbox.example/pay/xq4k8m2n7p3r5t6v9w2y4z6a",
  "livemode": false,
  "created_at": "2026-10-19T09:30:00Z"
}`,
    },
  },
  {
    id: "get-payment",
    method: "GET",
    path: "/payments/{id}",
    summary: "Retourne un paiement, son statut courant et son historique.",
    response: {
      status: "200 OK",
      code: `{
  "id": "txn_01HZX3QK8M2V",
  "reference": "PAY-7K3M9Q2X",
  "status": "partially_refunded",
  "amount": 1250000,
  "amount_refunded": 300000,
  "currency": "DZD",
  "method": "cib_sandbox",
  "fee": 23750,
  "paid_at": "2026-10-19T09:31:12Z",
  "history": [
    { "at": "2026-10-19T09:30:00Z", "from": null, "to": "created" },
    { "at": "2026-10-19T09:31:12Z", "from": "created", "to": "succeeded" },
    { "at": "2026-10-20T08:02:41Z", "from": "succeeded", "to": "partially_refunded" }
  ]
}`,
    },
  },
  {
    id: "list-payments",
    method: "GET",
    path: "/payments",
    summary: "Liste paginée (curseur) avec filtres.",
    notes: ["Paramètres : status, merchant_id, customer_id, created_gte, created_lte, amount_gte, amount_lte, q, limit (≤ 100), starting_after."],
    request: { label: "Requête", language: "bash", code: `curl "${API_BASE_URL}/payments?status=failed&created_gte=2026-10-01&limit=25" \\\n  -H "Authorization: Bearer sk_test_DEMO_NE_PAS_UTILISER_0000000000"` },
    response: {
      status: "200 OK",
      code: `{
  "object": "list",
  "data": [ { "id": "txn_01HZX3QK8M2V", "status": "failed", "amount": 480000, "currency": "DZD" } ],
  "has_more": true,
  "next_cursor": "txn_01HZX3QK8M2V"
}`,
    },
  },
  {
    id: "create-refund",
    method: "POST",
    path: "/payments/{id}/refunds",
    summary: "Rembourse tout ou partie d'un paiement encaissé.",
    notes: [
      "amount ≤ montant encore remboursable ; sinon 422 refund_exceeds_remaining.",
      "Idempotency-Key obligatoire. Le calcul du solde remboursable est effectué par le serveur, jamais par le client.",
    ],
    request: {
      label: "Requête",
      language: "bash",
      code: `curl -X POST ${API_BASE_URL}/payments/txn_01HZX3QK8M2V/refunds \\
  -H "Authorization: Bearer sk_test_DEMO_NE_PAS_UTILISER_0000000000" \\
  -H "Idempotency-Key: 0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 300000, "reason": "customer_request", "note": "Retour produit" }'`,
    },
    response: {
      status: "201 Created",
      code: `{
  "id": "rfd_01HZX5B7C3D9",
  "reference": "RFD-4N8P2Q6S",
  "payment_id": "txn_01HZX3QK8M2V",
  "amount": 300000,
  "fee_reversed": 5700,
  "reason": "customer_request",
  "payment_status": "partially_refunded",
  "created_at": "2026-10-20T08:02:41Z"
}`,
    },
  },
  {
    id: "list-settlements",
    method: "GET",
    path: "/settlements",
    summary: "Lots de règlement d'un commerçant (montants bruts, remboursements, commissions, net).",
    response: {
      status: "200 OK",
      code: `{
  "object": "list",
  "data": [
    {
      "id": "stl_01HZX9A2B4C6",
      "reference": "STL-8R5T2W9X",
      "merchant_id": "mrc_001",
      "status": "settled",
      "gross": 8450000,
      "refunds": 300000,
      "fees": 154850,
      "net": 7995150,
      "currency": "DZD"
    }
  ],
  "has_more": false
}`,
    },
  },
];

export const ERROR_EXAMPLE = `{
  "error": {
    "type": "invalid_request_error",
    "code": "refund_exceeds_remaining",
    "message": "Le montant dépasse le solde remboursable (9 500,00 DA).",
    "request_id": "req_01HZXA0K3M7N"
  }
}`;

export const ERROR_CODES: { status: string; code: string; meaning: string }[] = [
  { status: "400", code: "invalid_request", meaning: "Paramètre manquant ou mal formé (montant non entier, devise inconnue…)." },
  { status: "401", code: "unauthorized", meaning: "Clé d'API absente, invalide ou révoquée." },
  { status: "403", code: "forbidden", meaning: "La clé n'a pas le droit d'effectuer cette action." },
  { status: "404", code: "not_found", meaning: "Ressource inexistante." },
  { status: "409", code: "idempotency_conflict", meaning: "Même Idempotency-Key réutilisée avec un corps différent." },
  { status: "422", code: "invalid_transition", meaning: "Transition de statut interdite (ex. échoué → réussi)." },
  { status: "422", code: "refund_exceeds_remaining", meaning: "Remboursement supérieur au solde remboursable." },
  { status: "429", code: "rate_limited", meaning: "Trop de requêtes ; réessayez après le délai indiqué." },
];

export const WEBHOOK_EVENTS: { type: string; description: string }[] = [
  { type: "payment.created", description: "Une demande de paiement a été créée." },
  { type: "payment.pending", description: "Le client a lancé le paiement, confirmation attendue." },
  { type: "payment.succeeded", description: "Le paiement a été encaissé." },
  { type: "payment.failed", description: "Le paiement a été refusé." },
  { type: "payment.cancelled", description: "La demande a été annulée." },
  { type: "refund.created", description: "Un remboursement (partiel ou total) a été enregistré." },
  { type: "settlement.settled", description: "Un lot de règlement a été réglé." },
  { type: "settlement.failed", description: "Un lot de règlement a échoué ; les montants sont libérés." },
];

export const WEBHOOK_PAYLOAD = {
  id: "evt_01HZXB2C4D6E",
  type: "payment.succeeded",
  created: 1_760_866_272,
  livemode: false,
  data: {
    id: "txn_01HZX3QK8M2V",
    reference: "PAY-7K3M9Q2X",
    status: "succeeded",
    amount: 1_250_000,
    currency: "DZD",
    order_reference: "CMD-20261019-A7K2",
  },
};

export const WEBHOOK_VERIFY_NODE = `// À exécuter CÔTÉ SERVEUR uniquement (le secret ne doit jamais atteindre un navigateur).
import crypto from "node:crypto";
import express from "express";

const app = express();
const WEBHOOK_SECRET = process.env.PSP_WEBHOOK_SECRET; // stocké dans un gestionnaire de secrets
const TOLERANCE_SECONDS = 300;

// Il faut le corps BRUT : signer le JSON re-sérialisé casserait la vérification.
app.post("/webhooks/psp", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("PSP-Signature") ?? "";           // t=1760866272,v1=ab12…
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) return res.sendStatus(400);
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return res.sendStatus(400); // anti-rejeu

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body.toString("utf8")}\`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);

  const event = JSON.parse(req.body.toString("utf8"));
  // 1) dédupliquer sur event.id (les webhooks peuvent être livrés plusieurs fois)
  // 2) traiter de façon asynchrone, répondre 2xx rapidement
  res.sendStatus(200);
});`;
