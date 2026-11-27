import "server-only";

import {getDatabase} from "@/lib/server/database";
import {isSchoolSettings, type SchoolSettings} from "@/lib/school-settings";

export async function getSchoolSettings(): Promise<SchoolSettings> {
    const database = getDatabase();
    const years = await database.prepare("SELECT id, year, is_current FROM school_years ORDER BY year").all() as {
        id: string; year: number; is_current: number;
    }[];
    const terms = await database.prepare(
        `SELECT t.id, t.name, y.year, t.start_date, t.end_date, t.is_current
         FROM terms t JOIN school_years y ON y.id = t.school_year_id ORDER BY y.year, t.start_date`,
    ).all() as {id: string; name: string; year: number; start_date: string; end_date: string; is_current: number}[];
    const classes = await database.prepare("SELECT id, name, level FROM classes ORDER BY name").all() as
        {id: string; name: string; level: "O-Level" | "A-Level"}[];
    const streams = await database.prepare("SELECT id, class_id, name FROM streams ORDER BY name").all() as
        {id: string; class_id: string; name: string}[];
    const sections = await database.prepare("SELECT name FROM sections ORDER BY name").all() as {name: string}[];
    const settings: SchoolSettings = {
        years: years.map((year) => ({id: year.id, year: year.year, isCurrent: Boolean(year.is_current)})),
        terms: terms.map((term) => ({
            id: term.id,
            name: term.name,
            year: term.year,
            startDate: term.start_date,
            endDate: term.end_date,
            isCurrent: Boolean(term.is_current),
        })),
        classes,
        streams: streams.map((stream) => ({id: stream.id, name: stream.name, classId: stream.class_id})),
        sections: sections.map((section) => section.name),
    };
    if (!isSchoolSettings(settings)) throw new Error("Stored school settings are invalid or inconsistent.");
    return settings;
}

export function getSettingCombinations(settings: SchoolSettings) {
    return settings.years.flatMap((year) =>
        settings.terms
            .filter((term) => term.year === year.year)
            .flatMap((term) =>
                settings.classes.flatMap((schoolClass) =>
                    settings.streams
                        .filter((stream) => stream.classId === schoolClass.id)
                        .map((stream) => ({
                            academicYear: String(year.year),
                            term: term.name,
                            className: schoolClass.name,
                            stream: stream.name,
                        })),
                ),
            ),
    );
}
