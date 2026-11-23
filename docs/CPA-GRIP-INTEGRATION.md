# CPA Grip integration

ExpertsTeam uses CPA Grip conversions to reward members with AI credits. Credits are granted only after a server-to-server conversion callback passes the shared-secret check and matches a pending click reference.

## 1. Configure the server secret

Create a long random secret and add it in Vercel as a **server-only** environment variable:

`CPA_GRIP_POSTBACK_SECRET`

Do not prefix it with `VITE_` or `NEXT_PUBLIC_`. Do not place it in a public offer URL or browser code. Redeploy after setting or rotating it.

The endpoint remains disabled and returns HTTP 503 until this secret and the server-side Supabase secret key are configured.

## 2. Create an offer

In Admin → CPA credit offers:

- Provider: `CPA Grip`
- Tracking parameter: `tracking_id`
- Destination URL: the exact offer URL from your CPA Grip dashboard
- Reward: the AI credits to grant after a verified conversion

The Earn page creates a unique ExpertsTeam tracking ID before redirecting and appends it as the configured tracking parameter. Do not add a fixed user ID or static value in place of the click reference.

## 3. Configure the CPA Grip global postback

Copy the endpoint shown in Admin → CPA credit offers. Configure CPA Grip to call it on an approved conversion.

The callback must return the click reference to ExpertsTeam as `subid`, and include the shared secret as `key`. The endpoint accepts GET and POST requests. It also accepts `tracking_id` or `click_id` instead of `subid`.

Example shape (replace the macro with the exact click-reference macro shown in your CPA Grip account):

```text
https://expertsteam.giize.com/api/cpa-grip/postback?subid=CPA_GRIP_CLICK_REFERENCE_MACRO&key=YOUR_SHARED_SECRET
```

If CPA Grip exposes a unique conversion/transaction identifier, send it as `event_id` too. The endpoint accepts a `status` field; omitted status is treated as a conversion callback, while explicitly unsuccessful statuses are ignored.

The CPA Grip account's own postback screen is authoritative for the macro spelling available to your publisher account. Test using its test-postback feature before activating offers.

## 4. Verification behavior

- The shared secret is checked on the server before any database operation.
- The click reference must match a pending conversion created by an offer whose provider is CPA Grip.
- The database approves the conversion and credits the member in one transaction.
- Repeated callbacks for an already-approved click do not award credits twice.
- Duplicate provider event IDs are rejected.
- Manual Admin review remains available for non-CPA-Grip offers and exceptional cases.

## Required server variables

- `CPA_GRIP_POSTBACK_SECRET`
- `SUPABASE_URL` (or the existing server-side `VITE_SUPABASE_URL`)
- `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SERVICE_ROLE_KEY`

Never expose a Supabase service-role/secret key in a browser variable.
