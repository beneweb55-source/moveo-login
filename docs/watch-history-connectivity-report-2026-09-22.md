# Historique de visionnage — guest et utilisateurs connectés

**Date :** 2026-09-22
**HEAD :** `9fa27ab` — rien n'est commité, rien n'est poussé.
**Objet :** répondre au brief « WATCH HISTORY — GUEST + UTILISATEURS CONNECTÉS / PRIORITÉ MAXIMALE » (§1–§20), en traitant les deux publics comme **une seule fonctionnalité**.

---

## 0. Méthode, et ce qui n'a PAS été observé

Ce rapport distingue trois classes de preuve, et **ne les confond jamais** :

| Classe | Signification | Ce que ça vaut |
|---|---|---|
| **TEST** | Exécuté, résultat lu. | Fort pour ce qui est testé. |
| **CODE** | Établi par lecture du code réel (fichier + ligne cités). | Fort sur le *chemin*, nul sur le *comportement en vol*. |
| **OBSERVÉ** | Vu dans un navigateur / sur la production. | Le seul qui vaille pour §20. |

**La colonne OBSERVÉ est vide dans ce rapport.** L'accès à la machine n'a fourni aucun identifiant, donc : aucune session connectée réelle, aucun login, aucun logout, aucun test Navigateur A → Navigateur B, aucun test de fusion invité → compte. Toutes les lignes qui dépendent d'un compte sont marquées **NOT PROVEN**, et le brief le demande explicitement (*« Si plusieurs sessions sont impossibles à tester, le signaler explicitement. »*).

**Deuxième réserve, plus grave, sur les tests.** `npm test` affiche `# skipped 0`, et c'est **trompeur** : la suite qui prouve la garantie multi-session est ignorée.

```
$ node --import tsx --test tests/watchHistoryConcurrency.test.ts
ok 1 - watch-history write concurrency (real PostgreSQL) # SKIP
       TEST_DATABASE_URL is not set — this suite needs a real PostgreSQL
# tests 0   # suites 1   # skipped 0
```

Node ne compte pas un `describe` ignoré dans `# skipped`. Donc `watchHistoryConcurrency.test.ts` — **9 tests, dont ceux qui démontrent que la course est éliminée** — n'a pas tourné. Le verrou consultatif (`lib/watchHistoryWrite.ts`) est du code correct **non prouvé par une exécution dans cet environnement.** Commande pour le prouver :

```
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/db npm test
```

**Validation du jour, pour mémoire :** `npm test` → **350 tests / 74 suites / 350 pass / 0 fail** ; `npx tsc --noEmit` → exit 0 ; `npm run build` → exit 0. (350/74 contre 344/72 avant les deux modifications du jour : +6 tests, +2 suites, toutes dans `tests/watchTime.test.ts`.)

---

## 1. §19 — Matrice `| Scenario | Guest | Connected | Result |`

`N/A` = non applicable, **et non « pas testé »**. « code OK » = chemin correct par lecture, non observé.

| Scenario | Guest | Connected | Result |
|---|---|---|---|
| **Refresh** | localStorage relu, entrée normalisée (`normaliseItem`), lecture qui ne lève jamais (`readRaw`) — code OK | localStorage **et** ligne serveur ; la page d'accueil relit les deux et les fusionne (`mergeHistories`) — code OK | **NOT PROVEN** (aucune observation en navigateur ; les deux chemins sont corrects) |
| **Reopen** (navigateur fermé/rouvert) | localStorage survit à la fermeture du navigateur — garantie du navigateur, code OK | idem + la ligne serveur rend la donnée indépendante de ce navigateur — code OK | **NOT PROVEN** |
| **New tab** | même origine ⇒ même localStorage ; l'onglet neuf relit au montage — code OK | idem + relecture serveur — code OK | **NOT PROVEN** |
| **Login** | `GuestHistorySync` sonde `/api/auth/me`, pousse l'historique local **séquentiellement** (`pushLocalHistoryToAccount`), n'écrit le marqueur que si `allSynced` — code OK | rien à faire : la ligne serveur existe déjà | **NOT PROVEN** (exige un compte) |
| **Logout** | N/A | `POST /api/auth/logout` → `clearWatchHistory()` → `__resetServerSyncLatch()` → `setUser(null)` → `router.refresh()` (`Header.tsx:208-228`) — code OK | **NOT PROVEN** (exige un compte) |
| **Resume** | la carte affiche « 32:14 / 47:10 » et « Continuer » | idem, et le slot survit au changement d'appareil **par l'URL de la carte** (`?s=&e=`) | **NOT DONE** — voir §8 : la position est **stockée et affichée, jamais appliquée** dans le lecteur |
| **Episode switch** | un seul slot par titre : le nouveau remplace l'ancien (`resolveProgression`, branche « slot différent ») — **TEST** (`tests/progressionGuard.test.ts`) | la même fonction, appelée par le serveur (`progressionColumns` dans `lib/watchHistoryWrite.ts`) — **TEST** | **VERIFIED (TEST)** sur la règle ; **NOT PROVEN** sur le rendu |
| **Season switch** | idem, saison 0 (specials) traitée comme un slot réel — **TEST** | idem — **TEST** | **VERIFIED (TEST)** |
| **Multi-session** | N/A | verrou consultatif pris **avant** la lecture, dans une transaction (`lib/watchHistoryWrite.ts:174`) — code OK | **NOT PROVEN** — la suite qui le démontre est **ignorée** (voir §0) |
| **Account isolation** | N/A | `user_id` vient du jeton vérifié et de nulle part ailleurs (`user_id = $1`) ; GET/DELETE sont bornés par lui — code OK | **NOT PROVEN**, et **une brèche réelle côté navigateur** — voir §9 |

