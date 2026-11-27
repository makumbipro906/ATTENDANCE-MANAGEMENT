import {connection, NextResponse} from "next/server";
import {cookies} from "next/headers";

import {
    deleteSession,
    isSafeSameOriginRequest,
    STAFF_SESSION_COOKIE,
} from "@/lib/server/staff-auth";

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) return Response.json({error: "Request origin is not allowed."}, {status: 403});
    const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
    if (token) await deleteSession(token);
    const response = NextResponse.json({ok: true});
    response.cookies.set(STAFF_SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(0),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
}
