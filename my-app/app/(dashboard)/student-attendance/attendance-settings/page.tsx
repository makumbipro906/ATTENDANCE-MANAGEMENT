import {Suspense} from "react";

import {StudentAttendanceSettingsPage} from "@/components/student-attendance/student-attendance-pages";

export default function StudentAttendanceSettingsRoute() {
    return <Suspense fallback={<main className="page-content student-attendance-page"><p>Loading attendance settings…</p></main>}>
        <StudentAttendanceSettingsPage/>
    </Suspense>;
}
