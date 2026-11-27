import {connection} from "next/server";
import {cookies} from "next/headers";
import {z} from "zod";

import {getDatabase} from "@/lib/server/database";
import {
    getStaffSession,
    issueStaffLoginOtp,
    STAFF_SESSION_COOKIE,
} from "@/lib/server/staff-auth";

const resendSchema = z.object({id: z.string().uuid()}).strict();

export async function POST(request: Request) {
    await connection();
    const cookieStore = await cookies();
    const session = await getStaffSession(cookieStore.get(STAFF_SESSION_COOKIE)?.value);
    if (!session?.roleNames.some((name) => name.toLocaleLowerCase() === "super-administrator")) {
        return Response.json({error: "Only a Super Administrator can resend activation codes."}, {status: 403});
    }
    const parsed = resendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Choose a valid pending user account."}, {status: 400});

    const user = await getDatabase().prepare(
        "SELECT id FROM staff_users WHERE id = ? AND active = 1 AND password_hash IS NULL",
    ).get(parsed.data.id) as {id: string} | undefined;
    if (!user) return Response.json({error: "That account is not awaiting activation."}, {status: 409});

    try {
        const challenge = await issueStaffLoginOtp(user.id, false, "activation");
        return Response.json({maskedPhone: challenge.maskedPhone}, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        if (error instanceof Error && error.message === "OTP_NOT_CONFIGURED") {
            return Response.json({error: "The SMS service is not configured."}, {status: 503});
        }
        if (error instanceof Error && error.message === "OTP_PHONE_MISSING") {
            return Response.json({error: "This account has no registered phone number."}, {status: 409});
        }
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") {
            return Response.json({error: "Wait one minute before requesting another activation code."}, {status: 429});
        }
        if (error instanceof Error && error.message === "OTP_DELIVERY_FAILED") {
            return Response.json({error: "The activation code could not be sent. Try again later."}, {status: 503});
        }
        console.error("Unable to resend staff activation code:", error);
        return Response.json({error: "The activation code could not be sent."}, {status: 503});
    }
}
