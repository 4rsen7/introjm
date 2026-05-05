# Feature Flags

## Payments

- Flag file: `client/src/config/features.js`
- Flag name: `PAYMENTS_ENABLED`
- Current purpose: hard-disable paid upgrade / checkout buttons if we ever need to pause billing flows again

### How to pause payments

1. Open `client/src/config/features.js`
2. Change:

```js
export const PAYMENTS_ENABLED = true;
```

to:

```js
export const PAYMENTS_ENABLED = false;
```

3. Rebuild and deploy the client

### What this flag affects

- Paid action buttons in `client/src/components/common/PricingModal.jsx`

### What this flag does not affect

- The pricing UI itself remains visible
- Landing page CTA buttons remain available
- Backend billing code is not removed; this only hides paid checkout actions in the client

## Paddle env

- Build-time frontend token: `VITE_PADDLE_CLIENT_TOKEN`
- Frontend environment: `VITE_PADDLE_ENV` (`production` or `sandbox`)
- Server webhook secret: `PADDLE_WEBHOOK_SECRET`
- Server price mapping:
  - `PADDLE_PRO_PRODUCT_ID`
  - `PADDLE_PRO_PRICE_ID_MONTHLY`
  - `PADDLE_PRO_PRICE_ID_YEARLY`
  - `PADDLE_ENTERPRISE_PRODUCT_ID`
  - `PADDLE_ENTERPRISE_PRICE_ID_MONTHLY`
  - `PADDLE_ENTERPRISE_PRICE_ID_YEARLY`
