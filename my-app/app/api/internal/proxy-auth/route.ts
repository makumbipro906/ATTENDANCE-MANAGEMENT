import {connection} from "next/server";
import {NextRequest, NextResponse} from "next/server";

import {STAFF_SESSION_COOKIE} from "@/lib/staff-session-cookie";
import {getStaffSession, isInitialSetupRequired} from "@/lib/server/staff-auth";

/**
 * Session and setup state for the request proxy.
 *
 * The proxy is the only place that enforces module permissions, but it cannot always
 * reach PostgreSQL: some hosts run the proxy as an Edge Function, where the Node.js
 * `pg` driver and the filesystem are unavailable. This route runs in the Node.js server
 * function and answers the proxy's question about the caller: has the first administrator
 * been created, and which permissions does the caller's own session carry?
 *
 * The response only ever describes the session of the request that made the call, so it
 * exposes nothing that the caller does not already hold in their own cookie.
 */
export async function GET(request: NextRequest) {
    // `connection()` is called outside the try block on purpose: during prerendering it
    // rejects, and that rejection is how Next.js keeps this route dynamic. Catching it
    // would turn the prerender into a failed request and log a misleading error.
    await connection();
    try {
        const setupRequired = await isInitialSetupRequired();
        const session = setupRequired
            ? null
            : await getStaffSession(request.cookies.get(STAFF_SESSION_COOKIE)?.value);
        return NextResponse.json(
            {setupRequired, session: session ? {permissions: session.permissions} : null},
            {headers: {"Cache-Control": "no-store"}},
        );
    } catch (error) {
        console.error("Unable to resolve the proxy authentication state:", error);
        return NextResponse.json(
            {error: "Authentication services are temporarily unavailable."},
            {status: 503, headers: {"Cache-Control": "no-store", "Retry-After": "30"}},
        );
    }
}
