import {connection, NextResponse} from "next/server";
import {z} from "zod";

import {
    isSafeSameOriginRequest,
    STAFF_SESSION_COOKIE,
    STAFF_SESSION_MAX_AGE_SECONDS,
    verifyStaffLoginOtp,
} from "@/lib/server/staff-auth";

const otpSchema = z.object({
    challengeId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) return Response.json({error: "Request origin is not allowed."}, {status: 403});
    const parsed = otpSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Enter the six-digit sign-in code."}, {status: 400});

    try {
        const {token} = await verifyStaffLoginOtp(parsed.data.challengeId, parsed.data.code);
        const response = NextResponse.json({ok: true});
        response.cookies.set(STAFF_SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
        });
        return response;
    } catch (error) {
        if (error instanceof Error && error.message === "OTP_INVALID") {
            return Response.json({error: "That code is incorrect. Check it and try again."}, {status: 401});
        }
        if (error instanceof Error && error.message === "OTP_CHALLENGE_EXPIRED") {
            return Response.json({error: "That sign-in code has expired. Sign in again to request a new code."}, {status: 410});
        }
        console.error("Unable to verify staff login code:", error);
        return Response.json({error: "The sign-in code could not be verified."}, {status: 503});
    }
}
