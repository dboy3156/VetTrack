import { request } from "@/lib/api";
import type { MessagesResponse, PostMessageInput, ShiftMessage } from "./types";

export const shiftChatApi = {
  getMessages: (after?: string): Promise<MessagesResponse> => {
    const qs = after ? `?after=${encodeURIComponent(after)}` : "";
    return request<MessagesResponse>(`/api/shift-chat/messages${qs}`);
  },

  postMessage: (input: PostMessageInput): Promise<{ message: ShiftMessage }> =>
    request<{ message: ShiftMessage }>("/api/shift-chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  ackMessage: (messageId: string, status: "acknowledged" | "snoozed"): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/api/shift-chat/messages/${messageId}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),

  pinMessage: (messageId: string): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/api/shift-chat/messages/${messageId}/pin`, {
      method: "POST",
    }),

  react: (messageId: string, emoji: "👍" | "✅" | "👀"): Promise<{ action: string }> =>
    request<{ action: string }>("/api/shift-chat/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    }),

  typing: (): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>("/api/shift-chat/typing", { method: "POST" }),
};
