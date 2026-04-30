import { useState, useEffect } from "react";
import { getErMode } from "@/lib/api";
import type { ErModeState } from "../../shared/er-types";
export interface ErModeResult {
state: ErModeState;
isLoaded: boolean;
}
// Module-level cache (persists across route changes)
let cached: ErModeState | null = null;
export function useErMode(): ErModeResult {
const [state, setState] = useState<ErModeState>(cached ?? "disabled");
const [isLoaded, setIsLoaded] = useState(cached !== null);
useEffect(() => {
if (cached !== null) return;
let cancelled = false;
getErMode()
.then((res) => {
if (cancelled) return;
cached = res.state;
setState(res.state);
setIsLoaded(true);
})
.catch(() => {
if (cancelled) return;
// Fail-open (important for safety)
cached = "disabled";
setState("disabled");
setIsLoaded(true);
});
return () => {
cancelled = true;
};
}, []);
return { state, isLoaded };
}