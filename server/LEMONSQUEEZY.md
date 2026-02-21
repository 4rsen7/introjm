# Lemon Squeezy integration

## Environment

Set **LEMONSQUEEZY_WEBHOOK_SECRET** (signing secret from Lemon Squeezy webhook settings; used to verify `X-Signature`). Do not commit this value.

- **Local:** add to `server/.env`.
- **Render:** Dashboard → your service → Environment → Add Variable: `LEMONSQUEEZY_WEBHOOK_SECRET` = (paste the signing secret from Lemon Squeezy). Redeploy after adding.

## Webhook URL

In the [Lemon Squeezy dashboard](https://app.lemonsqueezy.com), create a webhook and set:

- **URL:** `https://<your-**backend**-domain>/api/webhooks/lemonsqueezy`  
  This must be the URL of your **Node/Express API server** (the app that runs `server/index.js`).  
  - **Not** the frontend (e.g. not `iterojm.vercel.app`).  
  - **Not** the Supabase project URL (e.g. not `*.supabase.co` — that is only for database/Auth, it does not run your API).  
  - Use the host where you deploy the **backend** (e.g. Render: `https://your-service.onrender.com`, Railway, Fly.io, etc.).
- Use the same signing secret as `LEMONSQUEEZY_WEBHOOK_SECRET`.

The server handles `order_created` and `subscription_created` events: it maps `variant_id` to a plan, resolves the user (from `meta.custom_data.user_id` or by email), then updates the `subscriptions` table.

## Variant IDs

After running `supabase_plans_checkout_lemonsqueezy.sql`, fill the variant IDs in the `plans` table from the Lemon Squeezy dashboard (Products → each variant’s ID). The migration file contains commented `UPDATE` examples.
