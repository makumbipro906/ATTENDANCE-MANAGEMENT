import {connection} from "next/server";
import {cookies} from "next/headers";

import {
    isSafeSameOriginRequest,
    refreshStaffSession,
    STAFF_SESSION_COOKIE,
} from "@/lib/server/staff-auth";

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) {
        return Response.json({error: "Request origin is not allowed."}, {status: 403});
    }

    const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
    if (!await refreshStaffSession(token)) {
        return Response.json(
            {authenticated: false},
            {status: 401, headers: {"Cache-Control": "no-store"}},
        );
    }

    return Response.json(
        {authenticated: true},
        {headers: {"Cache-Control": "no-store"}},
    );
}
