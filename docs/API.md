# API REST — spécification illustrative

> **Statut : non implémentée.** Ce document décrit le contrat visé pour un futur backend du PSP. Le prototype actuel n'expose aucune API réseau : il utilise le contrat TypeScript `PspApi` (`src/services/api.ts`) sur IndexedDB. Les URL utilisent le domaine réservé `.example` (inexistant). Les clés sont **fictives**.

## Conventions

| Sujet | Règle |
|---|---|
| Base | `https://api.psp-sandbox.example/v1` (TLS obligatoire) |
| Authentification | `Authorization: Bearer <clé secrète>` ; clés `sk_test_…` (sandbox) / `sk_live_…` (production) créées et révoquées côté serveur |
| Idempotence | En-tête `Idempotency-Key` **obligatoire** sur tout `POST`. Même clé + même corps = même réponse, sans doublon. Même clé + corps différent = `409 idempotency_conflict` |
| Montants | Entiers en **centimes** (`1250000` = 12 500,00 DA), devise ISO 4217 `DZD`. Sandbox : 5 000 à 500 000 000 |
| Dates | ISO 8601, UTC |
| Pagination | Par curseur : `limit` (≤ 100), `starting_after` ; réponse `{ data, has_more, next_cursor }` |
| Erreurs | `{ "error": { "type", "code", "message", "request_id" } }` |

Valeurs d'exemple (fictives) : `pk_test_DEMO_00000000000000000000`, `sk_test_DEMO_NE_PAS_UTILISER_0000000000`, `whsec_DEMO_FICTIF_0000000000000000`. **Aucun secret ne doit jamais figurer dans un frontend.**

## Statuts d'un paiement

`created`, `pending`, `succeeded`, `failed`, `cancelled`, `partially_refunded`, `refunded`.

| Depuis | Vers (autorisé) |
|---|---|
| `created` | `pending`, `succeeded`, `failed`, `cancelled` |
| `pending` | `succeeded`, `failed`, `cancelled` |
| `succeeded` | `partially_refunded`, `refunded` (via un remboursement uniquement) |
| `partially_refunded` | `partially_refunded`, `refunded` (via un remboursement uniquement) |
| `failed`, `cancelled`, `refunded` | statuts finaux |

Le **serveur** est seul autorité : il calcule le solde remboursable, les commissions et refuse toute transition illégale (`422 invalid_transition`).

## Endpoints

### `POST /payments` — créer une demande de paiement

Corps : `merchant_id`, `amount`, `currency`, `order_reference`, `description`, `customer { name, email }`, `return_url`. Réponse `201` : le paiement (`status: "created"`) et `checkout_url` (page hébergée). Ne transmettez **jamais** de numéro de carte : la saisie se fait sur la page hébergée du prestataire.

### `GET /payments/{id}` — consulter un paiement

Retourne statut, montants (`amount`, `amount_refunded`, `fee`), méthode, dates et historique des statuts.

### `GET /payments` — lister

Filtres : `status`, `merchant_id`, `customer_id`, `created_gte`, `created_lte`, `amount_gte`, `amount_lte`, `q`, `limit`, `starting_after`.

### `POST /payments/{id}/refunds` — rembourser

Corps : `amount` (≤ solde remboursable), `reason` (`customer_request`, `product_issue`, `duplicate`, `fraud_suspected`, `other`), `note`. Réponse `201` : le remboursement et le nouveau `payment_status`. Dépassement : `422 refund_exceeds_remaining`.

### `GET /settlements` — lots de règlement

Retourne, par lot : `gross`, `refunds`, `fees`, `net`, `status` (`pending`, `settled`, `failed`).

## Webhooks

Événements : `payment.created`, `payment.pending`, `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.created`, `settlement.settled`, `settlement.failed`.

### Signature

```
PSP-Signature: t=<horodatage UNIX en secondes>,v1=<HMAC-SHA256 hexadécimal>
v1 = HMAC_SHA256(secret_webhook, "<t>.<corps brut>")
```

Vérification côté serveur du commerçant :

1. lire le **corps brut** (ne pas re-sérialiser le JSON) ;
2. rejeter si `|maintenant − t| > 300 s` (anti-rejeu) ;
3. recalculer le HMAC et comparer en **temps constant** ;
4. dédupliquer sur `event.id` (livraison « au moins une fois », ordre non garanti) ;
5. répondre `2xx` rapidement, traiter en asynchrone.

Le PSP relivre avec backoff exponentiel en cas d'échec. L'implémentation de référence en Node.js est affichée dans l'espace développeur de l'application (`/developpeurs`) et vérifiée par un test (`src/domain/webhook.test.ts`) contre `node:crypto`.

## Codes d'erreur

| HTTP | `code` | Signification |
|---|---|---|
| 400 | `invalid_request` | Paramètre manquant ou mal formé |
| 401 | `unauthorized` | Clé absente, invalide ou révoquée |
| 403 | `forbidden` | Action non autorisée pour cette clé |
| 404 | `not_found` | Ressource inexistante |
| 409 | `idempotency_conflict` | Même `Idempotency-Key` avec un corps différent |
| 422 | `invalid_transition` | Transition de statut interdite |
| 422 | `refund_exceeds_remaining` | Remboursement supérieur au solde remboursable |
| 429 | `rate_limited` | Trop de requêtes |

## Correspondance avec le prototype

| Contrat REST cible | Méthode `PspApi` (prototype) |
|---|---|
| `POST /payments` | `createPayment` |
| transitions de statut (réseau de paiement / page hébergée) | `simulateOutcome` |
| `POST /payments/{id}/refunds` | `refundPayment` |
| règlements | `generateSettlements`, `resolveSettlement` |

Pour passer en production : implémenter un `HttpPspApi` (même interface) appelant ce contrat avec une session authentifiée, et déplacer `src/domain/` côté serveur. Voir `PRODUCTION-CHECKLIST.md`.
