# M21 Scheduling Notification Policy Skeleton

M21 adds Scheduling-owned reminder and notification policy seams without integrating a real email, SMS, push, webhook, or provider SDK. Scheduling now records when notifications are needed; Leviathan capability grants and future Dominatus notification actuators remain responsible for authorized external delivery.

## Purpose

- Let service configuration carry a `SchedulingNotificationPolicy` snapshot.
- Create local `ScheduledNotification` records when confirmed bookings require reminders.
- Cancel pending notification records when bookings are cancelled or rescheduled.
- Provide a local-dev-only fake-send mutation for tests and demos.
- Audit notification lifecycle decisions without logging message bodies or customer contact details.

## Non-goals

M21 does not add Twilio, SendGrid, Mailgun, SMTP, Microsoft Graph, push, webhooks, real sends, real auth/OAuth, a database, external calendar sync, live LLM calls, social features, or vendor edits.

## Policy model

`SchedulingNotificationPolicy` contains `Enabled` plus a list of `NotificationRule` records. Rules include:

- trigger: `booking_confirmed`, `booking_cancelled`, `booking_rescheduled`, `before_booking_start`, `payment_required`, `hold_expiring`;
- channel: `none`, `app`, `email`, `sms`, `webhook`, `external_deferred`;
- recipient type: expected values include `customer`, `provider`, `resource_owner`, and `manual_test`;
- template key;
- optional minutes-before-start offset for reminder records.

`ScheduledNotification` stores provider, booking, service, resource, trigger, channel, recipient type, template key, scheduled time, status, linked old/new booking ids, and reason. Statuses include `pending`, `sent_fake`, `cancelled`, `skipped`, `failed`, and `deferred_provider_unavailable`.

## Storage layout

M21 uses the existing local file Scheduling store and writes notification records under the booking folder:

```text
<data-root>/scheduling/providers/<providerId>/bookings/<bookingId>/notifications/<notificationId>.json
```

This supports listing by booking id, cancelling pending notifications for a booking, fake-sending one notification, and keeping booking audit alongside the notification lifecycle.

## Booking lifecycle behavior

- Confirmation with enabled rules creates pending `ScheduledNotification` records for `booking_confirmed` and `before_booking_start` rules, then updates the booking notification summary counts.
- Confirmation with no enabled policy writes a `notification_skipped` audit event but creates no notification records.
- Cancellation changes pending notifications for the booking to `cancelled` and writes `notification_cancelled` audit events.
- Reschedule confirmation cancels pending notifications on the old booking and creates new notification records for the replacement booking through the normal confirmation path.
- Payment-required behavior remains payment-policy controlled. M21 does not send payment prompts externally.

## Fake/local send behavior

`POST /api/apps/scheduling/notifications/{notificationId}/fake-send` marks a pending notification as `sent_fake`, writes a `notification_sent_fake` audit event, and returns the changed record. It is gated through the existing unsafe local-dev Scheduling admin/capability path and does not send anything outside the process.

`GET /api/apps/scheduling/bookings/{bookingId}/notifications` lists local notification records for a booking.

## Capability boundary

Scheduling declares future `notification.send`, `email.send`, and `sms.send` capability needs in its app manifest. M21 does not consume those capabilities for provider delivery because provider delivery does not exist yet. Future Dominatus actuators should map authorized Scheduling notification commands into provider-specific adapters only after platform grants, connected-account policy, and safe audit envelopes are ready.

## Audit and lifecycle integration

M21 audit events include `notification_policy_applied`, `notification_scheduled`, `notification_cancelled`, `notification_sent_fake`, and `notification_skipped`. Audit data records ids, channel, recipient type, trigger, scheduled time, status, actor/reason, and linked old/new booking ids. It intentionally avoids full message bodies and customer contact data.

Booking records can carry a `NotificationSummary` count object for pending, fake-sent, cancelled, skipped, failed, and deferred-provider-unavailable notifications.

## API changes

- `CreateServiceRequest` accepts `NotificationPolicy`.
- `SchedulingService`, `Hold`, and `Booking` can carry notification policy snapshots/summary.
- Added notification list and fake-send endpoints.

## Tests added

Backend tests cover notification creation, no-policy behavior, cancellation/reschedule transitions, fake-send audit behavior, contact-data-safe notification audit details, and payment-required preservation.

## Known limitations

- No scheduler/worker dispatches due notifications.
- No real channel delivery occurs.
- No provider credentials or external account binding exists.
- Notification policy validation is intentionally light and should be tightened when real actuator commands are introduced.

## Recommended M22

- Provider UX/demo polish for payment, reschedule, and notification labels.
- Notification actuator command/event skeleton without real providers.
- Product metadata/query-plane preflight.
- Real provider integration only after external connectors and platform capability grants are ready.
