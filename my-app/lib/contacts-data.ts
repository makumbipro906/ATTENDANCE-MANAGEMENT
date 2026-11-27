import type {StudentRecord} from "./student-types";

export type ContactStatus = "Complete" | "Missing";

export type ContactsStream = {
    name: string;
    className: string;
    total: number;
    complete: number;
};

export type ContactsClass = {
    name: string;
    total: number;
    complete: number;
    streams: ContactsStream[];
};

export type ClassDefinition = {name: string};
export type StreamDefinition = {name: string; className: string};

export function getMissingContactFields(student: StudentRecord): string[] {
    const missing: string[] = [];
    if (!student.guardianName.trim()) missing.push("Guardian name");
    if (!student.relationship.trim()) missing.push("Relationship");
    if (!student.primaryPhone.trim()) missing.push("Primary phone");
    return missing;
}

export function getContactStatus(student: StudentRecord): ContactStatus {
    return getMissingContactFields(student).length === 0 ? "Complete" : "Missing";
}

export function getContactsClasses(
    students: readonly StudentRecord[],
    classDefinitions: readonly ClassDefinition[] = [],
    streamDefinitions: readonly StreamDefinition[] = [],
): ContactsClass[] {
    const groupedStudents = new Map<string, Map<string, StudentRecord[]>>();

    for (const schoolClass of classDefinitions) {
        groupedStudents.set(schoolClass.name, new Map());
    }

    for (const stream of streamDefinitions) {
        const classStreams = groupedStudents.get(stream.className) ?? new Map<string, StudentRecord[]>();
        groupedStudents.set(stream.className, classStreams);
        classStreams.set(stream.name, []);
    }

    for (const student of students) {
        if (student.status !== "Active") continue;

        const className = student.className.trim() || "Unassigned";
        const streamName = student.stream.trim() || "Unassigned";
        const classStreams = groupedStudents.get(className) ?? new Map<string, StudentRecord[]>();
        groupedStudents.set(className, classStreams);
        const streamStudents = classStreams.get(streamName) ?? [];
        streamStudents.push(student);
        classStreams.set(streamName, streamStudents);
    }

    return [...groupedStudents.entries()]
        .sort(([left], [right]) => left.localeCompare(right, undefined, {numeric: true, sensitivity: "base"}))
        .map(([className, classStreams]) => {
            const streams = [...classStreams.entries()]
                .sort(([left], [right]) => left.localeCompare(right, undefined, {numeric: true, sensitivity: "base"}))
                .map(([streamName, streamStudents]) => ({
                    name: streamName,
                    className,
                    total: streamStudents.length,
                    complete: streamStudents.filter((student) => getContactStatus(student) === "Complete").length,
                }));

            return {
                name: className,
                total: streams.reduce((sum, stream) => sum + stream.total, 0),
                complete: streams.reduce((sum, stream) => sum + stream.complete, 0),
                streams,
            };
        });
}
