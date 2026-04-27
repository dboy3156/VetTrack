export type MessageType = "regular" | "broadcast" | "system";

export interface MessageReaction {
  userId: string;
  emoji: "👍" | "✅" | "👀";
}

export interface MessageAck {
  userId: string;
  status: "acknowledged" | "snoozed";
}

export interface ShiftMessage {
  id: string;
  shiftSessionId: string;
  clinicId: string;
  senderId: string | null;
  senderName: string | null;
  senderRole: string | null;
  body: string;
  type: MessageType;
  broadcastKey: string | null;
  systemEventType: string | null;
  systemEventPayload: Record<string, unknown> | null;
  roomTag: string | null;
  isUrgent: boolean;
  mentionedUserIds: string[];
  pinnedAt: string | null;
  pinnedByUserId: string | null;
  createdAt: string;
  acks: MessageAck[];
  reactions: MessageReaction[];
}

export interface MessagesResponse {
  messages: ShiftMessage[];
  pinnedMessage: ShiftMessage | null;
  typing: string[];
  onlineUserIds: string[];
}

export interface PostMessageInput {
  body: string;
  type: "regular" | "broadcast";
  broadcastKey?: string;
  roomTag?: string;
  isUrgent?: boolean;
  mentionedUserIds?: string[];
}

export const BROADCAST_TEMPLATES = {
  department_close: { label: "סגירת מחלקה", subtitle: "כל הטכנאים — לנקות ולסדר את המחלקה" },
} as const;

export type BroadcastKey = keyof typeof BROADCAST_TEMPLATES;
