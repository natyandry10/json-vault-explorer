# Pistes de design — JSON Vault Explorer

## Trois directions explorées

| Thème | Très brève introduction | Probabilité |
|---|---|---:|
| Archive Editoriale | Un espace de travail lumineux aux repères typographiques marqués, inspiré des salles de lecture et des index imprimés. Il rend les données complexes calmes et immédiatement lisibles. | 0.07 |
| Atelier Signal | Un poste d’analyse technique aux panneaux modulaires, dominé par un bleu minéral et des détails rouge brique. Il crée une sensation de précision active sans tomber dans l’esthétique cybernétique. | 0.04 |
| Terminal Serein | Une interface sombre feutrée et dense, évoquant les consoles professionnelles de supervision de données. L’ambiance privilégie la concentration et la réduction du bruit visuel. | 0.09 |

## Direction retenue — Atelier Signal

### Design Movement

**Postmodernisme éditorial appliqué à un outil de données.** L’interface combine la lisibilité d’un tableau de contrôle professionnel avec des repères de mise en page inspirés d’un journal d’analyse : titres très structurés, aplats colorés et découpes architecturales discrètes.

### Core Principles

1. **Hiérarchie immédiate :** les chiffres, le contexte et les actions restent visibles sans surcharge.
2. **Énergie mesurée :** les accents rouge brique signalent une action ou une anomalie ; le bleu minéral structure et rassure.
3. **Structure éditoriale :** bandes de ruban, repères de section et titrage net remplacent les cartes génériques empilées.
4. **Densité maîtrisée :** l’outil affiche beaucoup de données, mais chaque zone conserve respiration, alignement et une fonction nette.

### Color Philosophy

Le fond ivoire légèrement froid rend les longues sessions de lecture plus confortables. Le **bleu ardoise** matérialise la fiabilité du coffre de données ; le **rouge brique** est réservé à la déduplication, aux alertes et aux actions importantes, afin que son emploi reste significatif. Un jaune paille ponctuel rend visibles les statuts d’analyse sans ajouter de saturation permanente.

### Layout Paradigm

Un **atelier à rail latéral** : une navigation verticale compacte tient le contexte, tandis que le contenu principal s’organise en rubans horizontaux et en panneaux qui se chevauchent légèrement. Les vues denses utilisent un axe à deux niveaux : commandes et synthèse en haut, inspection détaillée en dessous.

### Signature Elements

1. Un **ruban d’état** coloré, légèrement incliné, qui porte le nom de la vue et son contexte.
2. Des **balises de données** en monospace, de petites étiquettes à bord gauche coloré pour les types, fichiers et statuts.
3. Un **motif de grille cartographique** très discret dans les fonds de panneau et dans le logo.

### Interaction Philosophy

Chaque interaction doit raccourcir le chemin vers une décision : importer, filtrer, ouvrir le détail, confirmer une déduplication ou exporter. Les commandes essentielles restent proches de la donnée concernée. Les éléments informatifs ne se font pas passer pour des boutons.

### Animation

Les changements de vue utilisent une translation horizontale très courte et une opacité progressive (180–220 ms, courbe `cubic-bezier(0.23, 1, 0.32, 1)`). Les tableaux se révèlent par rangées avec un décalage de 35 ms. Les modales et panneaux de détail émergent de `scale(0.96)` vers l’échelle normale. Les interactions répétées demeurent instantanées et tous les mouvements respectent `prefers-reduced-motion`.

### Typography System

**Space Grotesk** sert aux titres et valeurs clés : incisive, géométrique et contemporaine. **DM Sans** sert aux libellés et à la lecture courante. **IBM Plex Mono** est réservé aux clés JSON, aux empreintes de déduplication et aux métadonnées. Les titres évitent le centrage et suivent un alignement à gauche net ; chaque niveau de texte répond à une fréquence d’information différente.

### Brand Essence

**JSON Vault Explorer est l’atelier local-first qui transforme une collection de JSON en données fiables, navigables et exportables pour les équipes qui veulent garder la maîtrise de leurs fichiers.**

Personnalité : **rigoureuse, vive, rassurante**.

### Brand Voice

Les titres sont courts et opératoires ; les appels à l’action décrivent un résultat concret ; les microcopies expliquent l’impact sans jargon inutile.

> « Vos JSON, rangés comme des preuves. »

> « Importer, vérifier, puis décider. »

### Wordmark & Logo

Un monogramme **JV** abstrait : deux parenthèses angulaires forment un coffre ouvert, traversé par trois points de données. La forme est rouge brique sur fond transparent et garde une silhouette lisible en petit format ; le mot-symbole emploie Space Grotesk en capitales espacées, avec une encoche dans le V.

### Signature Brand Color

**Rouge Sismique — `#C84A34`** : une teinte rouge brique énergique, utilisée avec retenue pour identifier les opérations qui modifient ou sécurisent les données.

## Style Decisions

- Chaque grand panneau emploie au moins un dispositif d’atelier — rail d’index, coupe architecturale, onglet, ruban ou repère de cote — afin de ne jamais réduire l’interface à une grille de cartes générique.
- Le monogramme de coffre **JV**, les parenthèses angulaires et la grille cartographique constituent un motif de système : ils apparaissent dans le héros, les rubans, les balises de données et les surfaces de panneau.
- Le Rouge Sismique `#C84A34` est strictement réservé aux imports, suppressions, doublons, anomalies et signaux de sécurité ; la structure de navigation conserve le bleu minéral et le jaune paille.
