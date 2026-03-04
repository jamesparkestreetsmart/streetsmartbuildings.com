// lib/alert-processor.ts
//
// DEPRECATED — Alert evaluation has been moved to the dedicated cron route:
//   app/api/cron/alert-evaluate/route.ts
//
// That route queries b_alert_definitions (not the old b_alert_rules table),
// checks b_alert_subscriptions for SMS subscribers, respects quiet hours
// and cooldown windows, and inserts pending rows into b_alert_notifications.
//
// The delivery pipeline (Twilio SMS, Resend/Gmail email) remains in
// lib/alert-delivery.ts, triggered by app/api/cron/deliver-notifications/route.ts.
