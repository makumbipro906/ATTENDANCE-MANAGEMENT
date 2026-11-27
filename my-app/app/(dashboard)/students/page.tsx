import {Suspense} from "react";

import {StudentDirectory as StudentDirectoryView} from "../../../components/students/student-directory";

type StudentsPageProps = {
    searchParams: Promise<{ q?: string | string[] }>;
};

function StudentsPageContent({initialSearch = ""}: { initialSearch?: string }) {
    return <StudentDirectoryView initialSearch={initialSearch}/>;
}

async function SearchableStudentDirectory({searchParams}: StudentsPageProps) {
    const {q} = await searchParams;
    const initialSearch = typeof q === "string" ? q : q?.[0] ?? "";

    return <StudentsPageContent initialSearch={initialSearch}/>;
}

export default function StudentsPage({searchParams}: StudentsPageProps) {
    return (
        <Suspense fallback={<StudentsPageContent/>}>
            <SearchableStudentDirectory searchParams={searchParams}/>
        </Suspense>
    );
}
