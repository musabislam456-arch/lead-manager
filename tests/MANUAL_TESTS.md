# Manual test checklist (browser + real Supabase)

The author could NOT run these (no access to your Supabase project). Automated logic tests are in `logic.test.mjs`
(validation, duplicates, JSON round-trip, real XLSX/PDF/DOCX generation in Node). RLS SQL tests: `rls_tests.sql`.
Tick each box yourself and note failures.

| # | Test | How | Result |
|---|------|-----|--------|
| 1 | Login / logout | Sign in with owner account, click Log out, confirm login screen | ☐ |
| 2 | Session restore | Sign in, refresh page: you stay signed in | ☐ |
| 3 | Add lead | Add Lead, fill business name only, Save; appears in All Leads and Dashboard counts rise | ☐ |
| 4 | Edit lead | Edit, change status, Save; table + dashboard update | ☐ |
| 5 | Delete lead | Delete, confirm dialog appears, lead disappears, count drops | ☐ |
| 6 | Search / filter | Search by name, city, phone, email, note text; use each of 7 filters | ☐ |
| 7 | Sort / pagination | Each sort option; page size 10/25/50/100; Prev/Next | ☐ |
| 8 | Import 1 lead | Download template, import it, check preview then data | ☐ |
| 9 | Import many | Import an array of 3+ leads | ☐ |
| 10 | Invalid JSON | Upload a broken .json: clear error, nothing saved | ☐ |
| 11 | Duplicates | Re-import same file: shown as Duplicate, default Skip; "Import anyway" works | ☐ |
| 12 | Excel export | All / filtered / selected / single; phones keep "+" and leading zeros | ☐ |
| 13 | PDF export | Long notes wrap, page numbers, landscape | ☐ |
| 14 | DOCX export | Single lead and many; opens in Word without cut-off text | ☐ |
| 15 | JSON export + re-import | Export all, import into preview: 0 invalid, all marked Duplicate | ☐ |
| 16 | Follow-ups | Set past and future dates: overdue (red) vs upcoming; Edit from list | ☐ |
| 17 | Logged-out DB access | Run RLS test 1 in `rls_tests.sql` (anon denied) | ☐ |
| 18 | Unauthorized account | Run RLS tests 3-6 (other user sees nothing) | ☐ |
| 19 | Persistence | Close browser, reopen, data still there | ☐ |
| 20 | Mobile layout | Phone or browser dev-tools 375px: menu button, table scrolls, form usable | ☐ |
| 21 | Password reset | "Forgot password?", use the emailed link, set new password | ☐ |
| 22 | Restore | Settings > Restore from backup: preview, nothing deleted | ☐ |
