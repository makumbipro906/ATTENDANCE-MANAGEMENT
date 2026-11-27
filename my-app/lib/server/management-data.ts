import "server-only";

import {query} from "@/lib/server/database";
import type {ManagementRow} from "@/lib/school-types";

export async function getBiometricManagementRows(status: "Pending" | "Complete"): Promise<ManagementRow[]> {
    const {rows} = await query<{
        id: string;
        full_name: string;
        admission_number: string;
        class_name: string;
        stream: string;
        biometrics_status: "Pending" | "Complete";
        biometrics_captured_at: string | null;
    }>(
        `SELECT id, full_name, admission_number, class_name, stream,
                biometrics_status, biometrics_captured_at
         FROM student_records
         WHERE status = 'Active' AND biometrics_status = ?
         ORDER BY full_name`,
        [status],
    );
    return rows.map((student) => ({
        id: student.id,
        name: student.full_name,
        detail: `${student.admission_number} · ${student.class_name} ${student.stream}`,
        status: status === "Complete" ? "Complete" : "Missing",
        value: status === "Complete" ? "Fingerprint captured" : "Fingerprint not captured",
        lastUpdated: student.biometrics_captured_at ?? undefined,
        href: `/students/${student.id}`,
    }));
}
