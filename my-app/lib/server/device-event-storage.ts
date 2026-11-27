import "server-only";

import {randomUUID} from "node:crypto";
import {withPostgresTransaction} from "@/lib/server/database";
import {schoolDate, type DeviceEvent} from "@/lib/server/attendance-event";
import {getSmsSettings} from "@/lib/server/student-attendance-settings";

type DeviceRow = {device_key: string; time_zone: string};

export function recordDeviceEvent(event: DeviceEvent) {
    return withPostgresTransaction(async (database) => {
        const device = await database.prepare(
            "SELECT device_key, time_zone FROM devices WHERE device_key = ? AND active = 1",
        ).get(event.deviceKey) as DeviceRow | undefined;
        if (!device) return {status: "unknown_device"};

        const rawEventId = randomUUID();
        const occurredAt = new Date(event.occurredAt).toISOString();
        const rawEvent = await database.prepare(
            `INSERT INTO raw_device_events
                (id, device_key, event_id, device_user_id, occurred_at, event_type, scan_result, payload, processing_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received')
             ON CONFLICT (device_key, event_id) DO NOTHING`,
        ).run(rawEventId, event.deviceKey, event.eventId, event.deviceUserId, occurredAt,
            event.eventType, event.result, JSON.stringify(event));
        if (rawEvent.changes === 0) return {status: "duplicate", eventId: event.eventId};

        const updateDeviceTime = async () => database.prepare(
            `UPDATE devices SET last_event_at =
                CASE WHEN last_event_at IS NULL OR last_event_at < ? THEN ? ELSE last_event_at END
             WHERE device_key = ?`,
        ).run(occurredAt, occurredAt, device.device_key);

        if (event.result !== "verified") {
            await database.prepare("UPDATE raw_device_events SET processing_status = 'rejected' WHERE id = ?").run(rawEventId);
            await updateDeviceTime();
            return {status: "rejected", eventId: event.eventId};
        }

        const student = await database.prepare(
            `SELECT s.id, s.full_name, c.name AS class_name, st.name AS stream,
                    sec.name AS section_name, e.id AS enrollment_id
             FROM device_user_mappings m
             JOIN students s ON s.id = m.student_id
             JOIN student_enrollments e ON e.student_id = s.id AND e.status = 'Enrolled'
             JOIN streams st ON st.id = e.stream_id
             JOIN classes c ON c.id = st.class_id
             JOIN sections sec ON sec.id = e.section_id
             WHERE m.device_key = ? AND m.device_user_id = ? AND s.status = 'Active'
             ORDER BY e.enrolled_at DESC
             LIMIT 1`,
        ).get(device.device_key, event.deviceUserId) as {
            id: string; full_name: string; class_name: string; stream: string;
            section_name: string; enrollment_id: string;
        } | undefined;
        if (!student) {
            await database.prepare("UPDATE raw_device_events SET processing_status = 'unknown_student' WHERE id = ?").run(rawEventId);
            await updateDeviceTime();
            return {status: "unknown_student", eventId: event.eventId};
        }

        const attendanceDate = schoolDate(new Date(occurredAt), device.time_zone);
        const attendanceId = randomUUID();
        const inserted = await database.prepare(
            `INSERT INTO attendance_records
                (id, student_id, enrollment_id, device_key, raw_event_id, attendance_date, event_type, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT DO NOTHING`,
        ).run(attendanceId, student.id, student.enrollment_id, device.device_key, rawEventId,
            attendanceDate, event.eventType, occurredAt);
        if (inserted.changes === 0) {
            await database.prepare("UPDATE raw_device_events SET processing_status = 'duplicate' WHERE id = ?").run(rawEventId);
            await updateDeviceTime();
            return {status: "duplicate", eventId: event.eventId};
        }

        const smsSettings = await getSmsSettings();
        const guardians = await database.prepare(
            `SELECT g.full_name, g.relationship, g.phone
             FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
             WHERE sg.student_id = ? AND sg.receives_sms = 1 AND g.phone IS NOT NULL
             ORDER BY sg.is_primary DESC, g.full_name`,
        ).all(student.id) as {full_name: string; relationship: string; phone: string}[];
        const recipients = guardians.filter((guardian) => guardian.phone.trim());
        let notificationStatus: string;
        if (!smsSettings.enabled) {
            notificationStatus = "disabled";
        } else {
            notificationStatus = recipients.length ? "pending" : "blocked";
            const date = attendanceDate.split("-").reverse().join("/");
            const time = new Intl.DateTimeFormat("en-GB", {
                timeZone: device.time_zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
            }).format(new Date(occurredAt));
            const isBoardingStudent = /\bboarding\b/i.test(student.section_name);
            const messageBody = (isBoardingStudent
                ? event.eventType === "fingerprint_check_in" ? smsSettings.boardingSignInTemplate : smsSettings.boardingSignOutTemplate
                : event.eventType === "fingerprint_check_in" ? smsSettings.daySignInTemplate : smsSettings.daySignOutTemplate)
                .replaceAll("{student_name}", student.full_name)
                .replaceAll("{date}", date)
                .replaceAll("{time}", time);
            const insertNotification = database.prepare(
                `INSERT INTO sms_notifications
                    (id, attendance_id, student_id, recipient_phone, message_body, status, last_error)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
            );
            if (recipients.length) {
                for (const recipient of recipients) {
                    await insertNotification.run(randomUUID(), attendanceId, student.id, recipient.phone, messageBody, "pending", null);
                }
            } else {
                await insertNotification.run(randomUUID(), attendanceId, student.id, null, messageBody, "blocked",
                    "No guardian phone number is registered.");
            }
        }
        await database.prepare(
            "UPDATE raw_device_events SET processing_status = 'processed', student_id = ? WHERE id = ?",
        ).run(student.id, rawEventId);
        await updateDeviceTime();
        await database.prepare(
            "INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details) VALUES (?, 'device', 'attendance.recorded', 'attendance', ?, ?)",
        ).run(randomUUID(), attendanceId, JSON.stringify({deviceKey: device.device_key, eventId: event.eventId}));
        return {status: "recorded", eventId: event.eventId, attendanceId, notificationStatus};
    });
}

export async function claimSmsNotifications() {
    return withPostgresTransaction(async (database) => {
        const messages = await database.prepare(
            `SELECT id, attempt_count FROM sms_notifications
             WHERE (
                status IN ('pending', 'failed') AND attempt_count < 5
                AND (retry_after IS NULL OR retry_after::timestamptz <= CURRENT_TIMESTAMP)
             ) OR (
                status = 'processing' AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
                AND attempt_count < 5
             )
             ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED`,
        ).all() as {id: string; attempt_count: number}[];
        const update = database.prepare(
            `UPDATE sms_notifications
             SET status = 'processing', attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
        );
        const claimed: {id: string; recipient_phone: string; message_body: string; attempt_count: number}[] = [];
        for (const {id} of messages) {
            await update.run(id);
            const row = await database.prepare(
                "SELECT id, recipient_phone, message_body, attempt_count FROM sms_notifications WHERE id = ?",
            ).get(id) as {
                id: string; recipient_phone: string; message_body: string; attempt_count: number;
            } | undefined;
            if (row) claimed.push(row);
        }
        return claimed;
    });
}
