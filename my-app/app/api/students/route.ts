import {connection} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";

import {query, type SQLInputValue, withPostgresTransaction, type PostgresDatabase} from "@/lib/server/database";
import {getSchoolSettings} from "@/lib/server/school-settings";

const guardianSchema = z.object({
    name: z.string().max(200),
    relationship: z.string().max(100),
    phone: z.string().max(32),
    email: z.string().max(254),
}).strict();

const studentSchema = z.object({
    id: z.string().uuid().optional(),
    admissionNumber: z.string().trim().min(1).max(80),
    fullName: z.string().trim().min(1).max(200),
    dateOfBirth: z.string().nullable().optional(),
    gender: z.string().min(1).max(40),
    academicYear: z.string().min(1).max(40),
    term: z.string().min(1).max(80),
    className: z.string().min(1).max(100),
    stream: z.string().min(1).max(100),
    section: z.string().min(1).max(100),
    guardianName: z.string().min(1).max(200),
    relationship: z.string().min(1).max(100),
    primaryPhone: z.string().max(32),
    studentPhone: z.string().max(32),
    guardianEmail: z.string().max(254),
    additionalGuardians: z.array(guardianSchema).max(2).optional(),
    status: z.enum(["Active", "Archived"]),
    biometricsStatus: z.enum(["Pending", "Complete"]),
    biometricsCapturedAt: z.string().datetime().optional(),
}).strict();

type StudentRow = {
    id: string;
    admission_number: string;
    full_name: string;
    date_of_birth: string | null;
    gender: string;
    academic_year: string;
    term: string;
    class_name: string;
    stream: string;
    section: string;
    guardian_name: string;
    relationship: string;
    primary_phone: string | null;
    student_phone: string | null;
    guardian_email: string | null;
    additional_guardians: z.infer<typeof guardianSchema>[] | string;
    status: "Active" | "Archived";
    biometrics_status: "Pending" | "Complete";
    biometrics_captured_at: string | null;
};
type StudentValues = z.infer<typeof studentSchema>;

function toStudent(row: StudentRow) {
    const additionalGuardians = typeof row.additional_guardians === "string"
        ? JSON.parse(row.additional_guardians) as z.infer<typeof guardianSchema>[]
        : row.additional_guardians;
    return {
        id: row.id,
        admissionNumber: row.admission_number,
        fullName: row.full_name,
        dateOfBirth: row.date_of_birth ?? "",
        gender: row.gender,
        academicYear: row.academic_year,
        term: row.term,
        className: row.class_name,
        stream: row.stream,
        section: row.section,
        guardianName: row.guardian_name,
        relationship: row.relationship,
        primaryPhone: row.primary_phone ?? "",
        studentPhone: row.student_phone ?? "",
        guardianEmail: row.guardian_email ?? "",
        additionalGuardians: additionalGuardians ?? [],
        status: row.status,
        biometricsStatus: row.biometrics_status,
        ...(row.biometrics_captured_at ? {biometricsCapturedAt: row.biometrics_captured_at} : {}),
    };
}

function valuesForStudent(student: StudentValues): SQLInputValue[] {
    return [
        student.admissionNumber,
        student.fullName,
        student.dateOfBirth || null,
        student.gender,
        student.studentPhone || null,
        student.status,
    ];
}

