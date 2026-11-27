import {connection} from "next/server";
import {z} from "zod";

import {
    isSafeSameOriginRequest,
    requestStaffPasswordReset,
} from "@/lib/server/staff-auth";

const requestSchema = z.object({
    username: z.string().trim().min(1).max(80),
}).strict();

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) {
        return Response.json({error: "Request origin is not allowed."}, {status: 403});
    }
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Enter your username."}, {status: 400});

    try {
        await requestStaffPasswordReset(parsed.data.username);
    } catch (error) {
        console.error("Unable to send password recovery code:", error);
    }
    return Response.json(
        {message: "If the account is eligible, a recovery code has been sent to its registered phone."},
        {headers: {"Cache-Control": "no-store"}},
    );
}
