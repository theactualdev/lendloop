import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/board(.*)",
  "/listings(.*)",
  "/requests(.*)",
  "/incoming(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

/*
 * Clerk runs only where a session matters. Its development instance answers an
 * HTML request without its cookie by redirecting to a handshake, and crawlers
 * keep no cookies, so on public pages they would loop and never see the page.
 * Nothing public needs server-side auth: the landing page reads the session in
 * the browser (components/auth-switch.tsx).
 */
export const config = {
  matcher: [
    // The member routes, which isProtectedRoute guards.
    "/(board|listings|requests|incoming|admin)(.*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
