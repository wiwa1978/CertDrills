# Multi-client SDK usage

This app consumes API contracts from `apps/api` OpenAPI spec.

## Generate API types

Run API locally on `http://localhost:8787`, then run:

```bash
bun run generate:api-types
```

This generates TypeScript API types at:

`src/lib/api/openapi.generated.ts`

## Runtime API client

Use the lightweight typed helper in:

`src/lib/api/openapi-client.ts`

## Cross-client strategy

- Web (Next.js): use generated TypeScript types and fetch wrappers.
- Mobile/Desktop: generate client SDKs from `/openapi.json` using platform tools.
- Keep API contract updates backward-compatible where possible.
