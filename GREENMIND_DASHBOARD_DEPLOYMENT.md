# GreenMind dashboard integration

The Vercel dashboard now lives in `vercel-dashboard/` as a Next.js app. Keep the existing Vercel project connected to this GitHub repository and use `vercel-dashboard` as its Root Directory. Select the **Next.js** framework preset, use `npm run build`, and leave the output directory unset so Vercel serves the Next.js app routes.

## Existing services

- Vercel serves the dashboard.
- Render continues to run the existing Flask CropGuard disease scanner. `DISEASE_API_URL` points to `https://smart-greenhouse-api-fs0j.onrender.com`; the camera and disease pages call its `/predict` endpoint with the `image` multipart field. Disease detection keeps the richer report cards, top three class scores, and care guidance, using CropGuard’s returned prediction as the source.
- Supabase provides greenhouse telemetry and the existing `greenhouse-ingest` and `greenhouse-alerts` functions. The imported dashboard uses `recorded_at` as its source timestamp and aliases it to `created_at` in the UI.
- Email delivery remains in the existing Supabase alert webhook and Brevo integration. Dashboard alert views read the existing status; relay test commands use a separate PIN-protected route and do not require or change Brevo secrets.

## Vercel environment variables

The existing `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GREENHOUSE_DEVICE_ID`, and `DISEASE_API_URL` values are supported. The public Supabase URL/key and Render URL also have the current project values as build-time fallbacks.

Add these server-only settings in Vercel if you want the protected plant tracker and diagnosis-history clearing features enabled:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role/secret key. Keep it server-only; never use a `NEXT_PUBLIC_` prefix.
- `GREENMIND_ADMIN_PIN`: PIN for the plant tracker admin page.
- `GREENMIND_SESSION_SECRET`: at least 32 random characters for signed admin sessions.

Add `GEMINI_API_KEY` in Vercel to enable the AI farmer chatbot. Its prior Ollama URL pointed to localhost, which is not available inside Vercel. The key is used only by the Next.js server route.

## Manual relay test controls

The dashboard relay buttons require `SUPABASE_SERVICE_ROLE_KEY`, `GREENMIND_ADMIN_PIN`, and `GREENMIND_SESSION_SECRET` in Vercel. The buttons are available only after PIN sign-in and issue 20-second manual tests. The ESP32 then returns to local automatic control. The existing `greenhouse_devices` columns already store the three manual modes and output values.

Run `supabase/greenhouse-manual-test.sql` once in Supabase SQL Editor to add the expiration timestamp. Deploy the updated `supabase/functions/greenhouse-ingest` function, then flash the updated `esp32/SmartGreenhouse.ino` to the board. The function returns current mode and remaining test time; the firmware polls it every five seconds and falls back to local automation if its config connection is lost. If the Supabase function has `DEVICE_INGEST_KEY` set, enter the same value locally in the sketch before flashing and never commit it. No Brevo settings or alert secrets are changed.

See `.env.example` for variable names; it intentionally contains placeholders, not secrets.

## Supabase schema additions

The existing project schema already supports greenhouse telemetry. The new disease history and plant growth pages need extra tables and a storage bucket; `supabase/greenmind-dashboard-schema.sql` is an additive migration for those features. Review and run it in Supabase SQL Editor before using those pages. It does not change the greenhouse telemetry schema or Brevo alert secrets.

Energy and water-tank panels remain available in the UI. The current ESP32 firmware and Supabase schema do not publish current/power or tank-level readings, so those panels report that data as unavailable instead of simulating it.

The current Render Flask service and current Supabase project remain the app’s backend services. Deploying the dashboard code alone does not update the separate Render service or the ESP32: Render must build the backend code change from the repository, and the ESP32 firmware must be flashed to enable relay tests.
