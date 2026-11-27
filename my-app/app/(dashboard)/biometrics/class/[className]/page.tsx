import {Suspense} from "react";
import {BiometricsStreamBreakdown} from "@/components/biometrics-stream-breakdown";

type BiometricsClassRouteProps = {
    params: Promise<{className: string}>;
    searchParams: Promise<{stream?: string | string[]}>;
};

async function BiometricsStreamContent({params, searchParams}: BiometricsClassRouteProps) {
    const [{className}, {stream}] = await Promise.all([params, searchParams]);
    return (
        <BiometricsStreamBreakdown
            className={className}
            streamName={typeof stream === "string" ? stream : ""}
        />
    );
}

export default function BiometricsClassRoute(props: BiometricsClassRouteProps) {
    return (
        <Suspense fallback={<div className="page-content"><p>Loading biometrics breakdown...</p></div>}>
            <BiometricsStreamContent {...props}/>
        </Suspense>
    );
}