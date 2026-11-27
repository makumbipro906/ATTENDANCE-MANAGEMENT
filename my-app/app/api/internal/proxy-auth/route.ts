import {NextRequest, NextResponse} from "next/server";

import {getStaffSession, isInitialSetupRequired, STAFF_SESSION_COOKIE} from "@/lib/server/staff-auth";

// Session lookup used by proxy.ts. The proxy runs in an edge runtime that cannot load the
// PostgreSQL driver, so it asks this Node.js route for the caller's own session state.
export async function POST(request: NextRequest) {
    const setupRequired = await isInitialSetupRequired();
    const session = setupRequired
        ? null
        : await getStaffSession(request.cookies.get(STAFF_SESSION_COOKIE)?.value);
    return NextResponse.json(
        {setupRequired, session: session ? {permissions: session.permissions} : null},
        {headers: {"Cache-Control": "no-store"}},
    );
}