---

## 2. §19 — Verdicts par domaine

Format : **VERDICT** — ce qui le fonde — ce qui manque pour le prouver.

### GUEST HISTORY — **NOT PROVEN**
Le magasin est solide par lecture : lecture/écriture qui ne peuvent pas lever (`readRaw`/`writeRaw`, `utils/historyManager.ts:110-127`), réparation à la lecture (`normaliseItem`, l.155), saison 0 et position 0 préservées par `??` et jamais `||`, plafond `MAX_ITEMS = 20` avec éviction silencieuse (l.309). Ce qui manque : une seule observation en navigateur. Le risque de la classe CODE ici est précis — un plafond de 20 entries fait **disparaître** la 21ᵉ sans rien dire.

### CONNECTED HISTORY — **FIXED**
Quatre défauts réels corrigés, dont trois avant ce rapport :
1. `minutes: 0` rejeté par le garde (`!minutes` est `!0` est `true`) ⇒ **aucune progression n'était jamais enregistrée**. Corrigé et testé.
2. `current_time` non quoté ⇒ erreur de syntaxe `42601` en écriture, et en lecture la **valeur d'horloge** `CURRENT_TIME` au lieu de la position. Corrigé et testé.
3. La course lecture-puis-écriture sans verrou ⇒ la dernière requête arrivée décidait, pas la règle. Corrigé (`lib/watchHistoryWrite.ts`) — **tests écrits, non exécutés ici**.
4. **Aujourd'hui : `POST /api/watch-time` n'avait pas de liste blanche de `media_type`.** `media_type` est la moitié de l'identité de la ligne (`UNIQUE(user_id, media_type, media_id)`), et `admin_adjustment` est la valeur réservée que `/api/admin/watch-time` écrit à `(user_id, 'admin_adjustment', 0)`. N'importe quel appelant connecté pouvait POSTer `{media_type: 'admin_adjustment', media_id: '0', minutes: N}` et l'`ON CONFLICT` de la route **ajoutait** `+ $4` à sa propre correction. Ce nombre est sommé **sans exclusion** par `auth/me:40`, `profile/stats:37`, `admin/users:32`, `admin/online:49` et `admin/stats:17-18`, alors que le GET **exclut `admin_adjustment` par nom** : le spectateur ne voyait pas ce qu'il venait de faire. Détail qui rend le cas réel et non théorique : c'est la **chaîne** `'0'` qui passe le garde de présence, pas le nombre `0` (`!media_id` est `!0` est `true`), et PostgreSQL la convertit en `0` dans la colonne `INTEGER`. Corrigé, 6 tests.

Ce qui manque : l'écriture est prouvée ; **la relecture ne l'est pas** (voir EPISODE RESUME), et le scénario deux appareils n'est pas observé.

