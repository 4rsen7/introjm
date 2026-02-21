# Lemon Squeezy integration

## Environment

- **LEMONSQUEEZY_WEBHOOK_SECRET** — Signing secret from the Lemon Squeezy webhook settings (used to verify `X-Signature`). Do not commit.
- **LEMONSQUEEZY_API_KEY** — API key from Lemon Squeezy (Account → API). Required so that `subscription_payment_success` webhooks can fetch the subscription (to get `variant_id`) and update the plan in your DB. Without it, only `subscription_created` / `order_created` will update plans.

Set both in `server/.env` locally and in Render (or your host) Environment; redeploy after adding.

## Webhook URL

In the [Lemon Squeezy dashboard](https://app.lemonsqueezy.com), create a webhook and set:

- **URL:** `https://<your-**backend**-domain>/api/webhooks/lemonsqueezy`  
  This must be the URL of your **Node/Express API server** (the app that runs `server/index.js`).  
  - **Not** the frontend (e.g. not `iterojm.vercel.app`).  
  - **Not** the Supabase project URL (e.g. not `*.supabase.co` — that is only for database/Auth, it does not run your API).  
  - Use the host where you deploy the **backend** (e.g. Render: `https://your-service.onrender.com`, Railway, Fly.io, etc.).
- Use the same signing secret as `LEMONSQUEEZY_WEBHOOK_SECRET`.

The server handles `order_created`, `subscription_created`, and `subscription_payment_success`: for payment success it fetches the subscription via API to get `variant_id`, then maps to a plan, resolves the user (from `meta.custom_data.user_id` or by email), and updates the `subscriptions` table.

## Variant IDs

After running `supabase_plans_checkout_lemonsqueezy.sql`, fill the variant IDs in the `plans` table from the Lemon Squeezy dashboard (Products → each variant’s ID). The migration file contains commented `UPDATE` examples.
