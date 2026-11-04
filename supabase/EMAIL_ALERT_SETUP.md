# Greenhouse email alerts (Supabase + Brevo)

The ESP32 keeps all relay control local. This cloud workflow only observes each
telemetry insert and sends email alerts; it cannot switch the pump, fan, or
grow light.

## 1. Create the alert tables

In **Supabase Dashboard -> SQL Editor -> New query**, paste and run the entire
contents of `alerts-schema.sql`.

## 2. Confirm Edge Function Secrets

In **Edge Functions -> Secrets**, add these values. Do not commit or share the
Brevo key:

```text
BREVO_API_KEY=<new Brevo key>
ALERT_FROM_EMAIL=Smart Greenhouse <your-verified-sender@example.com>
ALERT_TO_EMAIL=farmer@example.com
ALERT_COOLDOWN_SECONDS=1800
```

`ALERT_TO_EMAIL` can contain comma-separated recipients if needed.

## 3. Deploy the function from the Supabase Dashboard

1. Open **Edge Functions -> Deploy a new function -> Via Editor**.
2. Set the function name to `greenhouse-alerts`.
3. Paste the contents of `functions/greenhouse-alerts/index.ts`.
4. Turn **JWT verification OFF** for this function. The Database Webhook uses
   the project's secret API key instead of a user JWT.
5. Deploy.

## 4. Create the Database Webhook

1. Open **Database -> Webhooks -> Create a new webhook**.
2. Name: `greenhouse telemetry email alerts`.
3. Table: `public.greenhouse_telemetry`.
4. Event: `INSERT` only.
5. Type: **Supabase Edge Function**; select `greenhouse-alerts`.
6. Under HTTP Headers choose **Add secret key**. Use the project’s **default
   secret API key** as an `apikey` header. Never use the public/publishable key
   and never add the Brevo API key here.
7. Save the webhook.

## Alert conditions

- Cooling fan changed from OFF to ON: one email.
- Soil remains below 20% for at least two minutes after local irrigation
  attempts begin: email. The ESP32's short pump bursts and soak periods are
  treated as one irrigation attempt sequence.
- Battery is at or below 7.00 V: email, only when the battery divider is fitted
  and firmware sends a voltage above 0.
- Each persistent alert is limited by `ALERT_COOLDOWN_SECONDS` (30 minutes by
  default), so a telemetry update does not create repeated emails.

Every email includes temperature, humidity, soil moisture, battery voltage and
an approximate 2S battery percentage, Wi-Fi RSSI, actuator states, device ID,
and India-local recorded time.

Soil moisture cannot prove that the water tank is empty. For a genuine
"reservoir empty" email, add a float-level sensor and include it in telemetry.
