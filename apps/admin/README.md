# admin

Dedicated Next.js app for privileged admin operations.

## Run

From repository root:

```bash
bun run dev:admin
```

Or from this folder:

```bash
bun run dev
```

## Security model

- This app only allows users who pass the API's admin authorization checks.
- Role and allowlist enforcement live in `apps/api`.
- On failed access checks, the app redirects to the main app login.

## Environment

Use `.env` in this folder. Minimum keys:

- `NEXT_PUBLIC_APP_URL` (admin URL, e.g. `http://localhost:3001`)
- `NEXT_PUBLIC_MAIN_APP_URL` (main app URL, e.g. `http://localhost:3000`)
- `NEXT_PUBLIC_API_URL` (API URL, e.g. `http://localhost:8787`)

Backend secrets, Better Auth server config, and admin allowlist configuration belong to `apps/api`.
