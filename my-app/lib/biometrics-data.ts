import type {StudentRecord} from "./student-types";

export type BiometricsClass = {
    name: string;
    total: number;
    captured: number;
    streams: BiometricsStream[];
};

export type BiometricsStream = {
    name: string;
    total: number;
    captured: number;
    className: string;
};

type ClassDefinition = {name: string};
type StreamDefinition = {name: string; className: string};

export function getBiometricsClasses(
    students: readonly StudentRecord[],
    classDefinitions: readonly ClassDefinition[] = [],
    streamDefinitions: readonly StreamDefinition[] = [],
): BiometricsClass[] {
    const classGroups = new Map<string, Map<string, StudentRecord[]>>();

    for (const schoolClass of classDefinitions) {
        classGroups.set(schoolClass.name, new Map());
    }

    for (const stream of streamDefinitions) {
        const streamGroups = classGroups.get(stream.className) ?? new Map<string, StudentRecord[]>();
        if (!classGroups.has(stream.className)) {
            classGroups.set(stream.className, streamGroups);
        }
        streamGroups.set(stream.name, []);
    }

    for (const student of students) {
        if (student.status !== "Active") {
            continue;
        }

        const className = student.className.trim() || "Unassigned";
        const streamName = student.stream.trim() || "Unassigned";
        let streamGroups = classGroups.get(className);
        if (!streamGroups) {
            streamGroups = new Map<string, StudentRecord[]>();
            classGroups.set(className, streamGroups);
        }

        const streamStudents = streamGroups.get(streamName) ?? [];
        streamStudents.push(student);
        streamGroups.set(streamName, streamStudents);
    }

    return [...classGroups.entries()]
        .sort(([left], [right]) => left.localeCompare(right, undefined, {numeric: true, sensitivity: "base"}))
        .map(([className, streamGroups]) => {
            const streams = [...streamGroups.entries()]
                .sort(([left], [right]) => left.localeCompare(right, undefined, {numeric: true, sensitivity: "base"}))
                .map(([streamName, streamStudents]) => ({
                    name: streamName,
                    total: streamStudents.length,
                    captured: streamStudents.filter((student) => student.biometricsStatus === "Complete").length,
                    className,
                }));

            return {
                name: className,
                total: streams.reduce((sum, stream) => sum + stream.total, 0),
                captured: streams.reduce((sum, stream) => sum + stream.captured, 0),
                streams,
            };
        });
}

export const formatBiometricsNumber = (value: number) => value.toLocaleString("en-US");