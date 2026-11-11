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
import type * as automation_outbox from "../automation/outbox.js";
import type * as automation_payload from "../automation/payload.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_loanRules from "../lib/loanRules.js";
import type * as lib_loanView from "../lib/loanView.js";
import type * as lib_signing from "../lib/signing.js";
import type * as lib_toolLifecycle from "../lib/toolLifecycle.js";
import type * as loans from "../loans.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "automation/outbox": typeof automation_outbox;
  "automation/payload": typeof automation_payload;
  "lib/auth": typeof lib_auth;
  "lib/availability": typeof lib_availability;
  "lib/constants": typeof lib_constants;
  "lib/errors": typeof lib_errors;
  "lib/loanRules": typeof lib_loanRules;
  "lib/loanView": typeof lib_loanView;
  "lib/signing": typeof lib_signing;
  "lib/toolLifecycle": typeof lib_toolLifecycle;
  loans: typeof loans;
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

export declare const components: {};
