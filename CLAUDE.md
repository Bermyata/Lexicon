# Lexicon

Word trainer (Russian speakers learning English and Dutch). Installed on iPhone as a home-screen web app.

## Layout
- `index.html`, `app.css`, `app.js` — the app, served by GitHub Pages from `main` at https://bermyata.github.io/Lexicon/
- `data/en.json`, `data/nl.json` — per language `{dict, ipa, ipaTitle, ipaNote}`.
  `dict` rows: `[id, word, ipa, ru, usage, ex1, ex1ru, ex2, ex2ru, synonymIds?, relatedFormIds?]`. Ids are progress keys: never renumber; new words get the next free id.
  `merged` maps a removed id to the card it was folded into (progress moves over); removed ids are never reused.
  `altSpell` gives the other spelling of a merged British/American pair (emphasize/emphasise); typing it counts as correct.
  No two cards may share the same Russian translation: the ru→en quiz could not tell them apart.
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
6 correct answers to learn; the 3rd unlocks one new word; a mistake below 3 resets to 0, at/after 3 drops back to 3.
Review: first miss restarts the interval at 4 h, second miss in a row returns the word to learning (even above the 50 limit).
