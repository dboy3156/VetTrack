import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shiftChatApi } from "../api";
import type { ShiftMessage, PostMessageInput } from "../types";
import { useAuth } from "@/hooks/use-auth";

const QUERY_KEY = ["/api/shift-chat/messages"] as const;
const POLL_INTERVAL_MS = 3_000;
const TYPING_DEBOUNCE_MS = 1_500;

export function useShiftChat(isOpen: boolean) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const afterRef    = useRef<string | undefined>(undefined);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Poll for new messages ──────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => shiftChatApi.getMessages(afterRef.current),
    enabled: !!userId && isOpen,
    refetchInterval: isOpen ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Track the latest message timestamp for incremental polling
  useEffect(() => {
    if (data?.messages?.length) {
      afterRef.current = data.messages[data.messages.length - 1]!.createdAt;
    }
  }, [data?.messages]);

  // ── Local message accumulation ─────────────────────────────────────────────
  const [allMessages, setAllMessages] = useState<ShiftMessage[]>([]);

  useEffect(() => {
    if (!data?.messages?.length) return;
    setAllMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newOnes = data.messages.filter((m) => !existingIds.has(m.id));
      return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
    });
  }, [data?.messages]);

  // Reset messages when panel closes (so next open loads fresh)
  useEffect(() => {
    if (!isOpen) {
      setAllMessages([]);
      afterRef.current = undefined;
    }
  }, [isOpen]);

  // ── Unread count ───────────────────────────────────────────────────────────
  const lastOpenRef  = useRef<number>(0);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      lastOpenRef.current = Date.now();
      setUnreadCount(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && data?.messages?.length) {
      const newCount = data.messages.filter(
        (m) => new Date(m.createdAt).getTime() > lastOpenRef.current,
      ).length;
      if (newCount > 0) setUnreadCount((n) => n + newCount);
    }
  }, [data?.messages, isOpen]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (input: PostMessageInput) => shiftChatApi.postMessage(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // ── Ack broadcast ──────────────────────────────────────────────────────────
  const ackMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "acknowledged" | "snoozed" }) =>
      shiftChatApi.ackMessage(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // ── Typing indicator (debounced) ───────────────────────────────────────────
  const notifyTyping = useCallback(() => {
    if (typingTimer.current) return; // Already sent recently
    shiftChatApi.typing().catch(() => {});
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
    }, TYPING_DEBOUNCE_MS);
  }, []);

  // ── React ──────────────────────────────────────────────────────────────────
  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: "👍" | "✅" | "👀" }) =>
      shiftChatApi.react(messageId, emoji),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // ── Pin ────────────────────────────────────────────────────────────────────
  const pinMutation = useMutation({
    mutationFn: (messageId: string) => shiftChatApi.pinMessage(messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return {
    messages:      allMessages,
    pinnedMessage: data?.pinnedMessage ?? null,
    typing:        data?.typing ?? [],
    onlineUserIds: data?.onlineUserIds ?? [],
    isLoading,
    unreadCount,
    sendMessage:   sendMutation.mutate,
    isSending:     sendMutation.isPending,
    ackMessage:    ackMutation.mutate,
    reactToMessage: reactMutation.mutate,
    pinMessage:    pinMutation.mutate,
    notifyTyping,
    currentUserId: userId,
  };
}
