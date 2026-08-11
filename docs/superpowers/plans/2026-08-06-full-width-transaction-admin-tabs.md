# Full-Width Transaction Admin Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make transaction admin parent tabs fill the page width without sacrificing mobile readability.

**Architecture:** The existing semantic navigation remains horizontally scrollable on mobile and switches to an eight-column full-width grid at the tablet/desktop breakpoint. Links fill and center within each grid cell.

**Tech Stack:** React, Tailwind CSS, Vitest, Bun

---

### Task 1: Full-Width Responsive Navigation

- [ ] Add failing rendered assertions for mobile minimum widths and desktop eight-column full width.
- [ ] Replace the label-width `inline-flex min-w-max` layout with a responsive mobile flex / desktop grid layout.
- [ ] Preserve active styling, semantic links, `aria-current`, and active-link scrolling.
- [ ] Run focused admin tests, typecheck, lint, diff check, and full CI.
