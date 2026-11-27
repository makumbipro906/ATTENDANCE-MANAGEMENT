import {connection, NextResponse} from "next/server";
import {z} from "zod";

import {
    isSafeSameOriginRequest,
    PASSWORD_SETUP_COOKIE,
    PASSWORD_SETUP_MAX_AGE_SECONDS,
    verifyPasswordResetOtp,
} from "@/lib/server/staff-auth";

const verifySchema = z.object({
    username: z.string().trim().min(1).max(80),
    code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) {
        return Response.json({error: "Request origin is not allowed."}, {status: 403});
    }
    const parsed = verifySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Enter your username and six-digit recovery code."}, {status: 400});

    try {
        const token = await verifyPasswordResetOtp(parsed.data.username, parsed.data.code);
        const response = NextResponse.json({passwordSetupRequired: true}, {
            headers: {"Cache-Control": "no-store"},
        });
        response.cookies.set(PASSWORD_SETUP_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: PASSWORD_SETUP_MAX_AGE_SECONDS,
        });
        return response;
    } catch (error) {
        if (error instanceof Error && error.message === "OTP_INVALID") {
            return Response.json({error: "That recovery code is incorrect."}, {status: 401});
        }
        if (error instanceof Error && error.message === "OTP_CHALLENGE_EXPIRED") {
            return Response.json({error: "That recovery code is expired or invalid. Request a new one."}, {status: 410});
        }
        console.error("Unable to verify password recovery code:", error);
        return Response.json({error: "The recovery code could not be verified."}, {status: 503});
    }
}
