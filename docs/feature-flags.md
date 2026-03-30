# Feature Flags

## Payments

- Flag file: `client/src/config/features.js`
- Flag name: `PAYMENTS_ENABLED`
- Current purpose: temporarily disable paid upgrade / checkout buttons while external payment approval is pending

### How to re-enable payments

1. Open `client/src/config/features.js`
2. Change:

```js
export const PAYMENTS_ENABLED = false;
```

to:

```js
export const PAYMENTS_ENABLED = true;
```

3. Rebuild and deploy the client

### What this flag affects

- Paid action buttons in `client/src/components/common/PricingModal.jsx`
- Paid plan CTA buttons in `client/src/pages/LandingPage.jsx`

### What this flag does not affect

- The pricing UI itself remains visible
- Free plan entry points remain available
- Backend billing code is not removed; this only hides paid checkout actions in the client
