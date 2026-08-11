# Flat Transaction Admin Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten transaction admin billing navigation into one eight-section parent tab row.

**Architecture:** A transaction-specific top-level tab component owns `section` navigation for dashboard and existing Discounts/Vouchers sections. The transaction dashboard becomes a section renderer without nested Radix tabs, while credits and subscriptions continue using existing layouts.

**Tech Stack:** React, Next.js, Radix Tabs, next-intl, Vitest, Bun

---

### Task 1: Flatten Transaction Navigation

**Files:**
- Create or modify transaction admin tab/navigation components.
- Modify transaction dashboard section rendering.
- Modify admin billing page routing.
- Update focused component/page tests.

- [ ] Add failing tests for eight peer tabs, active sections, legacy `tab` normalization, and no nested tabs.
- [ ] Implement one transaction-mode tab row using `section` URLs.
- [ ] Render transaction header/filters with the selected dashboard section and preserve existing Discounts/Vouchers content.
- [ ] Keep credit/subscription branches unchanged.
- [ ] Verify focused tests, typecheck, lint, and responsive overflow structure.

### Task 2: Verify Localization And Repository

- [ ] Confirm EN/NL/FR section labels and message parity.
- [ ] Run `git diff --check` and `bun run test:ci`.
- [ ] Review the final diff for removed nested tab markup and unchanged dashboard data semantics.
