/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as automation_endpoints from "../automation/endpoints.js";
import type * as automation_outbox from "../automation/outbox.js";
import type * as automation_payload from "../automation/payload.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_loanQueries from "../lib/loanQueries.js";
import type * as lib_loanRules from "../lib/loanRules.js";
import type * as lib_loanView from "../lib/loanView.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_redact from "../lib/redact.js";
import type * as lib_shortCode from "../lib/shortCode.js";
import type * as lib_signedRoute from "../lib/signedRoute.js";
import type * as lib_signing from "../lib/signing.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_toolLifecycle from "../lib/toolLifecycle.js";
import type * as loans from "../loans.js";
import type * as seed from "../seed.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "automation/endpoints": typeof automation_endpoints;
  "automation/outbox": typeof automation_outbox;
  "automation/payload": typeof automation_payload;
  crons: typeof crons;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/availability": typeof lib_availability;
  "lib/constants": typeof lib_constants;
  "lib/errors": typeof lib_errors;
  "lib/loanQueries": typeof lib_loanQueries;
  "lib/loanRules": typeof lib_loanRules;
  "lib/loanView": typeof lib_loanView;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/redact": typeof lib_redact;
  "lib/shortCode": typeof lib_shortCode;
  "lib/signedRoute": typeof lib_signedRoute;
  "lib/signing": typeof lib_signing;
  "lib/text": typeof lib_text;
  "lib/toolLifecycle": typeof lib_toolLifecycle;
  loans: typeof loans;
  seed: typeof seed;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
