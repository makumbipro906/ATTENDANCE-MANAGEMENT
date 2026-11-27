import {connection, NextResponse} from "next/server";
import {z} from "zod";

import {getDatabase} from "@/lib/server/database";
import {
    clearLoginFailures,
    createSession,
    isSafeSameOriginRequest,
    loginAttemptIsLocked,
    PASSWORD_SETUP_COOKIE,
    PASSWORD_SETUP_MAX_AGE_SECONDS,
    recordFailedLogin,
    STAFF_SESSION_COOKIE,
    verifyPendingActivationOtp,
    verifyPassword,
} from "@/lib/server/staff-auth";

const loginSchema = z.object({
    username: z.string().trim().min(1).max(80),
    password: z.string().min(1).max(256),
}).strict();

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) return Response.json({error: "Request origin is not allowed."}, {status: 403});
    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Enter your username and password."}, {status: 400});

    try {
        if (await loginAttemptIsLocked(parsed.data.username)) {
            return Response.json({error: "Too many unsuccessful sign-in attempts. Try again in 15 minutes."}, {status: 429});
        }
        const user = await getDatabase().prepare(
            `SELECT id, password_hash FROM staff_users
             WHERE username = ? AND active = 1`,
        ).get(parsed.data.username) as {id: string; password_hash: string | null} | undefined;
        if (!user) {
            await recordFailedLogin(parsed.data.username);
            return Response.json({error: "Username or password is incorrect."}, {status: 401});
        }
        if (!user.password_hash) {
            try {
                const setupToken = await verifyPendingActivationOtp(parsed.data.username, parsed.data.password);
                await clearLoginFailures(parsed.data.username);
                const response = NextResponse.json({passwordSetupRequired: true}, {
                    headers: {"Cache-Control": "no-store"},
                });
                response.cookies.set(PASSWORD_SETUP_COOKIE, setupToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "strict",
                    path: "/",
                    maxAge: PASSWORD_SETUP_MAX_AGE_SECONDS,
                });
                return response;
            } catch (error) {
                await recordFailedLogin(parsed.data.username);
                if (error instanceof Error && error.message === "OTP_INVALID") {
                    return Response.json({error: "The activation code is incorrect."}, {status: 401});
                }
                if (error instanceof Error && error.message === "OTP_CHALLENGE_EXPIRED") {
                    return Response.json({error: "The activation code has expired. Contact your administrator for a new one."}, {status: 410});
                }
                throw error;
            }
        }
        if (!await verifyPassword(parsed.data.password, user.password_hash)) {
            await recordFailedLogin(parsed.data.username);
            return Response.json({error: "Username or password is incorrect."}, {status: 401});
        }
        await clearLoginFailures(parsed.data.username);
        const {token} = await createSession(user.id);
        const response = NextResponse.json({ok: true}, {headers: {"Cache-Control": "no-store"}});
        response.cookies.set(STAFF_SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
        });
        return response;
    } catch (error) {
        console.error("Unable to sign in staff user:", error);
        return Response.json({error: "Sign-in could not be completed."}, {status: 503});
    }
}
