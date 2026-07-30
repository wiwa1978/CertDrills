// Legacy aggregate barrel — re-exports both the wire contract and the
// TS ergonomics layer so existing importers (`import { ... } from
// "@platform/contracts"`) continue to work unchanged.
//
// New code should import from the explicit subpaths instead:
//   - `@platform/contracts/wire` for zod schemas, error codes, payload shapes
//   - `@platform/contracts/ts`   for route URL builders and form helpers
//
// This split prepares the codebase for PR 1.2 (OpenAPI generated solely from
// the wire layer) and for swapping the API implementation language without
// dragging TS-only helpers into the contract surface. A later PR migrates
// every importer to the explicit subpaths and drops this aggregate barrel.

export * from "./wire";
export * from "./ts";
export * from "./certdrill";
