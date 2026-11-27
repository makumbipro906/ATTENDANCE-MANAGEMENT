import {connection} from "next/server";
import {cookies} from "next/headers";

import {getStaffSession, STAFF_SESSION_COOKIE} from "@/lib/server/staff-auth";

export async function GET() {
    await connection();
    const session = await getStaffSession((await cookies()).get(STAFF_SESSION_COOKIE)?.value);
    if (!session) return Response.json({error: "Sign in to continue."}, {status: 401});
    return Response.json(session, {headers: {"Cache-Control": "no-store"}});
}
