# web

This is the main Next.js web client for the platform.

## Run

From repository root:

```bash
bun run dev:web
```

Or from this folder:

```bash
bun run dev
```

The app expects API endpoints to be served by `apps/api`.

## Environment

Use `.env` in this folder. Minimum keys:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_API_URL`

## Notes

- Frontend auth and business interactions are API-first.
- Better Auth server runtime is provided by `apps/api`.
- Runtime data access uses `src/lib/services/*` and `src/lib/api/*`; `src/actions/*` is not used.
- Database access, email sending, payment provider integration, and admin authorization do not live in this app.
