import {Suspense} from "react";
import {StudentRecordPage} from "../../../../components/students/student-record-page";

type StudentRouteProps = {
    params: Promise<{id: string}>;
};

async function StudentRecordContent({params}: StudentRouteProps) {
    const {id} = await params;
    return <StudentRecordPage studentId={id}/>;
}

export default function StudentRoute({params}: StudentRouteProps) {
    return (
        <Suspense fallback={<div className="page-content"><p>Loading student record...</p></div>}>
            <StudentRecordContent params={params}/>
        </Suspense>
    );
}
