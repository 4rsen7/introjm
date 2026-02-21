# Lemon Squeezy integration

## Environment

In the server `.env` add:

- **LEMONSQUEEZY_WEBHOOK_SECRET** — Signing secret from the Lemon Squeezy webhook settings (used to verify `X-Signature`). Do not commit this value.

## Webhook URL

In the [Lemon Squeezy dashboard](https://app.lemonsqueezy.com), create a webhook and set:

- **URL:** `https://<your-api-domain>/api/webhooks/lemonsqueezy`  
  Example: `https://api.iterojm.com/api/webhooks/lemonsqueezy`
- Use the same signing secret as `LEMONSQUEEZY_WEBHOOK_SECRET`.

The server handles `order_created` and `subscription_created` events: it maps `variant_id` to a plan, resolves the user (from `meta.custom_data.user_id` or by email), then updates the `subscriptions` table.

## Variant IDs

After running `supabase_plans_checkout_lemonsqueezy.sql`, fill the variant IDs in the `plans` table from the Lemon Squeezy dashboard (Products → each variant’s ID). The migration file contains commented `UPDATE` examples.
