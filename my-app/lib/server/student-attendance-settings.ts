import "server-only";

import {getDatabase} from "@/lib/server/database";

export type SmsSettings = {
    enabled: boolean;
    charactersPerPart: number;
    costPerPart: number;
    currency: "UGX";
    daySignInTemplate: string;
    daySignOutTemplate: string;
    boardingSignInTemplate: string;
    boardingSignOutTemplate: string;
};

export type AttendanceSettings = {
    schoolDays: number[];
    lateThreshold: string;
    holidays: {id: string; name: string; startDate: string; endDate: string}[];
};

export const DEFAULT_SMS_SETTINGS: SmsSettings = {
    enabled: true,
    charactersPerPart: 160,
    costPerPart: 40,
    currency: "UGX",
    daySignInTemplate: "Dear Parent/Guardian, {student_name} reported to school today at {time}. Thank you.",
    daySignOutTemplate: "Dear Parent/Guardian, {student_name} left school on {date} at {time}. Thank you.",
    boardingSignInTemplate: "Dear Parent/Guardian, {student_name} signed in at school at {time}. Thank you.",
    boardingSignOutTemplate: "Dear Parent/Guardian, {student_name} signed out of school on {date} at {time}. Thank you.",
};

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
    schoolDays: [1, 2, 3, 4, 5, 6],
    lateThreshold: "08:30",
    holidays: [],
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await getDatabase().prepare(
        "SELECT setting_value FROM application_settings WHERE setting_key = ?",
    ).get(key) as {setting_value: unknown} | undefined;
    return row ? (typeof row.setting_value === "string" ? JSON.parse(row.setting_value) : row.setting_value) as T : fallback;
}

export async function getSmsSettings() {
    const saved = await readSetting<Partial<SmsSettings> & {signInTemplate?: string; signOutTemplate?: string}>(
        "student_attendance.sms",
        DEFAULT_SMS_SETTINGS,
    );
    return {
        ...DEFAULT_SMS_SETTINGS,
        ...saved,
        daySignInTemplate: saved.daySignInTemplate ?? saved.signInTemplate ?? DEFAULT_SMS_SETTINGS.daySignInTemplate,
        daySignOutTemplate: saved.daySignOutTemplate ?? saved.signOutTemplate ?? DEFAULT_SMS_SETTINGS.daySignOutTemplate,
        boardingSignInTemplate: saved.boardingSignInTemplate ?? DEFAULT_SMS_SETTINGS.boardingSignInTemplate,
        boardingSignOutTemplate: saved.boardingSignOutTemplate ?? DEFAULT_SMS_SETTINGS.boardingSignOutTemplate,
    };
}

export async function getAttendanceSettings() {
    return readSetting("student_attendance.attendance", DEFAULT_ATTENDANCE_SETTINGS);
}

export async function getExpectedSchoolDates(startDate: string, endDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
        throw new Error("A valid school calendar date range is required.");
    }

    const settings = await getAttendanceSettings();
    const calendarRows = await getDatabase().prepare(
        "SELECT calendar_date, is_school_day FROM school_calendar_days WHERE calendar_date BETWEEN ? AND ?",
    ).all(startDate, endDate) as {calendar_date: string; is_school_day: number}[];
    const calendarOverrides = new Map(calendarRows.map((row) => [row.calendar_date, Boolean(row.is_school_day)]));
    const expectedDates: string[] = [];
    const date = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    while (date <= end) {
        const value = date.toISOString().slice(0, 10);
        const holiday = settings.holidays.some((item) => item.startDate <= value && item.endDate >= value);
        const calendarOverride = calendarOverrides.get(value);
        const scheduledDay = settings.schoolDays.includes(date.getUTCDay());
        if (!holiday && (calendarOverride ?? scheduledDay)) expectedDates.push(value);
        date.setUTCDate(date.getUTCDate() + 1);
    }
    return expectedDates;
}

export async function saveStudentAttendanceSetting(key: "student_attendance.sms" | "student_attendance.attendance", value: SmsSettings | AttendanceSettings) {
    await getDatabase().prepare(
        `INSERT INTO application_settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key) DO UPDATE SET
            setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
    ).run(key, JSON.stringify(value));
}

export function smsParts(message: string, charactersPerPart: number) {
    return Math.max(1, Math.ceil([...message].length / charactersPerPart));
}