### GUEST → ACCOUNT — **NOT PROVEN**
La règle existe et est déterministe : `mergeWatchEntries` est appelée, jamais réimplémentée, par les trois surfaces (fusion à la lecture, fusion invité→compte, fusion local+serveur à l'affichage). Le marqueur `guest_history_merged_for_user:<userId>` n'est écrit que si `allSynced` — un relais partiel est retenté à la navigation suivante. Ce qui manque : un login réel. Non testable ici.

### ACCOUNT → GUEST — **NOT PROVEN**, et un défaut de conception à décider
Le logout fait ce qu'il faut côté magasin : `clearWatchHistory()` vide la copie locale, remet le verrou de synchronisation, remet `user` à null, `router.refresh()`. La section d'accueil réagit à `HISTORY_UPDATED_EVENT` et disparaît. Ce qui manque : un logout réel.

**Mais le magasin local n'a pas de propriétaire**, et c'est le vrai sujet de §8/§17 — voir §9.

### MULTI-SESSION — **NOT PROVEN**
Le verrou est pris **avant** la lecture, dans la transaction, parce que `SELECT … FOR UPDATE` ne peut pas verrouiller une ligne qui n'existe pas encore et que `ON CONFLICT` arbitre trop tard. Une transaction = un verrou ⇒ pas d'interblocage d'ordre. Le compromis est documenté : le verrou attend indéfiniment en tenant un client du pool. **Rien de tout cela n'a été exécuté ici** : la suite est ignorée faute de `TEST_DATABASE_URL`. C'est la seule chose du rapport qui serait prouvée en une commande.

### CONTINUE WATCHING — **VERIFIED (CODE)**, un choix produit à confirmer
Une carte par titre, la position affichée seulement si elle a été mesurée (`hasPosition = typeof item.timestamp === "number"`), le libellé calculé sur la donnée (`Regarder` / `Reprendre` / `Revoir`), la barre plafonnée à 100 %, le `?s=&e=` dans le `href` pour que la destination ne dépende pas du localStorage. Deux points à décider explicitement :
- **Un film terminé disparaît de l'interface entièrement.** `belongsInContinueWatching` (`components/HistorySection.tsx:66`) écarte un film dès que `isCompleted` est vrai ; or `HistorySection` est **la seule surface d'historique du produit** (`app/page.tsx:194` — il n'existe aucune page `/history`). Un film terminé reste dans localStorage et en base, mais n'est plus atteignable que par la recherche. `HistoryCard` sait pourtant déjà rendre « Revoir » — ce libellé est inatteignable pour un film.
- **Un épisode terminé reste, un film terminé part.** La justification écrite dans le code est défendable (l'historique ne connaît pas le nombre d'épisodes de la saison, donc « cet épisode est fini » ne dit rien de la série, et jeter la ligne retirerait de Continue Watching une série en cours). C'est donc un choix, pas un oubli — mais il est **incohérent entre les deux types** et §14 demande de choisir et de documenter.

### PROGRESS SYNC — **FIXED** (écriture) / **NOT PROVEN** (cross-appareil)
Voir CONNECTED HISTORY pour les quatre correctifs. La chaîne d'écriture est : `VideoPlayer` → `saveWatchHistory` → écriture locale **puis** `void syncItemToServer(...)`. Ce qui manque : deux appareils, donc un compte.

### EPISODE RESUME — **NOT DONE**
**C'est le constat principal de ce rapport.** Voir §8.

---

## 3. §4 — Le schéma doit-il évoluer ?

### Ce que le schéma est, aujourd'hui

```
watch_history (
  user_id, media_type, media_id, minutes_watched, last_updated,
  title, poster_path, current_time, total_duration, season, episode,
  UNIQUE (user_id, media_type, media_id)        -- une ligne PAR TITRE
)
```

`season`/`episode`/`current_time`/`total_duration` ont été ajoutés par
`scripts/migrate-progression.ts`. Le magasin local impose **la même** identité :
`getWatchHistoryItem` identifie par `type + id` (`utils/historyManager.ts`), et
`mergeHistories` par `` `${type}:${id}` ``. Les deux magasins disent donc la même
chose : **un emplacement par titre.**

### Ce que le schéma satisfait déjà (et il faut le dire clairement)

- **Le slot est conservé exactement.** S2E7 reste S2E7 après un refresh, une
  navigation, une fermeture d'onglet. La branche « slot différent » de
  `resolveProgression` rend **l'observation gagnante entière**, et
  `progressionColumns` renvoie `currentTime`, `totalDuration`, `season`,
  `episode` **ensemble** — ou les quatre à `null`. Donc la position de S2E7 **ne
  peut pas** être écrite sous S1E3. Le « NE JAMAIS » de §7 est satisfait **au
  niveau de la source**, pas par discipline d'appelant.
- **Aucune contamination croisée n'est représentable.** C'est le sens du
  commentaire de `progressionColumns` : une position et le numéro d'épisode qui
  l'accompagne décrivent toujours le même visionnage.

### Ce que le schéma ne peut pas faire — et c'est ce que §4 interdit

**Deux épisodes d'une même série ne peuvent pas coexister.** Un seul slot ⇒ le
second efface le premier. Trace concrète, avec le code :

1. Le spectateur regarde S2E7 jusqu'à 32:14. Ligne : `season 2, episode 7, current_time 1954, total_duration 2830`.
2. Il ouvre S1E4 et la lecture démarre — **le provider mesure 5 s**. Message de progression : `{season 1, episode 4, position 5}`.
3. `resolveProgression(stored, incoming)` : `sameSlot` est faux ; les deux ont une position (`storedHasPosition` et `incomingHasPosition` vrais), donc aucune des deux branches « rien n'a été mesuré » ne s'applique ; il reste `incomingIsCurrent` → vrai (l'observation a quelques secondes) → **l'observation entrante gagne**.
4. `progressionColumns` renvoie `{currentTime: 5, totalDuration: 2830, season: 1, episode: 4}`.
5. La ligne est maintenant **S1E4 à 0:05**. Les 32:14 de S2E7 sont **perdus**, pas déplacés.

Ce n'est pas « une série traitée comme une position globale » au sens d'un
timecode partagé — le timecode est bien celui de l'épisode nommé à côté. C'est
pire et plus discret : **une seule place de mémoire par série**, donc tout
épisode effleure le précédent.

### Verdict sur la question de §4

**Le schéma n'a pas besoin d'évoluer pour le produit d'aujourd'hui ; il doit
évoluer si le produit veut se souvenir de plus d'un épisode par série.**

- Continue Watching affiche **une carte par série** : le schéma actuel est
  exactement le bon pour ça, et une migration n'y changerait rien.
- Mais il perd (a) le « vous en étiez à S2E7 » dès qu'un autre épisode est
  mesuré, (b) toute notion de « épisode déjà vu » par épisode, (c) la reprise
  d'un épisode précis quand le dernier épisode regardé est un autre.
- **Décision : ne pas migrer sans que le produit ait tranché (a), (b), (c).**
  Migrer « au cas où » ajoute une table, un chemin d'écriture, une clé de verrou
  et un chemin de lecture pour zéro changement visible.

### Proposition de migration — **PROPOSITION, NON EXÉCUTÉE**

> Le brief demande de *« déterminer si le schéma doit évoluer »* et de
> *« proposer une migration sûre »*. Ce qui suit n'est **pas** exécuté : aucune
> migration destructive, aucune modification de données de production.

**Étape 0 — comprendre la production avant de la toucher.** L'en-tête de
`scripts/migrate-progression.ts` établit que ce script **n'a pas pu** créer
`watch_history.current_time` : `current_time` est réservé, la version antérieure
non quotée échoue en `42601`, et le `catch` du script ne tolère que `42701`.
Autrement dit **les scripts du dépôt n'expliquent pas le schéma de production.**
Toute migration doit donc commencer par lire le schéma réel :

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name = 'watch_history';
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'watch_history';
-- et le volume, pour dimensionner le retour arrière :
SELECT count(*) total,
       count(*) FILTER (WHERE season IS NOT NULL) with_slot,
       count(DISTINCT (user_id, media_type, media_id)) titles
FROM watch_history;
```

**Étape 1 — sur une copie, pas sur la production.** `pg_dump` → restauration
locale → migration → vérification → **test de rollback** → seulement ensuite la
production.

**Option B (recommandée) — table enfant additive.**
`watch_history` reste **la ligne par titre** et devient le pointeur de Continue
Watching (inchangé : GET, cartes, `LIMIT 20`, tri). On ajoute :

```sql
CREATE TABLE watch_history_episodes (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type VARCHAR(50) NOT NULL,
  media_id  INTEGER NOT NULL,
  season    INTEGER NOT NULL,
  episode   INTEGER NOT NULL,
  "current_time" FLOAT,
  total_duration FLOAT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, media_type, media_id, season, episode)
);
-- Rétro-remplissage : l'unique épisode que le schéma actuel sait nommer.
INSERT INTO watch_history_episodes (user_id, media_type, media_id, season, episode,
                                    "current_time", total_duration, last_updated)
SELECT user_id, media_type, media_id, season, episode,
       "current_time", total_duration, last_updated
FROM watch_history
WHERE media_type = 'tv' AND season IS NOT NULL AND episode IS NOT NULL
ON CONFLICT DO NOTHING;
```

Pourquoi cette option :
- **Additive** : aucun `UPDATE`, aucun `DELETE`, aucune colonne retirée. Les
  données actuelles sont **conservées telles quelles** et recopiées.
- **Retour arrière réel** : `DROP TABLE watch_history_episodes;` et le code relit
  la ligne parente. C'est un rollback qui ne perd rien, parce que la table
  ajoutée ne contient au départ que des copies.
- `season`/`episode` sont `NOT NULL` : pas de `NULL` dans une clé primaire, donc
  pas de doublons silencieux (voir l'option A).
- Le parent continue de bouger à chaque observation : Continue Watching ne change
  pas de comportement, il devient seulement *adossé* à une donnée plus fine.

Coût à ne pas cacher : le chemin d'écriture doit écrire **deux** lignes dans la
**même** transaction, et la clé du verrou doit couvrir l'enfant
(`user:type:id:season:episode`) **en plus** du parent, dans un ordre fixe, sinon
l'ordre de verrouillage redevient une source d'interblocage. Ce n'est pas
gratuit ; c'est le prix de la coexistence.

**Option A (déconseillée) — étendre la clé unique au slot.**
`UNIQUE(user_id, media_type, media_id, season, episode)` : attention, **dans un
index unique PostgreSQL, deux `NULL` sont distincts** (comportement par défaut,
y compris en PG 18). Un film, dont `season`/`episode` sont `NULL`, ne
déclencherait donc **jamais** l'`ON CONFLICT` : chaque tick de lecture créerait
une **nouvelle ligne**, et Continue Watching afficherait le film vingt fois. Il
faudrait un slot normalisé non nul (colonne générée `COALESCE(season, -1)`, ou
`season INTEGER NOT NULL DEFAULT -1`) — c'est-à-dire un changement de colonne,
donc une migration de données réelle. Et le `LIMIT 20` du GET deviendrait « 20
épisodes », pas « 20 titres », ce qui obligerait à replier côté serveur pour
rendre une carte par titre.

**Aucune de ces deux options n'est exécutée. Aucun test de rollback n'a été
lancé, puisqu'il n'y a pas de copie à migrer.**

---

## 4. §7 — Les règles de fusion, écrites explicitement

Le brief les demande *« explicitement documentées »*. Elles sont ici, et elles
sont **les mêmes** côté navigateur et côté serveur, parce qu'il n'y a qu'une
implémentation (`lib/progressionGuard.ts`), appelée par les deux
(`utils/historyManager.ts` via `mergeWatchEntries`, serveur via
`progressionColumns`).

| Cas | Règle | Où |
|---|---|---|
| Rien de stocké | l'observation entrante est stockée | `resolveProgression`, premier `if` |
| **Même film**, même slot | l'entrant gagne s'il est **≥** la position stockée ; sinon la position stockée est **conservée** (le cas VidLink mesuré : l'enveloppe de montage annonce `watched: 0` et remettrait 21 minutes à zéro à chaque chargement) | branche « même slot » |
| Même slot, mais la position stockée était **déjà complète** | l'entrant gagne **même en reculant** — c'est un revisionnage, le seul cas où reculer est ce que le spectateur a demandé | `isComplete(stored.position, stored.duration)` |
| Même slot, l'entrant n'a **rien mesuré** | la position stockée est conservée. Ne pas savoir où en est quelqu'un maintenant n'est pas une raison d'oublier où il était | 2ᵉ `if` |
| Même slot, aucun des deux n'a mesuré | le **sighting** le plus récent gagne : c'est un enregistrement « il est passé par là », et le plus récent est le vrai | `incomingIsCurrent` |
| **Même série, même saison, même épisode** | c'est « même slot » : la position la plus avancée gagne, sauf si la stockée était complète (revisionnage) | branche « même slot » |
| **Épisodes différents** | **les positions ne sont PAS fusionnées.** Un seul gagne, en entier. Un entrant **sans position mesurée ne déplace jamais le slot** : cliquer un épisode dans une liste n'est pas le regarder, et le magasin n'a qu'une place — l'épisode qui gagne part avec sa position, l'autre est **oublié**, jamais ré-étiqueté | branche « slot différent » |
| **Épisodes différents, deux positions mesurées** | l'entrant gagne si son horodatage est **actuel** (voir §5 pour la tolérance) ; sinon la ligne stockée est conservée | `incomingIsCurrent` |
| **Horodatages différents, même slot** | l'horodatage **n'ordonne pas** les positions d'un même slot : là, « plus récent » n'est pas une raison de reculer | commentaire de `observedAt` |
| **Horodatages différents, slots différents** | l'observation plus **ancienne que 24 h** est refusée (elle arrive en retard) ; sinon l'entrante gagne | §5 |

**La garantie « NE JAMAIS prendre une position de S2E7 et la stocker sur S1E3 »**
tient pour une raison structurelle, pas par convention : `progressionColumns`
renvoie la position **et** le slot de l'observation gagnante, ou quatre `null`.
Un appelant ne peut pas écrire l'un sans l'autre. `tests/progressionGuard.test.ts`
le pin : *« never mixes the two observations in one result »*.

---

## 5. §9 — La tolérance de 24 h, et sa conséquence

`OBSERVATION_TOLERANCE_MS = 24 h`. Elle existe parce que le serveur compare deux
horloges différentes : l'horodatage de l'observation vient de l'appareil du
spectateur, celui de la ligne vient de la base. Une comparaison exacte ferait de
cette règle un test d'horloge d'appareil — un téléphone en retard de deux jours
ne pourrait plus jamais changer de saison.

**Conséquence, énoncée franchement : la règle est déterministe mais pas
monotone.** Une observation de **23 h** décrivant un **autre épisode** est
acceptée et écrase une observation plus récente. C'est le comportement voulu pour
une dérive d'horloge ordinaire, et c'est exactement le mauvais comportement pour
une entrée oubliée. La frontière est nette et testée des deux côtés
(`refuses an observation just past the skew tolerance`, `accepts an observation
exactly at the skew tolerance`) : au-delà de 24 h l'entrée est refusée, en deçà
elle passe. Le cas « invité fusionné un mois plus tard » est donc bien refusé ;
le cas « invité fusionné 23 h plus tard » ne l'est pas.

Le changement de slot est aussi **protégé par le verrou** côté serveur, ce qui
retire la cause première de §9 (deux écrivains décidant chacun sur une lecture
périmée). Cette protection-là attend `TEST_DATABASE_URL` pour être démontrée.

---

## 6. §14 — CONTINUER ou TERMINÉ

`COMPLETION_RATIO = 0.95`, et `isComplete` exige **les deux** nombres et
`duration > 0` : sans durée mesurée, rien n'est jamais terminé. Pour un épisode
de 47:10 (2830 s) :

| Position | Ratio | État | Ce que fait l'interface |
|---|---|---|---|
| 1 % (28 s) | 0.01 | CONTINUER | « Reprendre », barre à 1 % |
| 50 % (1415 s) | 0.50 | CONTINUER | « Reprendre » |
| 90 % (2547 s) | 0.90 | CONTINUER | « Reprendre » |
| 94 % (2660 s) | 0.94 | CONTINUER | « Reprendre » |
| **95 % (2688 s)** | 0.95 | **TERMINÉ** | série : « Revoir » ; **film : la carte disparaît** |
| 99 % (2802 s) | 0.99 | TERMINÉ | idem |
| 100 % (2830 s) | 1.00 | TERMINÉ | idem |

**Le système ne marque pas terminé trop tôt au sens où il refuse de conclure
sans durée** — c'est la direction sûre. À 95 % il reste 2:22 sur un épisode de
47:10, et c'est un choix de seuil : à documenter comme tel, pas comme un fait.

**Incohérence relevée, à trancher par le produit.** Un film terminé est retiré
de l'unique surface d'historique ; un épisode terminé y reste avec « Revoir ».
`HistoryCard` **sait déjà** rendre « Revoir » pour un film — ce libellé est
simplement inatteignable, parce que la carte est filtrée avant d'être rendue. Les
deux comportements cohérents possibles :
- **garder le film avec « Revoir »** : une ligne dans
  `belongsInContinueWatching` (`components/HistorySection.tsx:66`) — la branche
  `if (item.type === "tv") return true;` deviendrait inconditionnelle ;
- **ou assumer la disparition** et l'écrire dans le produit : un film vu est un
  film vu, il se retrouve par la recherche.

**Aucun des deux n'a été appliqué** : c'est une décision produit, pas une
correction de bug, et la modifier changerait l'accueil sans test qui la couvre.

---

## 7. §18 — Les trois vérités, et la règle qui les tient

| Support | Rôle | Qui l'écrit | Qui le lit |
|---|---|---|---|
| `localStorage["watch_history"]` | historique de **l'invité**, et miroir local du connecté | `saveWatchHistory`, `writeLocalHistory` | `HistorySection`, la page série (`getWatchHistoryItem`), `pushLocalHistoryToAccount` |
| `watch_history` (base) | historique **du compte** | `POST /api/watch-time` (`writeSignedInProgress`) | `GET /api/watch-time` → **uniquement** `HistorySection` |
| état React | une **vue**, jamais une source | `loadHistory` | le rendu |

Il n'y a donc **pas** trois vérités concurrentes : il y a **une** fonction de
décision (`resolveProgression`), appelée au même endroit pour les deux magasins,
et l'état React n'est qu'un affichage. C'est la réponse à *« NE PAS avoir : une
vérité dans localStorage + une autre dans DB + une troisième dans React »*.

**La divergence local/serveur a une règle :** le serveur est la base de la
fusion, le local est le côté entrant (`mergeHistories`), et `mergeWatchEntries`
décide **sur les valeurs**, pas sur l'ordre des arguments. Le local est le côté
entrant parce que c'est l'observation la plus récente de cet appareil.

**Mais il manque une règle, et c'est l'écart le plus sérieux de §18 :** rien ne
dit **à qui appartient** une entrée locale. Voir §9.

---

## 8. Le constat principal — la position est enregistrée, affichée, et jamais appliquée

C'est le seul point du rapport qui mérite le mot **NOT DONE**, et il touche
exactement le test de §20 : *« UTILISATEUR → REGARDE → QUITTE → REVIENT → LE
SYSTÈME SAIT EXACTEMENT OÙ IL EN ÉTAIT. »* **Le système sait. Il n'y remet pas.**

Ce qui marche, et il faut le créditer :

1. Le lecteur mesure et enregistre (`components/VideoPlayer.tsx:624`, `timestamp: progress.currentTime`).
2. La carte affiche « 32:14 / 47:10 » et « Continuer » (`components/HistoryCard.tsx:157`).
3. La carte porte `?s=2&e=7` dans son `href` : **le slot voyage dans l'URL**, donc il ne dépend pas du localStorage de l'appareil.
4. La page série ouvre S2E7 (`app/tv/[id]/page.tsx:83-97` : l'URL d'abord, le stockage local ensuite).

Ce qui ne marche pas : **aucune position n'est jamais transmise au lecteur.**

- `VideoPlayer` importe **`saveWatchHistory` et rien d'autre** de `historyManager` (`components/VideoPlayer.tsx:20`). Il n'y a **aucune** lecture de position stockée dans le composant.
- Ses propriétés sont `id, type, season, episode, title, …` — **il n'existe aucune propriété de départ** (`VideoPlayerProps`, l.57-101). Les deux appels (`app/movie/[id]/page.tsx:323`, `app/tv/[id]/page.tsx:810`) n'en passent aucune.
- Il n'existe **aucun** mécanisme de `seek` dans le produit : sur tout `lib/`, `app/`, `components/`, `utils/`, `seek` n'apparaît que dans `CustomVideoPlayer.tsx` (le slider d'un fichier local), et `buildProviderUrl` (`lib/providers.ts:582`) ne prend aucune composante de temps.

**Conséquence par scénario :**

| Scénario | Slot | Position |
|---|---|---|
| Invité, refresh de la page série | conservé (localStorage) | **0:00** |
| Connecté, refresh | conservé | **0:00** |
| Connecté, autre appareil, **via la carte** | conservé (l'URL) | **0:00** |
| Connecté, autre appareil, **via la recherche, un favori, un lien du site** | **S1E1** (le local est vide sur cet appareil, et le serveur n'est pas consulté par cette page) | **0:00** |

Les deux dernières lignes sont deux écarts distincts et tous deux réels :
- La **position** n'est jamais appliquée nulle part.
- Le **slot**, sur un appareil neuf, n'est restauré que si l'entrée est la carte
  Continue Watching. La page série lit `getWatchHistoryItem("tv", mediaId)` —
  **localStorage uniquement** — alors que la ligne serveur existe, est lue, et
  s'affiche sur l'accueil. §3 (« Une reconnexion ne doit jamais remettre S1E1
  par défaut lorsqu'une progression existe ») est donc satisfait **par un seul
  chemin d'entrée sur quatre.**

**Pourquoi ce n'est pas corrigé ici.** Appliquer la position suppose de faire
chercher le lecteur tiers à l'intérieur de son iframe. La consigne est explicite
(« We cannot control the internal JavaScript of FREMBED »), et le dépôt a déjà
tranché ce genre de question dans l'autre sens pour une raison identique :
`getMessageOrigins` refuse d'autoriser une origine tant qu'elle n'a pas été
**observée** émettant une position bien formée (`lib/providers.ts:594-603`).
Ajouter un `seek` deviné serait exactement la supposition que ce commentaire
interdit, et le risque est celui de §13 : casser le lecteur. **À faire seulement
après avoir observé, sur un provider donné, un contrat documenté** (paramètre
d'URL de départ, ou message `postMessage` accepté par l'iframe). Le fallback
honnête, si aucun provider n'en offre : **ne pas afficher « Reprendre » au
lecteur et le dire** — l'interface ne doit pas promettre une reprise qu'elle ne
peut pas honorer.

---

## 9. Deux constats de sécurité et d'isolation

**(a) L'historique local n'a pas de propriétaire — §17, account isolation.**
`components/GuestHistorySync.tsx` sonde `/api/auth/me` à chaque changement de
route ; si une session existe, il pousse **tout** `localStorage["watch_history"]`
dans le compte connecté (`pushLocalHistoryToAccount`). Aucune entrée ne porte
l'identifiant du compte dont elle vient, et le marqueur (`guest_history_merged_for_user:<userId>`)
est par utilisateur — il empêche une **re-fusion pour le même compte**, jamais la
fusion des entrées d'un **autre**.

Le chemin atteignable : A regarde un film dans ce navigateur, sa session se
termine **sans passer par le bouton de déconnexion** (expiration du jeton, cookies
effacés, révocation), B se connecte dans le même navigateur → les entrées de A
sont poussées dans le compte de B, et B les voit. Le logout explicite, lui, est
sain (`clearWatchHistory()` vide le magasin dans le même souffle).

Ce n'est pas une lecture croisée de données serveur — `user_id` vient du jeton et
de nulle part ailleurs, donc le serveur est isolé. **C'est une écriture croisée
côté navigateur.** Correction proposée, à décider : préfixer le magasin par
l'utilisateur (`watch_history:<userId>`), ou estampiller chaque entrée locale de
son propriétaire et refuser de relayer une entrée dont le propriétaire n'est pas
le compte connecté.

**(b) Le `media_type` du POST était une étiquette, pas une liste blanche.**
Corrigé aujourd'hui — détail complet en §2 (CONNECTED HISTORY, point 4), et
`tests/watchTime.test.ts` pin la nouvelle règle, y compris un contrôle de dérive
entre POST et DELETE et une assertion d'**ordre** (la liste blanche précède les
deux branches d'écriture).

---

## 10. Ce qu'une session avec identifiants doit faire, dans l'ordre

1. **`TEST_DATABASE_URL` + la suite de concurrence** — la seule commande qui
   transforme MULTI-SESSION de NOT PROVEN en prouvé.
2. **Logout → Login**, mêmes données (le test de §13).
3. **Navigateur A → Navigateur B**, via la carte **puis** via la recherche :
   c'est la seule façon de voir les deux écarts de §8 à l'écran.
4. **Les quatre tests de §13** avec une capture de la carte **et** une capture de
   l'état du lecteur au démarrage — c'est la preuve qui manque à EPISODE RESUME.
5. **Une seule observation de lecture réelle** pour confirmer ou infirmer le
   défaut PLAUSIBLE suivant : une observation qui porte une position **sans**
   durée conserve la durée de l'épisode précédent (`progressionColumns` :
   `totalDuration: incoming.position === null ? null : incoming.duration`, puis
   `COALESCE`), et le ratio de complétion est alors calculé **entre deux
   épisodes** — un S2E7 à 5 minutes pourrait s'afficher « Revoir » sous la durée
   de S1E4. Non observé, donc non affirmé ; le corriger demande de faire suivre
   la durée au slot, ce qui n'est pas une réécriture triviale.
6. **Décider §4** (plus d'un épisode par série ?), puis **décider §14** (le film
   terminé reste-t-il avec « Revoir » ?).

---

## 11. Ce que ce rapport ne dit pas

- Il ne dit **jamais** qu'un provider fonctionne : aucun lecteur n'a été observé.
- Il ne dit **jamais** qu'une session connectée a été testée : aucune ne l'a été.
- Il ne dit pas que la course est éliminée : il dit que le code qui l'élimine est
  en place, et que **la suite qui le démontre n'a pas tourné**.
- Le code correct n'est pas la fonctionnalité validée (§20). Quatre défauts
  réels ont été corrigés et sont pinnés par des tests ; **rien de ce qui dépend
  d'un compte n'est validé**, et l'auteur de ce rapport ne le présentera pas
  autrement.

**Rien n'est commité, rien n'est poussé.**

---

# 12. Addendum — propriété, et le contrat de reprise (2026-09-22, après §1–§20)

Ce qui suit **complète** les sections ci-dessus sans les réécrire : deux de leurs
verdicts ont changé depuis, et un troisième a reçu sa formulation définitive.
Les verdicts de §2, §9 et §11 plus haut sont ceux de la phase précédente.

## 12.1 Le défaut d'héritage est fermé — dans le code, et pinné

`lib/historyOwnership.ts` (nouveau) : chaque entrée locale porte désormais son
propriétaire, `guest:<device id>` ou `user:<id>`, et une entrée n'est versée dans
un compte que si elle est **adoptable** par lui. Une entrée marquée `user:A`
n'est **jamais** versée à B — pas même quand A a disparu sans cliquer sur
« logout », ce que §8 demandait précisément.

Trois points de conception portent la solidité, et chacun est testé :

- **Fail-closed sur trois états.** `absent` (adoptable), `owned` (règle
  `isAdoptable`), `unreadable` (**refusé**). Une valeur présente mais illisible ne
  devient jamais « sans propriétaire » — la confusion des deux est le défaut.
- **Jamais de trim.** `user:12 ` est refusé, pas interprété. Cette fonction
  décide à qui une entrée est remise ; toute valeur non exactement conforme est
  refusée.
- **Adoption après preuve de session**, ce qui ferme la fenêtre de l'expiration
  sans logout : après une requête prouvée, les entrées de A disent `user:A`, donc
  le `guest:*` universellement adoptable n'est plus ce qu'elles sont.

## 12.2 §1, la conclusion — `RESUME NOT SUPPORTED FOR PROVIDER`

Quatre mesures indépendantes, aucune déduction :

1. Dans tout le dépôt, le **seul** `postMessage` exécutable est
   `window.opener.postMessage` du callback OAuth — il ne vise pas une iframe.
   Un scan de source le pin, avec contre-exemple.
2. Aucune grammaire d'URL (`buildUrl`, les six) ne transporte de temps : que
   `{id, season, episode}`. Sibnet : un seul paramètre, `videoid`.
3. Deux providers ont émis quelque chose (`Frembed` : `episode_change`, sans
   position ; `VidLink` : `MEDIA_DATA`, avec position). Les quatre autres ont des
   `messageOrigins` vides.
4. `docs/provider-matrix.md:1317` l'avait déjà écrit : *« saved positions are
   stored but never used to resume »*.

`lib/resumeCapability.ts` enregistre cela par provider. Le point structurel : la
**table est de la documentation, pas l'entrée de la promesse**. La promesse lit
`POSITION_RESUME_OBSERVED`, une liste **vide**, et `assertCapabilityTableIsHonest`
fait échouer la construction si les deux divergent. Éditer la table ne peut donc
pas faire promettre une position à l'interface.

Conséquence pour §2/§19 : **CONTENT RESTORED** et **EPISODE RESTORED** sont
nôtres pour tous les providers ; **POSITION RESTORED** ne l'est pour aucun. La
carte ne dit plus « Continuer » (réservé à une reprise observée) et dit
« Reprendre l'épisode » — ce que le lien `?s=&e=` livre réellement.

Résidu assumé, **non corrigé par décision** : le titre de section
`t.home.resumeWatching` (« Reprendre la lecture ») n'a pas été touché. C'est un
nom de section, il ne promet aucune position, et le changer est une décision de
copie produit. À trancher par le propriétaire du produit.

## 12.3 §17 — tests réellement exécutés (et ce qui n'a PAS tourné)

| Commande | Résultat |
|---|---|
| `npm test` | **408 tests, 408 pass, 0 fail** — 21 fichiers |
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **succès**, 34 routes |
| deux nouveaux fichiers | `resumeCapability.test.ts` 18/18, `historyOwnership.test.ts` 40/40 |

**EXECUTED** — les 21 fichiers listés ci-dessus, dont : `progressionGuard`
(34, complétion / saison 0 / observation périmée / marche arrière),
`playerMessages` (66), `providers` (34), `playerStrategy` (32), `playerState`
(30), `timecode` (21, dont *« renders a measured zero position as a real
timecode »*), `watchTime` (18, dont `minutes: 0`), `playbackSignal` (13),
`playerNotice` (10).

**SKIPPED — et le compteur ment** :
`tests/watchHistoryConcurrency.test.ts` rapporte `tests=0 pass=0 fail=0
skipped=0` alors que **8 tests n'ont pas tourné**. Le rapporteur émet
`ok 1 - watch history write concurrency (real PostgreSQL) # SKIP` et n'énumère
pas les sous-tests. `TEST_DATABASE_URL` est **UNSET** ; `psql`, `pg_isready`,
`docker` sont absents ; `wsl.exe` existe mais WSL n'est **pas installé** sur cette
machine. Aucun PostgreSQL local n'est joignable.

Commande qui exécuterait ces 8 tests :
`TEST_DATABASE_URL=postgresql://user:pass@host:5432/db npm test`

## 12.4 §20 — verdicts, par domaine

| Domaine | Verdict | Preuve / raison |
|---|---|---|
| **Guest** | **FIXED, non observé** | Écriture estampillée `guest:<device>`, dégradation en `absent` sans stockage ; 40 tests. Aucun navigateur observé. |
| **Connected** | **FIXED, non observé** | Estampille `user:<id>` sur session prouvée, effacée au logout ; tests unitaires. Aucune session réelle. |
| **Guest → Account** | **FIXED, non observé** | `isAdoptable` + adoption après relais ; la fusion ne verse plus que l'adoptable. Non observé en navigateur. |
| **Account → Guest** | **FIXED (le défaut d'héritage), non observé** | La brèche de §9 de ce rapport est fermée par `setCurrentOwner(null)` au logout et le refus de `user:other`. L'affichage résiduel (A reste *visible* à B là où A n'a jamais cliqué logout) reste **NOT DONE**, avec la raison : filtrer la lecture demande un propriétaire résolu avant le premier rendu. |
| **Multi-session** | **NOT PROVEN** | La suite qui le démontre est **SKIPPED** (voir 12.3). Rien n'est affirmé. |
| **Episode History** | **NOT DONE** | §3–§5 : la table enfant n'existe pas. Introspection impossible sans DB ; une seule ligne par titre aujourd'hui. |
| **Position Resume** | **NOT DONE — `RESUME NOT SUPPORTED FOR PROVIDER`** | Voir 12.2. Aucun provider ne peut être piloté depuis notre domaine ; l'interface ne le prétend plus. |
| **Continue Watching** | **FIXED (le libellé), non observé** | Le libellé suit le contrat mesuré ; la barre et le timecode restent (le constat, pas la promesse). Non observé. |

## 12.5 Ce que cet addendum ne dit pas

- Aucun scénario de §18 (navigateur) n'a été exécuté : **le projet ne peut pas
  démarrer sur cette machine** — pas de `.env.local`, pas de `.env`, rien sur
  `:3000`, et les parcours exigent une lecture réelle ainsi que de vrais
  identifiants. **Aucun de ces parcours n'est déclaré VERIFIED.**
- Aucun chiffre ANCIENNES → NOUVELLES lignes (§15) : il n'y a pas de DB, et
  aucune table n'a été créée. **Aucune donnée n'a été supprimée.**
- Multi-session et écritures concurrentes restent **non exécutés**, donc non
  prouvés.

**Rien n'est commité, rien n'est poussé.**