async function syncStudentRelations(database: PostgresDatabase, studentId: string, student: StudentValues) {
    const term = await database.prepare(
        "SELECT t.id FROM terms t JOIN school_years y ON y.id = t.school_year_id WHERE y.year = ? AND t.name = ?",
    ).get(Number(student.academicYear), student.term) as {id: string} | undefined;
    const stream = await database.prepare(
        "SELECT s.id FROM streams s JOIN classes c ON c.id = s.class_id WHERE c.name = ? AND s.name = ?",
    ).get(student.className, student.stream) as {id: string} | undefined;
    const section = await database.prepare("SELECT id FROM sections WHERE name = ?").get(student.section) as {id: string} | undefined;
    if (!term || !stream || !section) throw new Error("Student placement must reference configured school settings.");

    await database.prepare(
        `INSERT INTO student_enrollments (id, student_id, term_id, stream_id, section_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (student_id, term_id) DO UPDATE SET stream_id=EXCLUDED.stream_id,
            section_id=EXCLUDED.section_id`,
    ).run(randomUUID(), studentId, term.id, stream.id, section.id);
    await database.prepare(
        `UPDATE student_enrollments SET status = 'Completed'
         WHERE student_id = ? AND term_id <> ? AND status = 'Enrolled'`,
    ).run(studentId, term.id);
    await database.prepare(
        `INSERT INTO student_biometrics (student_id, status, captured_at)
         VALUES (?, ?, ?)
         ON CONFLICT (student_id) DO UPDATE SET status=EXCLUDED.status,
            captured_at=EXCLUDED.captured_at, updated_at=CURRENT_TIMESTAMP`,
    ).run(studentId, student.biometricsStatus, student.biometricsCapturedAt ?? null);
    await database.prepare("DELETE FROM student_guardians WHERE student_id = ?").run(studentId);
    await database.prepare("DELETE FROM guardians WHERE NOT EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.guardian_id = guardians.id)").run();

    const guardians = [
        {
            name: student.guardianName,
            relationship: student.relationship,
            phone: student.primaryPhone,
            email: student.guardianEmail,
            primary: true,
        },
        ...(student.additionalGuardians ?? []).map((guardian) => ({...guardian, primary: false})),
    ];
    const insertGuardian = database.prepare(
        "INSERT INTO guardians (id, full_name, relationship, phone, email) VALUES (?, ?, ?, ?, ?)",
    );
    const linkGuardian = database.prepare(
        "INSERT INTO student_guardians (student_id, guardian_id, is_primary, receives_sms, primary_student_id) VALUES (?, ?, ?, ?, ?)",
    );
    for (const guardian of guardians) {
        const guardianId = randomUUID();
        await insertGuardian.run(guardianId, guardian.name, guardian.relationship, guardian.phone || null, guardian.email || null);
        await linkGuardian.run(studentId, guardianId, Number(guardian.primary), Number(Boolean(guardian.phone)),
            guardian.primary ? studentId : null);
    }
}

async function validPlacement(student: StudentValues) {
    const settings = await getSchoolSettings();
    const validYear = settings.years.some((year) => String(year.year) === student.academicYear);
    const validTerm = settings.terms.some((term) => term.year === Number(student.academicYear) && term.name === student.term);
    const schoolClass = settings.classes.find((item) => item.name === student.className);
    const validStream = schoolClass && settings.streams.some((stream) =>
        stream.classId === schoolClass.id && stream.name === student.stream,
    );
    return validYear && validTerm && validStream && settings.sections.includes(student.section);
}

function dbError(error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = error.code;
        if (code === "23505") {
            return {status: 409, message: "That admission number is already in use."};
        }
        if (code === "23503") {
            return {status: 409, message: "This student is still referenced by attendance or device records."};
        }
    }
    return {status: 503, message: "Student records could not be saved to PostgreSQL."};
}

export async function GET() {
    await connection();
    try {
        const {rows} = await query<StudentRow>("SELECT * FROM student_records ORDER BY full_name");
        return Response.json(rows.map(toStudent), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load students:", error);
        return Response.json({error: "Student records could not be loaded from PostgreSQL."}, {status: 503});
    }
}

export async function POST(request: Request) {
    await connection();
    const parsed = studentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Student details are invalid.", details: parsed.error.flatten()}, {status: 400});
    try {
        if (!await validPlacement(parsed.data)) {
            return Response.json({error: "Choose an academic year, term, class, stream, and section from the current school settings."}, {status: 400});
        }
        const columns = "admission_number, full_name, date_of_birth, gender, student_phone, status";
        const id = randomUUID();
        const placeholders = valuesForStudent(parsed.data).map(() => "?").join(", ");
        const row = await withPostgresTransaction(async (database) => {
            await database.prepare(
                `INSERT INTO students (id, ${columns}) VALUES (?, ${placeholders})`,
            ).run(id, ...valuesForStudent(parsed.data));
            await syncStudentRelations(database, id, parsed.data);
            const created = await database.prepare("SELECT * FROM student_records WHERE id = ?").get(id) as StudentRow | undefined;
            if (!created) throw new Error("Student record was not created.");
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', 'student.created', 'student', ?, ?)`,
            ).run(randomUUID(), id, JSON.stringify({admissionNumber: parsed.data.admissionNumber}));
            return created;
        });
        return Response.json(toStudent(row), {status: 201});
    } catch (error) {
        console.error("Unable to create student:", error);
        const mapped = dbError(error);
        return Response.json({error: mapped.message}, {status: mapped.status});
    }
}

