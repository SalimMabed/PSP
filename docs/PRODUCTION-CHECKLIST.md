# Passer de ce MVP à un PSP de production — checklist

> Ce prototype **n'est pas** un produit prêt à traiter des paiements réels. Cette liste recense ce qui manque. Elle n'est pas un avis juridique ; les exigences applicables doivent être confirmées par les autorités et conseils compétents.

## 1. Cadre légal et réglementaire (Algérie) — à établir en premier

- [ ] Déterminer **quelle autorisation, quel agrément ou quel statut** est requis pour l'activité envisagée (agrégation / acquisition de paiements, monnaie électronique, passerelle technique pour le compte d'une banque…), et **quel régulateur** supervise (Banque d'Algérie, banques partenaires, opérateurs de monétique interbancaire).
- [ ] Choisir le modèle : intermédiaire technique adossé à un établissement agréé **ou** entité agréée directement. Contractualiser avec la banque / l'acquéreur / le réseau monétique concerné.
- [ ] Règles de **protection des données personnelles** (loi algérienne en vigueur, déclarations/autorisations auprès de l'autorité compétente), durées de conservation, droits des personnes, localisation des données.
- [ ] **Lutte anti-blanchiment / financement du terrorisme** : KYC / KYB des commerçants, surveillance des transactions, déclaration de soupçon, listes de sanctions.
- [ ] Conditions générales, contrats commerçants, politique de remboursement et de litiges, mentions légales, facturation et fiscalité.
- [ ] Conformité **PCI DSS** si des données de cartes sont manipulées (en pratique : ne jamais les toucher — page hébergée / jetons du prestataire, périmètre SAQ-A).

## 2. Backend autoritaire

- [ ] Service serveur qui détient la vérité : statuts, montants, soldes, remboursements, commissions, règlements. Le navigateur n'est qu'un client.
- [ ] Réutiliser `src/domain/` (fonctions pures, testées) côté serveur ; le front ne fait qu'afficher.
- [ ] Base de données serveur (PostgreSQL recommandé) : transactions ACID, contraintes d'intégrité (`refunded ≤ amount`, montants entiers > 0), migrations, sauvegardes chiffrées, PITR.
- [ ] **Grand livre en partie double** immuable (écritures jamais modifiées, seulement contre-passées) plutôt que des totaux mutables.
- [ ] Remplacer `LocalPspApi` par un `HttpPspApi` (voir `API.md`) ; supprimer IndexedDB comme source de vérité.

## 3. Authentification et autorisation

- [ ] Authentification des utilisateurs du back-office (SSO / OIDC, **MFA** obligatoire), sessions sécurisées, verrouillage, journal des connexions.
- [ ] Clés d'API par commerçant : création, rotation, révocation, portées (scopes), hachage au repos, jamais affichées après création.
- [ ] Autorisation par rôle (RBAC) **imposée à chaque requête côté serveur** ; séparation des tâches (ex. double validation des gros remboursements et des règlements).

## 4. Idempotence et concurrence

- [ ] Table d'idempotence persistante (clé + empreinte de requête + réponse), TTL, détection `409` si la requête diffère.
- [ ] Verrouillage / contrôle de concurrence sur les agrégats (remboursements simultanés, règlements) ; transitions d'état atomiques.

## 5. Journalisation et audit

- [ ] Journal d'audit **immuable** (WORM), horodaté par une source fiable, incluant acteur, IP, requête, résultat ; conservation légale.
- [ ] Journaux applicatifs structurés **sans données sensibles** ; corrélation par `request_id` ; alertes (taux d'échec, anomalies).

## 6. Chiffrement et secrets

- [ ] TLS partout (HSTS), chiffrement au repos, chiffrement applicatif des champs sensibles.
- [ ] Gestion des secrets (KMS / HSM / coffre-fort), rotation, aucun secret dans le dépôt ni le frontend.
- [ ] Politique de mots de passe / clés, durcissement des environnements, séparation sandbox / production (clés `sk_test_` ≠ `sk_live_`).

## 7. Webhooks et intégrations

- [ ] Envoi de webhooks signés (HMAC-SHA256, horodatage, tolérance 5 min), relivraison avec backoff, file d'attente, dédoublonnage par `event.id`, tableau de bord de livraison.
- [ ] Intégration réelle avec l'acquéreur / le réseau de paiement (3-D Secure ou équivalent, jetons, notifications asynchrones, gestion des timeouts et des états « inconnus »).
- [ ] Pages de paiement hébergées par le prestataire (aucune donnée de carte chez nous).

## 8. Rapprochement et règlements réels

- [ ] Rapprochement quotidien automatisé entre transactions internes, rapports de l'acquéreur et relevés bancaires ; gestion des écarts.
- [ ] Virements de règlement réels, calendrier (J+n), réserves, rétrofacturations (chargebacks), litiges.
- [ ] Reporting financier et comptable, export vers la comptabilité.

## 9. Prévention de la fraude et limites

- [ ] Règles de risque (vélocité, montants, géolocalisation, listes noires), scoring, revue manuelle.
- [ ] Limites par commerçant / client, protection contre l'énumération, limitation de débit, protection anti-bot.

## 10. Qualité, exploitation et sécurité

- [ ] Tests de charge, tests d'intrusion indépendants, revue de code sécurité, analyse des dépendances (SCA/SAST).
- [ ] Supervision (SLO, alertes), plan de reprise d'activité, plan de réponse aux incidents, astreinte.
- [ ] CI/CD avec déploiements reproductibles, environnements séparés, accès de production restreints.
- [ ] Accessibilité : audit avec lecteurs d'écran réels, tests utilisateurs (français, éventuellement arabe / RTL).

## Ce que le prototype fournit déjà et qui reste utile

- Modèle de données, machine d'états, règles de remboursement et de règlement, **testés** (`src/domain/`).
- Contrat d'intégration `PspApi` et spécification REST illustrative (`API.md`).
- Interface de back-office responsive et accessible, réutilisable comme base.
- Jeu de données reproductible pour les démonstrations et les tests.
