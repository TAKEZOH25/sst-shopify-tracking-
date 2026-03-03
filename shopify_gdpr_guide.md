# Comment implémenter le Pixel de Tracking avec Consentement (RGPD)

Voici le guide d'installation étape par étape pour mettre en place la **Phase 3B** côté Shopify.
Ce pixel remplacera votre pixel actuel, en ajoutant la "magie" du consentement GDPR à chaque événement.

## Étape 1 : Copier le code du Pixel

Ouvrez le fichier local [`shopify_pixel_consent.js`](file:///c:/Users/Emmanuel/antigravity%202/Server-Side%20Tracking/shopify_pixel_consent.js) que je viens de créer pour vous et **copiez l'intégralité du code**.

> **Attention** : Avant d'utiliser le code, modifiez la Ligne 11 pour y insérer l'URL exacte de votre VPS.
> Par exemple : `const SST_ENDPOINT = 'https://track.votre-boutique.com/api/track';`

## Étape 2 : L'ajouter dans Shopify

1. Connectez-vous à votre interface administrateur Shopify.
2. Allez dans **Paramètres (Settings)** > **Événements clients (Customer events)**.
3. Cliquez sur le bouton noir **Ajouter un pixel personnalisé (Add custom pixel)**.
4. Donnez-lui le nom `Antigravity SST Tracking` (ou le nom de votre choix).
5. Dans la grande fenêtre de code au centre de la page : **Collez le code** que vous venez de copier.
6. Cliquez sur **Enregistrer** (Save) en haut à droite.

## Étape 3 : Activer le Pixel

1. Au bas de l'écran du pixel, cliquez sur le bouton **Connecter (Connect)**.
2. Lisez l'avertissement et confirmez en cliquant à nouveau sur **Connecter**.

## Étape 4 : Vérification

À partir de maintenant :

1. Dès qu'un client visitera la boutique, son choix de bannière Shopify sera capté.
2. Chaque vue de page, ajout au panier ou achat enverra une étiquette conditionnelle JSON au VPS Hostinger :
   - Exemple (si refusé) : `{"ad_storage": "denied", "analytics_storage": "granted" ...}`.
   - Exemple (si accepté complet) : `{"ad_storage": "granted", "analytics_storage": "granted" ...}`.
3. Le serveur backend Hostinger (Identity et Worker) interceptera cette donnée et l'inscrira dans la ligne du visiteur sur votre base Supabase, comme preuve d'Axeptation de la CNIL !

Une fois que vous l'aurez activé en production, la base de données Supabase se peuplera de statuts de consentement valides.
