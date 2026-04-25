# Règles métier — Module IA de réponse aux demandes clients

## Objectif

Construire un module qui génère des réponses IA personnalisées aux demandes de privatisation/événements, basées sur des règles paramétrables (pas de réponses génériques). Il faut donc **une page de configuration** (où je paramètre les règles) + **un moteur de réponse IA** qui les applique.

---

## 1. Salles & capacités

Trois espaces, capacités fixes :
- **Salle intérieure** : 140 personnes max
- **Chalet** (petite salle) : 40 personnes max
- **Terrasse extérieure** : 90 personnes max

---

## 2. Privatisation — logique de calcul

**Principe** : chaque salle a un **seuil de CA minimum** à atteindre. Si le CA généré par le menu × nb de personnes est inférieur, la différence est facturée en **frais de privatisation**.

**Formule** :
`Privatisation = max(0, Seuil_CA_salle - (nb_personnes × prix_menu) - extras)`

**Exemple concret** : 40 pers. × Menu A (40€) = 1600€ de CA. Seuil salle intérieure semaine = 4000€. → Privatisation facturée = **2400€**.

**Les seuils de CA doivent être paramétrables par salle ET par créneau**, via une matrice :

|  | Midi semaine | Soir semaine | Midi weekend | Soir weekend |
|--|---|---|---|---|
| Salle intérieure | à remplir | à remplir | à remplir | à remplir |
| Chalet | à remplir | à remplir | à remplir | à remplir |
| Terrasse | à remplir | à remplir | à remplir | à remplir |

(Prévoir la possibilité d'ajouter plus tard une distinction saison haute/basse.)

---

## 3. Menus — prix & minimums

| Menu | Prix | Min. choix unique | Min. choix multiple |
|------|------|-------------------|---------------------|
| Pierrade | 40€ | 20 pers. | — |
| Menu A | 40€ | 30 pers. | 50 pers. |
| Menu B | 45€ | 30 pers. | 50 pers. |
| Menu C | 50€ | 30 pers. | 50 pers. |
| Menu D | 70€ | **impossible** | 60 pers. |
| Buffet Froid | 40€ | 40 pers. | — |
| Buffet Chaud | 45€ | 40 pers. | — |
| Cocktail | 40€ | 50 pers. | — |

**Important** : le **Menu D n'est PAS disponible en choix unique** — minimum 60 personnes, choix multiple obligatoire.

**Inclus dans tous les menus** : apéritifs (punch maison ou kir), coca & jus de fruits, 1 bouteille de vin pour 4 personnes (rouge/rosé/blanc), eau de source, service.

Ces menus, prix et minimums doivent être **éditables** dans la page de config (ajout/modif/suppression).

---

## 4. Suppléments

- **Vin supplémentaire** : 20€/bouteille
- **Menu enfant** : 15€
- **Heures supplémentaires** :
  - Vendredi soir & samedi soir : +150€/heure à partir de 00h00, fin max **2h00** du matin (obligatoire)
  - Samedi midi & dimanche midi : +150€/heure à partir de 15h30, fin max samedi **17h00**

Tous ces montants doivent être **paramétrables**.

---

## 5. Délais de transmission des choix

- Menus classiques (A, B, C, D, Buffets, Cocktail) : **3 semaines à l'avance**
- Menu Pierrade : **10 jours à l'avance** (desserts inclus)

L'IA doit **alerter automatiquement** si la date de l'événement est trop proche par rapport au délai requis.

---

## 6. Acompte

**Pas d'acompte pour le moment**, mais prévoir dans la page de config :
- Un **toggle on/off**
- Un champ **pourcentage** configurable

Si activé un jour, l'IA l'intègre à la réponse.

---

## 7. Conditions d'annulation

Champ **texte libre** dans la page de config (je rédigerai la politique plus tard, il faut juste que l'IA puisse l'injecter dans ses réponses).

---

## 8. Comportement attendu du moteur IA

Pour chaque demande client entrante (formulaire ou collage d'email), l'IA doit :

1. **Identifier** : nb de personnes, date/créneau, menu envisagé, salle souhaitée.
2. **Vérifier la faisabilité** : capacité salle, minimums menu, délai de commande, choix unique vs multiple.
3. **Calculer** : CA prévisionnel, frais de privatisation éventuels, suppléments (heures sup, enfants, vin sup).
4. **Générer une réponse client** claire et professionnelle, qui :
   - Confirme ce qui est possible
   - Signale les contraintes (ex : "Menu D nécessite au moins 60 pers. en choix multiple")
   - Indique le montant de privatisation si applicable, avec explication transparente
   - Mentionne les délais de transmission des choix
   - Intègre les conditions d'annulation
5. **Alerter côté admin** (distinct de la réponse client) sur tout point bloquant ou à négocier.

**Format de sortie souhaité** : un **email complet prêt à envoyer** au client, accompagné d'un **panneau admin séparé** qui montre le détail du calcul (transparence interne).

---

## 9. Données de référence — le PDF menus 2026

Le PDF "MENUS 2026" contient tous les menus détaillés (entrées, plats, desserts). L'IA doit pouvoir citer les compositions précises dans ses réponses.

---

## Ce que j'attends de toi

1. Une **page de configuration admin** (matrice CA par salle/créneau, éditeur de menus, suppléments, toggle acompte, champ annulation).
2. Un **moteur de réponse IA** qui prend une demande client en entrée et sort un email + un panneau de détail interne.
3. Persistance des paramètres (les réglages doivent être sauvegardés).
4. Stack au choix — cohérente avec l'écosystème existant (dashboard.le-robin.fr, Supabase).

Dis-moi si quelque chose est flou avant de coder.
