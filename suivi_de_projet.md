# Suivi de Projet : Server-Side Tracking (Art Virtuoso)

## Phase 1 & 2 : Fondations et Tracking de Base (Rappel)

- Mise en place de l'environnement Node.js/Redis/BullMQ sur le VPS (Hostinger).
- Création du webhook Shopify (`order_created`).
- Interception des événements de base.
- Connexion et implémentation de **PostHog** côté serveur pour l'analytique.
- Résolution d'identité de base (Client ID & Email Stitching).

## Phase 3 : Conformité RGPD et Google Ecosystem (Mars 2026)

### 1. Gestion du Consentement (RGPD / Consent Mode v2)

- Création d'un Pixel Web Shopify personnalisé (`shopify_pixel_consent.js`) déployé dans l'environnement Sandbox de Shopify.
- Écoute active de l'API Shopify Customer Privacy pour intercepter les choix de l'utilisateur (bannière de cookies).
- Formatage du consentement selon le standard Google Consent Mode v2 (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`).
- Envoi systématique du statut de consentement (Granted ou Denied) vers le serveur backend VPS.
- Stockage et mise à jour dynamique du profil utilisateur avec ses préférences de consentement sur le VPS.

### 2. Intégration Google Analytics 4 (GA4) - Measurement Protocol

- Abandon de l'API Google Ads directe au profit du Measurement Protocol de GA4 (plus robuste et standard pour l'architecture Server-Side).
- Centralisation des événements Frontend (`page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `consent_updated`) mappés depuis Shopify vers le format GA4.
- Transmission de l'événement Backend (`purchase`) lors de la validation d'une commande (Webhook `order_created`).
- Gestion de l'Enhanced Conversion : Hachage automatique (SHA-256) des données utilisateurs (Email, Téléphone, etc.) envoyées à GA4, respectant la vie privée tout en nourrissant l'algorithme "Smart Bidding".
- **Comportement Conditionné :** Ping anonymisé ("Consent Mode Ping") si consentement refusé, ou transfert complet des données (dont l'identity) si consentement accordé.
- Ajout de manière sécurisée de la connexion GA4 (Measurement ID + API Secret) via les variables d'environnement distantes sur Hostinger.

### 3. Ajustements pour Google Ads et Google Merchant Center

- **Dédoublage :** Désactivation de la remontée des conversions (achats) depuis l'application native Shopify "Google & YouTube" pour faire du VPS la source unique de vérité et éviter les doubles comptages qui faussent le Taux de Rebond.
- **Merchant Center ID Matching :** Modification du script serveur (`worker.js`) pour reconstruire dynamiquement l'Identifiant Produit complexe (ex: `shopify_FR_[ProductID]_[VariantID]`) attendu par Merchant Center, en extrayant les IDs bruts depuis le Pixel Frontend ou le Webhook.
- **Objectif Atteint :** Validation parfaite du Remarketing Dynamique. Le `item_id` envoyé à GA4 correspond exactement à l'ID produit du flux généré par l'application Shopping, permettant aux annonces PMax et Shopping de cibler précisément le produit consulté.
- **Connexions :** Import des conversions vérifiées depuis la propriété GA4 purifiée vers le compte Google Ads d'Art Virtuoso.

### 4. Déploiement et Sécurité

- Élaboration de scripts de déploiement et de pilotage distants via SSH vers le VPS Hostinger (`ssh_deploy.js`, `ssh_cmd.js`, `update_env.js`).
- Sécurisation du `.env` distant avec les clés API de production sans les exposer dans le contrôleur de version (Git).
