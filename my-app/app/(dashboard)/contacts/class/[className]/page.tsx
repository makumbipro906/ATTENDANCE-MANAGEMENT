import {Suspense} from "react";
import {ContactsStreamBreakdown} from "@/components/contacts-stream-breakdown";

type ContactsClassRouteProps = {
    params: Promise<{className: string}>;
    searchParams: Promise<{stream?: string | string[]}>;
};

async function ContactsStreamContent({params, searchParams}: ContactsClassRouteProps) {
    const [{className}, {stream}] = await Promise.all([params, searchParams]);
    return (
        <ContactsStreamBreakdown
            className={className}
            streamName={typeof stream === "string" ? stream : ""}
        />
    );
}

export default function ContactsClassRoute(props: ContactsClassRouteProps) {
    return (
        <Suspense fallback={<div className="page-content"><p>Loading contacts breakdown...</p></div>}>
            <ContactsStreamContent {...props}/>
        </Suspense>
    );
}
