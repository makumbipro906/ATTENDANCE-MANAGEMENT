import {connection} from "next/server";

import {withPostgresTransaction} from "@/lib/server/database";
import {getSchoolSettings} from "@/lib/server/school-settings";
import {isSchoolSettings, type SchoolSettings} from "@/lib/school-settings";

type SettingKey = keyof SchoolSettings;
const settingKeys: SettingKey[] = ["years", "terms", "classes", "streams", "sections"];

export async function GET() {
    await connection();
    try {
        return Response.json(await getSchoolSettings(), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load school settings:", error);
        return Response.json({error: "School settings could not be loaded from PostgreSQL."}, {status: 503});
    }
}

async function replaceRows(key: SettingKey, value: SchoolSettings[SettingKey]) {
    await withPostgresTransaction(async (database) => {
        if (key === "years") {
            const years = value as SchoolSettings["years"];
            const upsert = database.prepare(
                `INSERT INTO school_years (id, year, is_current) VALUES (?, ?, ?)
                 ON CONFLICT (id) DO UPDATE SET year=EXCLUDED.year, is_current=EXCLUDED.is_current`,
            );
            for (const year of years) await upsert.run(year.id, year.year, Number(year.isCurrent));
            const ids = years.map((year) => year.id);
            await database.prepare(ids.length
                ? `DELETE FROM school_years WHERE id NOT IN (${ids.map(() => "?").join(", ")})`
                : "DELETE FROM school_years").run(...ids);
            return;
        }
        if (key === "terms") {
            const terms = value as SchoolSettings["terms"];
            const upsert = database.prepare(
                `INSERT INTO terms (id, school_year_id, name, start_date, end_date, is_current)
                 VALUES (?, (SELECT id FROM school_years WHERE year = ?), ?, ?, ?, ?)
                 ON CONFLICT (id) DO UPDATE SET school_year_id=EXCLUDED.school_year_id,
                    name=EXCLUDED.name, start_date=EXCLUDED.start_date,
                    end_date=EXCLUDED.end_date, is_current=EXCLUDED.is_current`,
            );
            for (const term of terms) await upsert.run(term.id, term.year, term.name, term.startDate, term.endDate, Number(term.isCurrent));
            const ids = terms.map((term) => term.id);
            await database.prepare(ids.length
                ? `DELETE FROM terms WHERE id NOT IN (${ids.map(() => "?").join(", ")})`
                : "DELETE FROM terms").run(...ids);
            return;
        }
        if (key === "classes") {
            const classes = value as SchoolSettings["classes"];
            const upsert = database.prepare(
                `INSERT INTO classes (id, name, level) VALUES (?, ?, ?)
                 ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, level=EXCLUDED.level`,
            );
            for (const schoolClass of classes) await upsert.run(schoolClass.id, schoolClass.name, schoolClass.level);
            const ids = classes.map((schoolClass) => schoolClass.id);
            await database.prepare(ids.length
                ? `DELETE FROM classes WHERE id NOT IN (${ids.map(() => "?").join(", ")})`
                : "DELETE FROM classes").run(...ids);
            return;
        }
        if (key === "streams") {
            const streams = value as SchoolSettings["streams"];
            const upsert = database.prepare(
                `INSERT INTO streams (id, class_id, name) VALUES (?, ?, ?)
                 ON CONFLICT (id) DO UPDATE SET class_id=EXCLUDED.class_id, name=EXCLUDED.name`,
            );
            for (const stream of streams) await upsert.run(stream.id, stream.classId, stream.name);
            const ids = streams.map((stream) => stream.id);
            await database.prepare(ids.length
                ? `DELETE FROM streams WHERE id NOT IN (${ids.map(() => "?").join(", ")})`
                : "DELETE FROM streams").run(...ids);
            return;
        }
        const sections = value as SchoolSettings["sections"];
        const upsert = database.prepare(
            `INSERT INTO sections (id, name) VALUES (?, ?)
             ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name`,
        );
        for (const section of sections) {
            const id = `section-${section.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
            await upsert.run(id, section);
        }
        const ids = sections.map((section) => `section-${section.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`);
        await database.prepare(ids.length
            ? `DELETE FROM sections WHERE id NOT IN (${ids.map(() => "?").join(", ")})`
            : "DELETE FROM sections").run(...ids);
    });
}

export async function PUT(request: Request) {
    await connection();
    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return Response.json({error: "Provide a valid school settings payload."}, {status: 400});
    }
    if (typeof payload !== "object" || payload === null || !("key" in payload) ||
        !("value" in payload) || typeof payload.key !== "string" ||
        !settingKeys.includes(payload.key as SettingKey)) {
        return Response.json({error: "Choose a valid school settings category."}, {status: 400});
    }

    const key = payload.key as SettingKey;
    try {
        const candidate: SchoolSettings = {...await getSchoolSettings(), [key]: payload.value};
        if (!isSchoolSettings(candidate)) {
            return Response.json({error: "The updated settings are invalid or conflict with another setting."}, {status: 400});
        }
        await replaceRows(key, candidate[key]);
        return Response.json(await getSchoolSettings(), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error(`Unable to save school ${key}:`, error);
        const isConstraint = typeof error === "object" && error !== null &&
            "code" in error && ["23503", "23505", "23514"].includes(String(error.code));
        return Response.json({
            error: isConstraint
                ? "This school setting is referenced by existing records and cannot be removed or changed."
                : "School settings could not be saved to PostgreSQL.",
        }, {status: isConstraint ? 409 : 503});
    }
}
