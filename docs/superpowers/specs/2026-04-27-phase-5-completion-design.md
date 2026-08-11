# Phase 5 Completion Design

## Goal

Complete Phase 5 by making discount and voucher behavior match the product semantics that are currently implemented and supportable.

## Product Decision

Discounts are provider-wide percentage discounts. They are not user-specific. User-specific credit grants belong to vouchers.

This means selected-user discount assignment semantics are removed from the admin UI, API contracts, and service behavior. Existing `user_discounts` data can remain inert for compatibility, but new user assignment mutation paths should not be exposed.

## Discount Semantics

- Discount creation and updates manage provider-wide Dodo percentage discounts.
- `maxUses` remains a provider/redemption usage limit.
- `currentUses` remains reserved for actual redemption tracking and must not be mutated by assignment operations.
- Discount create/update payloads must not accept `userIds`.
- Discount assignment endpoints and route builders should be removed when no clients remain.
- Admin discount forms should not render selected-user controls.

## Voucher Semantics

- Vouchers remain the user-specific credit mechanism.
- Voucher deletion remains deactivate-only and documented.
- Duplicate voucher redemptions must remain prevented before credit mutation.
- Voucher redemption notification failure must not fail credit redemption.
- Add focused concurrency/duplicate redemption tests around redemption reservation and credit mutation behavior.

## Provider Sync

Discount provider create/update/delete behavior remains as currently implemented:

- Create validates provider code availability before local persistence.
- Local create failures clean up newly created provider discounts.
- Updates sync provider-relevant fields already supported by the service.
- Deletes remove the provider discount before local deletion.

Full durable provider-sync outbox is out of scope for this pass because the selected-user product decision removes the largest unsupported restriction-sync path, and existing compensation covers the known local create orphan case.

## Testing Strategy

- Use TDD for behavior changes.
- Add/adjust contract tests proving unsupported discount user assignment fields are stripped or rejected.
- Add route tests proving discount assignment endpoints are no longer part of app-owned routes.
- Add service tests proving discount create/update do not process user assignment payloads.
- Add voucher tests for duplicate/concurrent redemption behavior using existing service abstractions and mocks.
- Run focused tests, full API tests, and all typechecks before PR.

## Scope Boundaries

- Do not add a discount-code checkout flow in this pass.
- Do not attempt to delete historical `user_discounts` data unless required by type/build failures.
- Do not implement Phase 6 notification/audit/logging work.
