# Lead Manager

Private, single-user lead management app. Vanilla HTML/CSS/JS (ES modules), Supabase Auth + PostgreSQL with Row Level Security.
Exports: Excel, PDF, Word, JSON. JSON import with preview and duplicate detection, backup/restore, follow-up tracking.

## Files
`index.html`, `style.css`, `script.js` (app) · `config.js` (your public Supabase values) · `supabase/schema.sql` (table + RLS) ·
`tests/` (logic tests, RLS SQL tests, manual checklist).

## 1. Create a Supabase project
1. Go to https://supabase.com, sign in, **New project**. Save the database password somewhere safe (the app never needs it).
2. Wait until the project is ready.

## 2. Run the schema
Dashboard > **SQL Editor** > New query > paste all of `supabase/schema.sql` > **Run**. It creates the `leads` table, indexes,
the `updated_at` trigger and RLS policies (SELECT/INSERT/UPDATE/DELETE only where `auth.uid() = user_id`; `anon` has no access).

## 3. Create the private owner account (manual)
1. **Authentication > Users > Add user > Create new user**: enter your email and a strong password, tick **Auto Confirm User**.
2. **Authentication > Sign In / Providers**: turn **OFF** "Allow new users to sign up" (public registration disabled).
3. **Authentication > URL Configuration**: set Site URL to your deployed address (and add `http://localhost:8000` for local use). Needed for password-reset links.

## 4. Configure `config.js`
Dashboard > **Project Settings > API** (or "API Keys"). Copy the **Project URL** and the **publishable** key (or legacy `anon` key):
```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_...';
```
**Safe for the browser:** Project URL, publishable key, anon key (protected by RLS).
**NEVER put in frontend code or Git:** `service_role` key, secret keys, database password.

## 5. Run locally
ES modules need HTTP (not `file://`):
```
python3 -m http.server 8000      # then open http://localhost:8000
```

## 6. Deploy
- **Cloudflare Pages:** push the folder to GitHub > Pages > Create project > connect repo. Framework: None. Build command: empty. Output directory: `/`.
- **Vercel:** import the repo, Framework Preset "Other", no build command, output directory `.`.
Then add the deployed URL to Supabase Site URL / Redirect URLs.

## 7. JSON format (import, restore)
A JSON array of objects, or one object. Keys (exact names, this order in exports):
`lead_id, date_added, business_name, business_category, country, state, city, full_business_address, google_maps_profile_link,
facebook_profile_link, instagram_profile_link, website_url, website_status, contact_person_owner, phone_number_1, phone_number_2,
email_address, contact_channel, research_notes, personalized_first_message, message_sent_date, response_conversation_notes,
lead_status, next_follow_up_date`
- Only `business_name` is required. Values must be text or null. Dates `YYYY-MM-DD`.
- `website_status`, `contact_channel`, `lead_status` must match the allowed lists exactly (empty uses defaults: Website Status Unverified / none / New).
- `lead_id` in a file is ignored; new IDs (LM-000123) are generated. Unknown fields are listed in the preview and not imported.
- Duplicates: exact match after normalisation (case, spaces, punctuation) on business name + city + country, or matching phone (last 9 digits), against your database and inside the file. Similar-but-different names are not flagged. You choose Skip / Import anyway / Review per record.
- "Download template" in the Import page gives a ready sample.

## 8. Backup and restore
- **Backup:** Settings > "Export All Leads as JSON" (or Export Data > All leads > JSON). Keep the file somewhere safe; do this regularly.
- **Restore:** Settings > "Restore from a JSON backup". You get the same preview. Restore only adds records; it never edits or deletes existing leads. Records that already exist are marked duplicates and skipped by default.

## Notes and limits
- Export libraries (SheetJS 0.18.5, jsPDF 2.5.1 + autotable 3.8.2, docx 8.5.0) are loaded on demand from jsDelivr at pinned versions.
- PDF uses a built-in Latin font: non-Latin text (Urdu, Arabic) will not display correctly in PDF. Use Excel/Word/JSON for that.
- Follow-ups hide leads with status Closed, Not Interested or Not a Suitable Lead. Nothing is sent or changed automatically.
- Filter dropdown values are read from your first 5,000 leads.

## Testing status (honest)
- Automated (run by author, passing): `cd tests && npm install && npm test`: validation, duplicate detection, JSON round-trip, real XLSX/PDF/DOCX generation.
- NOT run by the author (needs your Supabase project and a browser): RLS SQL (`tests/rls_tests.sql`), login/session, CRUD, UI, mobile layout. Use `tests/MANUAL_TESTS.md`.
