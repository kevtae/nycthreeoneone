# NYC 311 Quick-File

A free tool to help NYC residents file 311 complaints and get answers, faster.

Describe a problem in plain language and the app finds the right 311 complaint
type, hands you a paste-ready submission with a direct link to the correct form,
and answers questions from the official NYC 311 knowledge base.

> ⚠️ **Early development.** The app scaffold and the data pipeline are in place;
> the chat, classification, and Q&A flows are being built out.

## How it works

NYC 311 has no public API for *submitting* complaints (the web form is
captcha-gated), so this tool focuses on what it can do well: removing the
friction *before* the submit button.

- **Classify** — map a free-text problem to the correct 311 report option and a
  direct deep-link to its form.
- **Answer** — retrieval-augmented Q&A over the official 311 knowledge base, with
  source citations.
- **Look up** — status and neighborhood trends from NYC Open Data.

The complaint catalog and knowledge base are harvested from the public NYC 311
portal (see `scripts/harvest.py`); 311 service-request data comes from
[NYC Open Data](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9).

## Tech stack

- **Next.js** (App Router, TypeScript) on Vercel
- **Supabase** (Postgres + pgvector) for storage and similarity search
- **Claude** for generation, **OpenAI** `text-embedding-3-small` for embeddings

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev                  # http://localhost:3000
```

Set up the database by running the migration in `supabase/migrations/` against
your Supabase project.

## Status

This is a public-good side project, not affiliated with the City of New York.
