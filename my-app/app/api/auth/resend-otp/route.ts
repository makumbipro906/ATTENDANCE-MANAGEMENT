import {connection} from "next/server";
import {z} from "zod";

import {
    isLocalDevelopmentOtpRequest,
    isSafeSameOriginRequest,
    resendStaffLoginOtp,
} from "@/lib/server/staff-auth";

const resendSchema = z.object({
    username: z.string().trim().min(1).max(80),
    challengeId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) return Response.json({error: "Request origin is not allowed."}, {status: 403});
    const parsed = resendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Sign in again to request a new code."}, {status: 400});

    try {
        return Response.json(await resendStaffLoginOtp(
            parsed.data.username,
            parsed.data.challengeId,
            isLocalDevelopmentOtpRequest(request),
        ), {
            headers: {"Cache-Control": "no-store"},
        });
    } catch (error) {
        if (error instanceof Error && error.message === "OTP_NOT_CONFIGURED") {
            return Response.json({error: "One-time-code SMS is not configured. Contact your system administrator."}, {status: 503});
        }
        if (error instanceof Error && error.message === "OTP_PHONE_MISSING") {
            return Response.json({error: "No phone number is registered for this account. Contact your system administrator."}, {status: 409});
        }
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") {
            return Response.json({error: "Wait one minute before requesting another code."}, {status: 429});
        }
        if (error instanceof Error && error.message === "OTP_CHALLENGE_EXPIRED") {
            return Response.json({error: "The sign-in code expired. Sign in again to request a new code."}, {status: 410});
        }
        if (error instanceof Error && error.message === "OTP_DELIVERY_FAILED") {
            return Response.json({error: "The sign-in code could not be sent. Try again later."}, {status: 503});
        }
        console.error("Unable to resend staff login code:", error);
        return Response.json({error: "A new sign-in code could not be sent."}, {status: 503});
    }
}
