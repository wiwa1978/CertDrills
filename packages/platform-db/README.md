# Platform Database

`@platform/platform-db` owns the Drizzle schema and generated migrations for the platform PostgreSQL database.

## Migration Workflow

Run commands from the repo root unless noted otherwise.

Generate a migration after changing files in `packages/platform-db/src/schema`:

```bash
bun run db:generate -- --name describe_change
```

Review and commit the generated SQL and metadata under `packages/platform-db/drizzle`.

Check committed migrations for consistency:

```bash
bun run db:check
```

Apply migrations to a database:

```bash
MIGRATION_DATABASE_URL=postgres://migration_owner:password@host:5432/database bun run db:migrate
```

`0021_transaction_orders_created_at_id_idx` uses a normal `CREATE INDEX` because the Drizzle transactional migration runner cannot use `CREATE INDEX CONCURRENTLY`. It takes a brief write lock; run this migration in a maintenance window if `transaction_orders` is already populated.

Open Drizzle Studio against a database:

```bash
DATABASE_URL=postgres://user:password@host:5432/database bun run db:studio
```

## Rules

- Do not add DB-backed runtime behavior without a matching generated migration.
- Do not hand-edit migration metadata in `packages/platform-db/drizzle/meta`.
- Hand-written SQL is acceptable only when Drizzle cannot express the change; keep it in the generated migration file and explain why in the PR.
