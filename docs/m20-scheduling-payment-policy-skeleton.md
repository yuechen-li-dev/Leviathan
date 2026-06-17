# M20 Scheduling Payment Policy Skeleton

## Purpose

M20 adds Scheduling-owned payment/deposit/prepay policy seams without implementing real payments. Scheduling can now say when payment is required for a service/hold/booking; Leviathan platform payment authority and Dominatus payment actuation remain future concerns.

## Non-goals

M20 does **not** add Stripe, PayPal, Block/Square, payment SDKs, webhooks, refunds, a ledger, a database, OAuth/auth, SMS/email/calendar integrations, live LLM calls, social/marketplace features, or vendor edits.

## Payment policy model

Scheduling services can carry a `SchedulingPaymentPolicy` snapshot with:

- `RequiresDeposit`
- `RequiresPrepay`
- `DepositAmount`
- `PrepayAmount`
- `Currency`
- `PaymentTiming`: `none`, `before_confirmation`, `after_hold_before_confirmation`, `manual_offline`
- `PaymentProviderMode`: `none`, `fake/local`, `external_deferred`
- `CancellationPaymentPolicy`: `no_refund_policy_yet`, `refund_deferred`
- `ReschedulePaymentPolicy`: `carry_payment_forward_deferred`, `no_payment_transfer_yet`

The service policy is product data. Hold and booking records store a policy snapshot so future product-policy changes do not rewrite old booking intent.

## Money representation

Money uses `MoneyAmount.MinorUnits` plus a three-letter ISO currency code. There is no floating point money and no real ledger.

## Confirmation behavior

If a hold snapshot requires deposit/prepay with timing `before_confirmation` or `after_hold_before_confirmation`, confirmation rejects with controlled `payment_required` until the hold payment requirement is satisfied. Non-payment services continue through the existing hold, intake, confirm, cancel, and reschedule flows.

## Fake/local payment behavior

M20 adds a local-dev-only endpoint:

```http
POST /api/apps/scheduling/holds/{holdId}/payment/fake-satisfy
```

It only works for `PaymentProviderMode = fake/local`, uses the hold claim token, is also gated by the unsafe local-dev Scheduling admin capability path, and writes a placeholder `fakepay_...` reference. It does not collect card data, contact a provider, create a ledger entry, or imply production payment support.

## Capability boundary

The Scheduling manifest declares `payment.checkout` and `payment.refund` as future capability needs. M20 does not use them for external payment actuation because no external payment occurs. Future real checkout requires `payment.checkout`; future refund requires `payment.refund`. Provider setup and payment authority belong to Leviathan account/platform authority, not Scheduling product data.

## Dominatus payment actuator future seam

M20 does not call `Dominatus.Actuators.Payments` or depend on it for runtime behavior. The future seam is command mapping from Scheduling payment policy decisions into authorized platform commands such as create checkout session/payment intent, capture, refund, and status once Leviathan grants and Dominatus actuators are ready.

## Cancellation/refund deferred behavior

Cancelling paid or payment-required bookings does not perform refunds. Refund behavior is explicitly represented as deferred policy (`refund_deferred` / `no_refund_policy_yet`). Existing cancellation behavior remains unchanged for non-payment bookings.

## Reschedule/payment transfer deferred behavior

M20 does not transfer or carry payment between bookings. Reschedule policy can declare `carry_payment_forward_deferred`, but the existing safe reschedule flow remains unchanged for non-payment bookings and does not pretend a real payment transfer occurred.

## API changes

- `CreateServiceRequest` accepts an optional `PaymentPolicy`.
- `SchedulingService` includes `PaymentPolicy`.
- Hold responses include payment requirement status, policy snapshot, fake/local reference, and required/satisfied timestamps.
- Bookings include payment requirement status, policy snapshot, fake/local reference, and required/satisfied timestamps.
- Confirmation may return `payment_required`.
- Fake/local satisfy endpoint returns a fake reference for local tests/demos only.

## Audit and lifecycle

Audit events added or reserved by this milestone include:

- `payment_policy_snapshot_recorded`
- `payment_required`
- `payment_satisfied_fake`
- `payment_missing_confirmation_rejected`
- `payment_policy_applied`
- `payment_deferred` remains a named future event for external-deferred flows.

Lifecycle summaries include payment requirement status and fake/local payment reference. Runtime state constants now include future seam states `PaymentRequired`, `PaymentSatisfied`, and `PaymentFailed` without overcomplicating the current HFSM path.

## Tests added

Backend tests cover service deposit/prepay policy, minor-unit money and ISO currency, hold/booking policy snapshots, controlled `payment_required`, fake/local satisfaction, payment audit/lifecycle fields, and preservation of existing Scheduling registry/flows through the full test suite.

## Known limitations

- No real payment providers or payment SDKs.
- No webhooks, refunds, ledger, reconciliation, disputes, or payment provider configuration API.
- Fake/local satisfaction is intentionally unsafe local-dev/test scaffolding.
- Reschedule payment carry-forward and cancellation refund handling are policy labels only.

## Recommended M21

- Reminder/notification contract without provider integration.
- Provider UX/demo polish for reschedule/payment labels.
- Product metadata/query-plane preflight.
- Real payment connector integration only after external connectors and authority grants are ready.


## M21 notification adjacency

M21 keeps payment policy separate from notification policy. Payment-required confirmation behavior is unchanged; notification records may be scheduled around booking lifecycle events but do not create real payment prompts, checkouts, refunds, emails, SMS, or webhooks.
