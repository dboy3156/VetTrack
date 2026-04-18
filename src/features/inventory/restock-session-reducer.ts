export interface RestockSessionState {
  activeSessionId: string | null;
  activeContainerId: string | null;
  isBusy: boolean;
  errorMessage: string | null;
  lastSummary: {
    totalAdded: number;
    totalRemoved: number;
    itemsMissingCount: number;
  } | null;
}

export type RestockSessionAction =
  | { type: "start-request" }
  | { type: "start-success"; payload: { sessionId: string; containerId: string } }
  | { type: "scan-request" }
  | { type: "scan-success" }
  | { type: "finish-request" }
  | {
      type: "finish-success";
      payload: { totalAdded: number; totalRemoved: number; itemsMissingCount: number };
    }
  | { type: "failure"; payload: { message: string } }
  | { type: "clear-error" };

export const initialRestockSessionState: RestockSessionState = {
  activeSessionId: null,
  activeContainerId: null,
  isBusy: false,
  errorMessage: null,
  lastSummary: null,
};

export function restockSessionReducer(
  state: RestockSessionState,
  action: RestockSessionAction,
): RestockSessionState {
  switch (action.type) {
    case "start-request":
    case "scan-request":
    case "finish-request":
      return { ...state, isBusy: true, errorMessage: null };
    case "start-success":
      return {
        ...state,
        isBusy: false,
        activeSessionId: action.payload.sessionId,
        activeContainerId: action.payload.containerId,
      };
    case "scan-success":
      return { ...state, isBusy: false };
    case "finish-success":
      return {
        ...state,
        isBusy: false,
        activeSessionId: null,
        activeContainerId: null,
        lastSummary: action.payload,
      };
    case "failure":
      return { ...state, isBusy: false, errorMessage: action.payload.message };
    case "clear-error":
      return { ...state, errorMessage: null };
    default:
      return state;
  }
}
