import {connection} from "next/server";
import {cookies} from "next/headers";

import {getStaffSession, isInitialSetupRequired, STAFF_SESSION_COOKIE} from "@/lib/server/staff-auth";

// Used by proxy.ts, which runs as an edge function and cannot use the Postgres driver directly.
export async function GET() {
    await connection();
    const setupRequired = await isInitialSetupRequired();
    const session = setupRequired
        ? null
        : await getStaffSession((await cookies()).get(STAFF_SESSION_COOKIE)?.value);
    return Response.json(
        {setupRequired, session: session ? {permissions: session.permissions} : null},
        {headers: {"Cache-Control": "no-store"}},
    );
}
