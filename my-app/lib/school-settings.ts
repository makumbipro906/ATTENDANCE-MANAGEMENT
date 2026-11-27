export type AcademicYear = {
    id: string;
    year: number;
    isCurrent: boolean;
};

export type AcademicTerm = {
    id: string;
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
};

export type SchoolLevel = "O-Level" | "A-Level";

export type SchoolClass = {
    id: string;
    name: string;
    level: SchoolLevel;
};

export type SchoolStream = {
    id: string;
    name: string;
    classId: string;
};

export type SchoolSettings = {
    years: AcademicYear[];
    terms: AcademicTerm[];
    classes: SchoolClass[];
    streams: SchoolStream[];
    sections: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isYear(value: unknown): value is AcademicYear {
    return isObject(value) && typeof value.id === "string" &&
        typeof value.year === "number" && Number.isInteger(value.year) &&
        typeof value.isCurrent === "boolean";
}

function isTerm(value: unknown): value is AcademicTerm {
    return isObject(value) && typeof value.id === "string" &&
        typeof value.name === "string" && typeof value.year === "number" &&
        Number.isInteger(value.year) && typeof value.startDate === "string" &&
        typeof value.endDate === "string" && typeof value.isCurrent === "boolean";
}

function isClass(value: unknown): value is SchoolClass {
    return isObject(value) && typeof value.id === "string" &&
        typeof value.name === "string" &&
        (value.level === "O-Level" || value.level === "A-Level");
}

function isStream(value: unknown): value is SchoolStream {
    return isObject(value) && typeof value.id === "string" &&
        typeof value.name === "string" && typeof value.classId === "string";
}

export function isSchoolSettings(value: unknown): value is SchoolSettings {
    if (!isObject(value) || !Array.isArray(value.years) || !value.years.every(isYear) ||
        !Array.isArray(value.terms) || !value.terms.every(isTerm) ||
        !Array.isArray(value.classes) || !value.classes.every(isClass) ||
        !Array.isArray(value.streams) || !value.streams.every(isStream) ||
        !Array.isArray(value.sections) || !value.sections.every((item) => typeof item === "string")) {
        return false;
    }

    const years = value.years as AcademicYear[];
    const terms = value.terms as AcademicTerm[];
    const classes = value.classes as SchoolClass[];
    const streams = value.streams as SchoolStream[];
    return new Set(years.map((item) => item.id)).size === years.length &&
        new Set(years.map((item) => item.year)).size === years.length &&
        years.filter((item) => item.isCurrent).length <= 1 &&
        terms.every((term) => years.some((year) => year.year === term.year) &&
            term.name.trim().length > 0 && term.startDate <= term.endDate &&
            term.startDate.slice(0, 4) === String(term.year) &&
            term.endDate.slice(0, 4) === String(term.year)) &&
        new Set(terms.map((item) => item.id)).size === terms.length &&
        new Set(classes.map((item) => item.id)).size === classes.length &&
        streams.every((stream) => classes.some((schoolClass) => schoolClass.id === stream.classId)) &&
        new Set(streams.map((item) => item.id)).size === streams.length &&
        new Set((value.sections as string[]).map((item) => item.toLocaleLowerCase())).size === value.sections.length;
}