export async function PUT(request: Request) {
    await connection();
    const parsed = studentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !parsed.data.id) return Response.json({error: "A valid student record with an id is required."}, {status: 400});
    const studentId = parsed.data.id;
    try {
        if (!await validPlacement(parsed.data)) {
            return Response.json({error: "Choose an academic year, term, class, stream, and section from the current school settings."}, {status: 400});
        }
        const fields = `admission_number=?, full_name=?, date_of_birth=?, gender=?, student_phone=?,
            status=?, updated_at=CURRENT_TIMESTAMP`;
        const row = await withPostgresTransaction(async (database) => {
            await database.prepare(
                `UPDATE students SET ${fields} WHERE id=?`,
            ).run(...valuesForStudent(parsed.data), studentId);
            await syncStudentRelations(database, studentId, parsed.data);
            const updated = await database.prepare("SELECT * FROM student_records WHERE id = ?").get(studentId) as StudentRow | undefined;
            if (!updated) return null;
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', 'student.updated', 'student', ?, ?)`,
            ).run(randomUUID(), studentId, JSON.stringify({admissionNumber: parsed.data.admissionNumber}));
            return updated;
        });
        if (!row) return Response.json({error: "Student record was not found."}, {status: 404});
        return Response.json(toStudent(row));
    } catch (error) {
        console.error("Unable to update student:", error);
        const mapped = dbError(error);
        return Response.json({error: mapped.message}, {status: mapped.status});
    }
}

export async function PATCH(request: Request) {
    await connection();
    const payload = await request.json().catch(() => null) as {action?: string; id?: string; recorded?: boolean} | null;
    if (!payload?.id || !/^[0-9a-f-]{36}$/i.test(payload.id)) return Response.json({error: "A valid student id is required."}, {status: 400});
    const studentId = payload.id;
    const action = payload.action;
    const recorded = payload.recorded;

    let sql: string;
    let values: (string | null)[];
    if (action === "archive" || action === "restore") {
        sql = "UPDATE students SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?";
        values = [action === "archive" ? "Archived" : "Active", studentId];
    } else if (action === "biometrics" && typeof recorded === "boolean") {
        sql = "UPDATE students SET updated_at=CURRENT_TIMESTAMP WHERE id=?";
        values = [studentId];
    } else return Response.json({error: "Choose a valid student update."}, {status: 400});

    try {
        const row = await withPostgresTransaction(async (database) => {
            const result = await database.prepare(sql).run(...values);
            if (result.changes === 0) return null;
            if (action === "biometrics" && typeof recorded === "boolean") {
                await database.prepare(
                    `INSERT INTO student_biometrics (student_id, status, captured_at)
                     VALUES (?, ?, ?)
                     ON CONFLICT (student_id) DO UPDATE SET status=EXCLUDED.status,
                        captured_at=EXCLUDED.captured_at, updated_at=CURRENT_TIMESTAMP`,
                ).run(studentId, recorded ? "Complete" : "Pending",
                    recorded ? new Date().toISOString() : null);
            }
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', ?, 'student', ?, ?)`,
            ).run(randomUUID(), `student.${action === "biometrics" ? "biometrics.updated" : String(action)}`,
                studentId, JSON.stringify({action, recorded: recorded ?? null}));
            return await database.prepare("SELECT * FROM student_records WHERE id=?").get(studentId) as StudentRow | undefined ?? null;
        });
        if (!row) return Response.json({error: "Student record was not found."}, {status: 404});
        return Response.json(toStudent(row));
    } catch (error) {
        console.error("Unable to update student:", error);
        return Response.json({error: "Student record could not be updated in PostgreSQL."}, {status: 503});
    }
}

export async function DELETE(request: Request) {
    await connection();
    const payload = await request.json().catch(() => null) as {id?: string} | null;
    if (!payload?.id || !/^[0-9a-f-]{36}$/i.test(payload.id)) return Response.json({error: "A valid student id is required."}, {status: 400});
    const studentId = payload.id;
    try {
        const deleted = await withPostgresTransaction(async (database) => {
            const guardianIds = await database.prepare(
                "SELECT guardian_id FROM student_guardians WHERE student_id = ?",
            ).all(studentId) as {guardian_id: string}[];
            const result = await database.prepare("DELETE FROM students WHERE id=?").run(studentId);
            if (Number(result.changes) > 0) {
                const removeUnlinkedGuardian = database.prepare(
                    `DELETE FROM guardians
                     WHERE id = ? AND NOT EXISTS (
                        SELECT 1 FROM student_guardians WHERE guardian_id = ?
                     )`,
                );
                for (const {guardian_id: guardianId} of guardianIds) {
                    await removeUnlinkedGuardian.run(guardianId, guardianId);
                }
                await database.prepare(
                    `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id)
                     VALUES (?, 'admin', 'student.deleted', 'student', ?)`,
                ).run(randomUUID(), studentId);
            }
            return Number(result.changes);
        });
        if (!deleted) return Response.json({error: "Student record was not found."}, {status: 404});
        return new Response(null, {status: 204});
    } catch (error) {
        console.error("Unable to delete student:", error);
        const mapped = dbError(error);
        return Response.json({error: mapped.message}, {status: mapped.status});
    }
}
