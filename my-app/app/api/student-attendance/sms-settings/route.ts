import {connection} from "next/server";
import {z} from "zod";

import {
    DEFAULT_SMS_SETTINGS,
    getSmsSettings,
    saveStudentAttendanceSetting,
} from "@/lib/server/student-attendance-settings";
import {isYoolaSmsConfigured} from "@/lib/server/yoola-sms";

const smsSettingsSchema = z.object({
    enabled: z.boolean(),
    charactersPerPart: z.number().int().min(1).max(1600),
    costPerPart: z.number().min(0).max(1_000_000),
    currency: z.literal("UGX"),
    daySignInTemplate: z.string().trim().min(1).max(1000),
    daySignOutTemplate: z.string().trim().min(1).max(1000),
    boardingSignInTemplate: z.string().trim().min(1).max(1000),
    boardingSignOutTemplate: z.string().trim().min(1).max(1000),
}).strict();

export async function GET(request: Request) {
    await connection();
    try {
        const settings = await getSmsSettings();
        return Response.json({
            ...DEFAULT_SMS_SETTINGS,
            ...settings,
            providerConfigured: isYoolaSmsConfigured(),
            appOrigin: new URL(request.url).origin,
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load attendance SMS settings:", error);
        return Response.json({error: "SMS settings could not be loaded."}, {status: 503});
    }
}

export async function PUT(request: Request) {
    await connection();
    const parsed = smsSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Check the SMS settings and template values."}, {status: 400});
    try {
        await saveStudentAttendanceSetting("student_attendance.sms", parsed.data);
        return Response.json({ok: true, settings: parsed.data}, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to save attendance SMS settings:", error);
        return Response.json({error: "SMS settings could not be saved."}, {status: 503});
    }
}
