// @platform/contracts/wire — the over-the-wire contract.
//
// Everything exported from here is language-agnostic in spirit: zod schemas
// describing request/response payloads, error codes, pagination shapes, and
// query parameters that any API implementation (Hono, FastAPI, .NET, etc.)
// must honor. Generators (e.g. PR 1.2 OpenAPI emitter) read this barrel
// exclusively. Do NOT import TS-only ergonomics (route URL builders, form
// helpers, branded types) from here — those live in `@platform/contracts/ts`.

export * from "./common/result";
export * from "./common/error-codes";
export * from "./common/pagination";
export * from "./common/query";
export * from "./common/ids";
export * from "./system/responses";
export * from "./logs/common";
export * from "./auth/requests";
export * from "./auth/responses";
export * from "./admin/requests";
export * from "./admin/responses";
export * from "./billing/requests";
export * from "./billing/responses";
export * from "./users/responses";
export * from "./notifications/common";
export * from "./notifications/admin";
export * from "./discounts/common";
export * from "./vouchers/common";
export * from "./payments/requests";
export * from "./payments/responses";
export * from "./email/requests";
export * from "../certdrill";
