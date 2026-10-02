# Lexicon

Word trainer (Russian speakers learning English and Dutch). Installed on iPhone as a home-screen web app.

## Layout
- `index.html`, `app.css`, `app.js` — the app, served by GitHub Pages from `main` at https://bermyata.github.io/Lexicon/
- `data/en.json`, `data/nl.json` — per language `{dict, ipa, ipaTitle, ipaNote, topics, levels}`.
  `dict` is in frequency order (most used first); new words for learning are taken from the top. Frequency comes from the FrequencyWords 50k lists (OpenSubtitles): a phrase counts as its rarest word and goes no earlier than ~2000th; an inflected form counts toward a word only when no other card owns it (singing is sing's, not singe's), and subtitle stage-direction sounds ([sighs], [groaning]) count only by their own form. Insert a new word at its frequency position.
  `dict` rows: `[id, word, ipa, ru, usage, ex1, ex1ru, ex2, ex2ru, synonymIds?, relatedFormIds?]`. Ids are progress keys: never renumber; new words get the next free id.
  `merged` maps a removed id to the card it was folded into (progress moves over); removed ids are never reused.
  A word written `a / b` holds two forms of one word (ze / zij, we / wij, je / jij); typing either counts as correct.
  `altSpell` gives the other spelling of a merged British/American pair (emphasize/emphasise); typing it counts as correct.
  No two cards may share the same Russian translation: the ru→en quiz could not tell them apart.
  `topics` is the Словарь tab: `[{id, name, ids}]`, every dict id in exactly one group (themes first, then leftovers by part of speech). A new word must be added to a group.
  `levels` maps a CEFR level to ids (`{"A1":[...],...}`), every dict id exactly once; shown as a tag and used by the Словарь level filter.
  English levels come from the CEFR-J vocabulary profile (A1–B2) and the Octanove C1/C2 profile (CC BY-SA 4.0, github.com/openlanguageprofiles/olp-en-cefrj); words missing there and phrases are estimated from word frequency. Dutch levels (A1–B1) are estimated from frequency. A new word needs a level.
  `forms` (English) maps a verb card id to "base · past · participle" of its head verb (to give up → give · gave · given), shown as «Формы глагола»; regenerate after adding verbs (irregular table + spelling rules; verbs of violence are left out on purpose).
  `relatedFormIds` links spellings of one word that are different words (follow up / follow-up, take over / takeover); shown as «Не путать с», and typing the linked form counts as wrong.
- `vendor/supabase.js` — supabase-js UMD build (2.117.0), vendored so the app works offline.
- `sw.js` — service worker, network-first with cache fallback.
- `version.json` — **bump on every change** (`YYYY-MM-DD.N`); open apps reload when it changes.
- `artifact/index.html` — old single-file English version still published on claude.ai; kept until the new app is verified.

## Backend (Supabase project gqqdbhgusdjryrbunkhj)
- Auth: email + password (email confirmation off), Google (optional).
- Table `public.progress (user_id, lang, data jsonb, updated_at)`, PK `(user_id, lang)`, RLS: owner only.
- The publishable key in `app.js` is public by design; never commit a secret/service_role key.

## Learning rules (app.js)
6 correct answers to learn; a mistake below 3 resets to 0, at/after 3 drops back to 3.
New words come by level slots: the dictionary's top level keeps 2 words in learning, each level below one more (en: C2 2, C1 3, B2 4, B1 5, A2 6, A1 7; nl: B1 2, A2 3, A1 4). The next new word is the most frequent unseen one whose level has a free slot; it is shown at once while fewer than 5 words are in learning, otherwise one every 3 answers.
Review: first miss restarts the interval at 4 h, second miss in a row returns the word to learning.
The Словарь tab adds single words or a whole topic group on top of the slots (they count toward their level's slot).
A new-word card offers «Начать учить», «Пропустить» (put off until the next session) and «Изучено» (straight to review, first repeat after 4 h; the slot stays free for the next word).
