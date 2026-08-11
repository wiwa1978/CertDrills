// @platform/contracts/ts — TypeScript-only ergonomics layered on top of the
// wire contract. Route URL builders, form-validation schemas with
// regex/i18n strings, branded types, and Hono-specific helpers belong here.
//
// Anything in this subpath is private to the TS clients and is NOT part of
// the cross-language API contract. A future FastAPI/.NET reimplementation
// will replace these helpers with its own equivalents while still honoring
// the schemas exported from `@platform/contracts/wire`.

export * from "./api/routes";
export * from "./application-settings";
export * from "./billing/config";
export * from "./billing/plans";
export * from "./auth/forms";
export * from "./users/forms";
