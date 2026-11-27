import {connection, NextResponse} from "next/server";
import {cookies} from "next/headers";
import {z} from "zod";

import {
    isSafeSameOriginRequest,
    PASSWORD_SETUP_COOKIE,
    setPasswordFromSetupToken,
} from "@/lib/server/staff-auth";

const passwordSchema = z.object({
    password: z.string().min(12).max(256),
}).strict();

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) {
        return Response.json({error: "Request origin is not allowed."}, {status: 403});
    }
    const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return Response.json({error: "Choose a password with at least 12 characters."}, {status: 400});
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(PASSWORD_SETUP_COOKIE)?.value;
    if (!token) return Response.json({error: "Your password setup has expired. Start again."}, {status: 401});

    try {
        const purpose = await setPasswordFromSetupToken(token, parsed.data.password);
        const response = NextResponse.json({ok: true, purpose});
        response.cookies.set(PASSWORD_SETUP_COOKIE, "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: 0,
        });
        return response;
    } catch (error) {
        if (error instanceof Error && error.message === "PASSWORD_SETUP_EXPIRED") {
            const response = NextResponse.json({error: "Your password setup has expired. Start again."}, {status: 410});
            response.cookies.set(PASSWORD_SETUP_COOKIE, "", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                path: "/",
                maxAge: 0,
            });
            return response;
        }
        console.error("Unable to set staff password:", error);
        return Response.json({error: "Your password could not be saved."}, {status: 503});
    }
}
