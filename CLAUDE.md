# Lexicon

Word trainer (Russian speakers learning English, Dutch and French). Installed on iPhone as a home-screen web app.

## Layout
- `index.html`, `app.css`, `app.js` — the app, served by GitHub Pages from `main` at https://bermyata.github.io/Lexicon/
- `data/en.json`, `data/nl.json`, `data/fr.json` — per language `{dict, ipa, ipaTitle, ipaNote, topics, levels}`.
  `dict` is in frequency order (most used first); new words for learning are taken from the top. Frequency comes from the FrequencyWords 50k lists (OpenSubtitles): a phrase counts as its rarest word and goes no earlier than ~2000th; an inflected form counts toward a word only when no other card owns it (singing is sing's, not singe's), and subtitle stage-direction sounds ([sighs], [groaning]) count only by their own form. A card that is also a form of another card's word (saying ← say, minutes ← minute) ranks twice as late, and words that are mostly names in subtitles (frank, mark, bob) rank late. Insert a new word at its frequency position. French frequency is described in its own section below.
  `dict` rows: `[id, word, ipa, ru, usage, ex1, ex1ru, ex2, ex2ru, synonymIds?, relatedFormIds?]`. Ids are progress keys: never renumber; new words get the next free id.
  `merged` maps a removed id to the card it was folded into (progress moves over); removed ids are never reused.
  A word written `a / b` holds two forms of one word (ze / zij, we / wij, je / jij); typing either counts as correct.
  Phrases name the open slot with `someone`, `someone's`, `one's`, `oneself` (to keep someone posted, to brush one's teeth), not you/your; typing a pronoun in the slot counts as correct (keep you posted, brush my teeth).
  `altSpell` gives the other spelling of a merged British/American pair (emphasize/emphasise); typing it counts as correct.
  No two cards may share the same Russian translation: the ru→en quiz could not tell them apart.
  `topics` is the Словарь tab: `[{id, name, ids}]`, every dict id in exactly one group (themes first, then leftovers by part of speech). A new word must be added to a group.
  The first English group, `pro` (Professional), holds engineering terms: electrical, heat tracing, design documents, project planning and site safety.
  `levels` maps a CEFR level to ids (`{"A1":[...],...}`), every dict id exactly once; shown as a tag and used by the Словарь level filter.
  English levels come from the CEFR-J vocabulary profile (A1–B2) and the Octanove C1/C2 profile (CC BY-SA 4.0, github.com/openlanguageprofiles/olp-en-cefrj); words missing there and phrases are estimated from word frequency. Dutch levels (A1–B1) are estimated from frequency. French levels (A1–A2 only) are described below. A new word needs a level.
  `forms` (English) maps a verb card id to "base · past · participle" of its head verb (to give up → give · gave · given), shown as «Формы глагола»; regenerate after adding verbs (irregular table + spelling rules); "to" cards that are not verbs (to date, to this day) get none.
  Dutch `forms` give "infinitive · past sg/past pl · heeft/is participle" (gaan · ging/gingen · is gegaan; separable: weggaan · ging weg/gingen weg · is weggegaan) for single-word verb cards and `zich` verbs; regenerate after adding verbs (strong-verb table, 't kofschip, prefixes, zijn-verbs list).
  A word with both an everyday and an engineering sense is one card, and its translation has exactly two parts: the main translations (comma-separated) then «(осн.)», `;`, the engineering translations (comma-separated) then «(инж.)» — `дирижёр, кондуктор (осн.); проводник, жила кабеля (инж.)`. The main sense is the one an ordinary English speaker means first (conductor → дирижёр, not проводник); every sense belongs to one of the two parts, no unmarked leftovers, no other `;`. Tag a word only when the engineering sense is a different thing from the everyday one (current, relay, phase, charge, load, power, rating, fault, trip), not when the same meaning is just used in engineering (pump, valve, voltage). The usage note lists the senses in the same order and says «В технике (инж.): …»; the first example shows the main sense, the second the engineering one. `app.js` ignores the marks when matching and searching; lists show both parts without marks (main · engineering).
  Usage notes mark register: informal words and phrasal verbs say «Разговорное» (брит./амер. where it matters) and name the neutral or formal alternative (check out → review, examine); literary and official words say «Книжное»/«Официальное» with the everyday word. New cards should do the same.
  `relatedFormIds` links spellings of one word that are different words (follow up / follow-up, take over / takeover); shown as «Не путать с», and typing the linked form counts as wrong.
- `vendor/supabase.js` — supabase-js UMD build (2.117.0), vendored so the app works offline.
- `sw.js` — service worker, network-first with cache fallback.
- `version.json` — **bump on every change** (`YYYY-MM-DD.N`); open apps reload when it changes.
- `artifact/index.html` — old single-file English version still published on claude.ai; kept until the new app is verified.

## French (data/fr.json)
- Levels A1–A2 only, from FLELex (CEFRLex, cental.uclouvain.be/cefrlex/flelex; frequencies in textbooks by level): A1 when the A1 frequency is ≥ 30 per million, otherwise A2 when A1 ≥ 15 or A2 ≥ 20; rarer words are not taken. Phrases use the FLELex multiword list by the same rule. Core topic words FLELex lacks or rates rarer (fois, mois, fils, numbers, food, school, health items) get an estimated A1/A2.
- Frequency: Lexique 3.82 (CC BY-SA 4.0, github.com/chrplr/openlexicon), balanced as sqrt(films × books) per million by lemma; a card with an article uses the noun lemma (le pas, le son). A phrase takes its FLELex textbook frequency when listed, else half its rarest word's frequency, and goes no earlier than ~550th. A few core formulas (ne … pas, c'est, il y a, s'il vous plaît, est-ce que, il faut, d'accord, ça va, au revoir…) and Noël / Pâques are ranked by hand. Words nearly absent from one Lexique corpus (euro, internet) use FLELex frequency scaled to Lexique.
- Nouns carry the article (le chat, la maison, l'homme with gender in the usage note, les gens); forms of one word use ` / ` (l'ami / l'amie, mon / ma / mes, le / la collègue); reflexive verbs keep se / s' (se lever, s'asseoir); phrases are written as said (il y a, ne … pas). Typing needs the article or se: without it the answer is wrong with a note naming what is missing; missing accents count, with a note (œ may be typed oe).
- IPA is broad, for the word alone (no article, no se), without stress marks; ɑ is not used (a). Usage notes give gender, irregular plurals, the feminine of adjectives, constructions, the être auxiliary and register (Разговорное / Книжное with the neutral word).
- `forms` give the present tense and passé composé: "je parle, tu parles, il parle, nous parlons, vous parlez, ils parlent · j'ai parlé"; se-verbs "je me lève … · je me suis levé"; être for aller, venir (and its compounds), arriver, partir, entrer, rentrer, sortir, monter, descendre, naître, mourir, rester, tomber, retourner, apparaître, and both for passer. Single-word verb cards and se-verbs only; regenerate after adding verbs (rules for -er with spelling changes, -ir like finir, -dre like rendre; a table for irregular verbs).
- No Professional group: `topics` start with the themes (work …) and end with the part-of-speech leftovers.

## Backend (Supabase project gqqdbhgusdjryrbunkhj)
- Auth: email + password (email confirmation off), Google (optional).
- Table `public.progress (user_id, lang, data jsonb, updated_at)`, PK `(user_id, lang)`, RLS: owner only.
- The publishable key in `app.js` is public by design; never commit a secret/service_role key.

## Learning rules (app.js)
6 correct answers to learn; a mistake below 3 resets to 0, at/after 3 drops back to 3.
New words come by level slots: the dictionary's top level keeps 2 words in learning, each level below one more (en: C2 2, C1 3, B2 4, B1 5, A2 6, A1 7; nl: B1 2, A2 3, A1 4). The next new word is the most frequent unseen one whose level has a free slot; it is shown at once while fewer than 5 words are in learning, otherwise one every 3 answers.
Review: first miss restarts the interval at 4 h, second miss in a row returns the word to learning.
The Словарь tab adds single words or a whole topic group on top of the slots (they count toward their level's slot). A word opened from Словарь also has «Изучено» (unseen or in learning → straight to review, first repeat after 4 h).
A new-word card offers «Начать учить», «Пропустить» (put off until the next session) and «Изучено» (straight to review, first repeat after 4 h; the slot stays free for the next word).
