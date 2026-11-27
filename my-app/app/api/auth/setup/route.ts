import {connection} from "next/server";
import {z} from "zod";

import {getDatabase} from "@/lib/server/database";
import {
    issueStaffLoginOtp,
    isInitialSetupRequired,
    isLocalDevelopmentOtpRequest,
    isSafeSameOriginRequest,
    isSmsOtpConfigured,
    setupInitialAdministrator,
} from "@/lib/server/staff-auth";

const setupSchema = z.object({
    username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
    password: z.string().min(12).max(256),
    phone: z.string().trim().min(7).max(32).optional(),
}).strict();

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) return Response.json({error: "Request origin is not allowed."}, {status: 403});
    if (!await isInitialSetupRequired()) {
        return Response.json({error: "Administrator setup has already been completed."}, {status: 409});
    }
    const parsed = setupSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return Response.json({error: "Enter a valid username and a password with at least 12 characters."}, {status: 400});
    }
    const useLocalOtp = isLocalDevelopmentOtpRequest(request);
    if (!useLocalOtp && !isSmsOtpConfigured()) {
        return Response.json({error: "One-time-code SMS is not configured. Configure the SMS provider before initial setup."}, {status: 503});
    }

    try {
        const profile = await getDatabase().prepare(
            "SELECT phone FROM staff_profiles WHERE identity_id = 'shared-school-profile'",
        ).get() as {phone: string} | undefined;
        const phone = useLocalOtp ? "" : profile?.phone.trim() || parsed.data.phone?.trim();
        if (!useLocalOtp && !phone) {
            return Response.json({error: "Enter an administrator phone number to receive your sign-in code."}, {status: 400});
        }
        const userId = await setupInitialAdministrator({
            username: parsed.data.username,
            password: parsed.data.password,
            firstName: "School",
            lastName: "Administrator",
            phone: phone ?? "",
        });
        if (!userId) return Response.json({error: "Administrator setup has already been completed."}, {status: 409});
        const challenge = await issueStaffLoginOtp(userId, useLocalOtp);
        return Response.json({otpRequired: true, ...challenge}, {status: 201, headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        if (error instanceof Error && error.message === "OTP_DELIVERY_FAILED") {
            return Response.json({error: "The administrator account was created, but its sign-in code could not be delivered. Check the SMS provider and try signing in again."}, {status: 503});
        }
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
            return Response.json({error: "That username is already in use."}, {status: 409});
        }
        console.error("Unable to complete initial administrator setup:", error);
        return Response.json({error: "Administrator setup could not be completed."}, {status: 503});
    }
}
