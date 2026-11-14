import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  ImagePlus,
  MessageCircle,
  Mic,
  PhoneOff,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Messages — ExpertsTeam" },
      {
        name: "description",
        content: "Private, real-time conversations with the ExpertsTeam community.",
      },
    ],
  }),
  component: MessagesPage,
});

type Person = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};
type Member = {
  user_id: string;
  last_read_at: string;
  profiles: Person | null;
};
type Conversation = {
  id: string;
  pair_key: string;
  last_message_at: string;
  direct_conversation_members: Member[];
};
type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_path: string | null;
  media_url: string | null;
  created_at: string;
};
type DirectMessagePreview = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_path: string | null;
  created_at: string;
};

function personName(person?: Person | null) {
  return person?.display_name || person?.username || "Community member";
}
function initials(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "E";
}
function shortTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MessagesPage() {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;
  const requestedRecipient = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("to")
    : null;
  const requestedRecipientRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("conversation"));
  const [search, setSearch] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState("");
  const [recording, setRecording] = useState(false);
  const [callState, setCallState] = useState<"idle" | "incoming" | "calling" | "connected">("idle");
  const [incomingCall, setIncomingCall] = useState<{
    from_user_id: string;
    payload: RTCSessionDescriptionInit;
  } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const callCursorRef = useRef<Record<string, string>>({});
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [typing, setTyping] = useState(false);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(() => typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("conversation")));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimeoutRef = useRef<number | null>(null);
  const turnWarningShownRef = useRef(false);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["direct-conversations", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_conversations")
        .select(
          "id,pair_key,last_message_at,direct_conversation_members(user_id,last_read_at,profiles:profiles!direct_conversation_members_user_id_fkey(id,username,display_name,avatar_url))",
        )
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("direct_conversation_hidden")
        .select("conversation_id")
        .eq("user_id", user!.id);
      if (hiddenError) throw hiddenError;
      const hiddenIds = new Set((hiddenRows ?? []).map((row) => row.conversation_id));
      return ((data ?? []) as Conversation[]).filter(
        (conversation) => !hiddenIds.has(conversation.id),
      );
    },
  });

  const { data: recentlyDeleted = [] } = useQuery({
    queryKey: ["direct-hidden-conversations", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("direct_conversation_hidden")
        .select("conversation_id")
        .eq("user_id", user!.id);
      if (hiddenError) throw hiddenError;
      const ids = (hiddenRows ?? []).map((row) => row.conversation_id);
      if (!ids.length) return [] as Conversation[];
      const { data, error } = await supabase
        .from("direct_conversations")
        .select("id,pair_key,last_message_at,direct_conversation_members(user_id,last_read_at,profiles:profiles!direct_conversation_members_user_id_fkey(id,username,display_name,avatar_url))")
        .in("id", ids)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Conversation[];
    },
  });

  const activeConversation =
    conversations.find((item) => item.id === activeId) ?? conversations[0] ?? null;
  const otherMember = activeConversation?.direct_conversation_members.find(
    (item) => item.user_id !== user?.id,
  );
  const recipient = otherMember?.profiles ?? null;
  const activeConversationId = activeConversation?.id ?? null;

  async function sendCallSignal(
    signal_type: "offer" | "answer" | "ice" | "hangup" | "reject",
    payload: object = {},
  ) {
    if (!user || !activeConversation || !recipient) throw new Error("Choose a conversation first.");
    const { error } = await supabase.from("direct_call_signals").insert({
      conversation_id: activeConversation.id,
      from_user_id: user.id,
      to_user_id: recipient.id,
      signal_type,
      payload: JSON.parse(JSON.stringify(payload) ?? "{}"),
    });
    if (error) throw error;
  }

  async function flushPendingIce(pc: RTCPeerConnection) {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  async function createPeerConnection() {
    let iceServers: RTCIceServer[] = [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
    try {
      const { data, error } = await supabase.functions.invoke("turn-credentials");
      if (!error && Array.isArray(data?.iceServers) && data.iceServers.length) {
        iceServers = data.iceServers as RTCIceServer[];
        if (data.turnEnabled !== true && !turnWarningShownRef.current) {
          turnWarningShownRef.current = true;
          toast.info("Direct video calling is enabled. A TURN relay is still needed for some restrictive networks.");
        }
      } else if (!turnWarningShownRef.current) {
        turnWarningShownRef.current = true;
        toast.info("Video calls are using direct connectivity. Some restrictive networks may need a TURN relay.");
      }
    } catch {
      if (!turnWarningShownRef.current) {
        turnWarningShownRef.current = true;
        toast.info("Video calls are using direct connectivity because relay credentials are unavailable.");
      }
    }
    const pc = new RTCPeerConnection({ iceServers });
    peerConnectionRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendCallSignal("ice", { candidate: event.candidate.toJSON() }).catch((error: Error) =>
          toast.error(error.message),
        );
      }
    };
    pc.ontrack = (event) => setRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("connected");
      if (pc.connectionState === "failed") {
        toast.error("The call could not connect. Your network may require a TURN relay.");
        if (peerConnectionRef.current === pc) void endCall(false);
      }
      if (pc.connectionState === "closed" && peerConnectionRef.current === pc) void endCall(false);
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setCallState("connected");
      } else if (pc.iceConnectionState === "failed" && peerConnectionRef.current === pc) {
        toast.error("The call could not establish a network path. Try another network; restrictive networks need a TURN relay.");
        void endCall(false);
      }
    };
    return pc;
  }

  async function startVideoCall() {
    if (!user || !activeConversation || !recipient || callState !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      toast.error("Video calling is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = await createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendCallSignal("offer", pc.localDescription?.toJSON() ?? offer);
      setCallState("calling");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the video call.");
      await endCall(false);
    }
  }

  async function acceptVideoCall() {
    if (!incomingCall || !user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } });
      setLocalStream(stream);
      const pc = await createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.payload));
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendCallSignal("answer", pc.localDescription?.toJSON() ?? answer);
      setIncomingCall(null);
      setCallState("calling");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept the video call.");
      await endCall(false);
    }
  }

  async function endCall(notify = true) {
    if (notify && user && activeConversation && recipient && callState !== "idle") {
      await sendCallSignal("hangup").catch(() => undefined);
    }
    const pc = peerConnectionRef.current;
    peerConnectionRef.current = null;
    pc?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setCallState("idle");
    setMuted(false);
    setCameraOff(false);
    pendingIceRef.current = [];
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported by this browser.");
      return;
    }
    if (attachment) {
      toast.error("Send or remove the current attachment before recording a voice note.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? { mimeType: "audio/webm;codecs=opus" }
        : undefined;
      const recorder = new MediaRecorder(stream, options);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 8 * 1024 * 1024) {
          toast.error("Voice notes must be 8 MB or smaller. Record a shorter message.");
          stream.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
          recorderRef.current = null;
          setRecording(false);
          return;
        }
        const extension = blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("mp4")
            ? "m4a"
            : "webm";
        const file = new File([blob], "voice-message-" + Date.now() + "." + extension, {
          type: blob.type || "audio/webm",
        });
        if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
        setAttachment(file);
        setAttachmentPreview(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Allow microphone access to record a voice note.",
      );
    }
  }

  function stopVoiceRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [localStream, remoteStream]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnectionRef.current?.getSenders().forEach((sender) => sender.track?.stop());
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (callTimeoutRef.current !== null) {
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (callState !== "calling") return;
    callTimeoutRef.current = window.setTimeout(() => {
      toast.error("The call did not connect within 45 seconds. The call has been ended for both people. If both accepted, the network may require a TURN relay.");
      // Notify the other participant too; otherwise their incoming/calling UI can
      // remain open after this side times out.
      void endCall(true);
    }, 45_000);
    return () => {
      if (callTimeoutRef.current !== null) {
        window.clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
    };
  }, [callState, activeConversationId]);

  useEffect(() => {
    if (!userId || !activeConversationId) return;
    let cancelled = false;
    let cursor =
      callCursorRef.current[activeConversationId] ?? new Date(Date.now() - 120_000).toISOString();
    const pollSignals = async () => {
      const { data, error } = await supabase
        .from("direct_call_signals")
        .select("id,conversation_id,from_user_id,to_user_id,signal_type,payload,created_at")
        .eq("conversation_id", activeConversationId)
        .eq("to_user_id", userId)
        .gt("created_at", cursor)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error || cancelled) return;
      for (const signal of data ?? []) {
        cursor = signal.created_at;
        callCursorRef.current[activeConversationId] = cursor;
        if (signal.from_user_id !== userId) {
          const payload = signal.payload as unknown as Record<string, unknown>;
          try {
            if (signal.signal_type === "offer" && callState === "idle") {
              setIncomingCall({
                from_user_id: signal.from_user_id,
                payload: payload as unknown as RTCSessionDescriptionInit,
              });
              setCallState("incoming");
            } else if (signal.signal_type === "answer" && peerConnectionRef.current) {
              await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(payload as unknown as RTCSessionDescriptionInit),
              );
              await flushPendingIce(peerConnectionRef.current);
              // Wait for the ICE/peer connection to actually connect before showing
              // the call as connected; receiving SDP alone is not a live media path.
            } else if (signal.signal_type === "ice") {
              const candidate = payload.candidate as RTCIceCandidateInit | undefined;
              if (candidate) {
                if (peerConnectionRef.current?.remoteDescription) {
                  await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                  pendingIceRef.current.push(candidate);
                }
              }
            } else if (signal.signal_type === "hangup" || signal.signal_type === "reject") {
              await endCall(false);
              if (signal.signal_type === "reject") toast("The call was declined.");
            }
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "A call signal could not be processed.",
            );
          }
        }
        await supabase.from("direct_call_signals").delete().eq("id", signal.id);
      }
    };
    const timer = window.setInterval(() => void pollSignals(), 1200);
    void pollSignals();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeConversationId, userId, callState]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["direct-messages", activeConversation?.id],
    enabled: Boolean(activeConversation?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,conversation_id,sender_id,body,media_path,created_at")
        .eq("conversation_id", activeConversation!.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const newestFirst = (data ?? []) as Omit<DirectMessage, "media_url">[];
      const withSignedMedia = await Promise.all(
        newestFirst.map(async (message) => {
          if (!message.media_path) return { ...message, media_url: null };
          const { data: signed, error: signedError } = await supabase.storage
            .from("direct-messages")
            .createSignedUrl(message.media_path, 60 * 60);
          return { ...message, media_url: signedError ? null : (signed?.signedUrl ?? null) };
        }),
      );
      return withSignedMedia.reverse() as DirectMessage[];
    },
  });

  const { data: people = [], isFetching: peopleLoading } = useQuery({
    queryKey: ["message-people", search],
    enabled: Boolean(user && peopleOpen && search.trim().length >= 2),
    queryFn: async () => {
      const term = search
        .trim()
        .replace(/[%,()]/g, " ")
        .slice(0, 50);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .neq("id", user!.id)
        .or("username.ilike.%" + term + "%,display_name.ilike.%" + term + "%")
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const inboxChannel = supabase
      .channel("direct-inbox-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { conversation_id?: string } | undefined;
          void queryClient.invalidateQueries({ queryKey: ["direct-conversations", userId] });
          void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", userId] });
          if (row?.conversation_id) {
            void queryClient.invalidateQueries({
              queryKey: ["direct-messages", row.conversation_id],
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(inboxChannel);
    };
  }, [userId, queryClient]);

  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: previews = [] } = useQuery({
    queryKey: ["direct-message-previews", user?.id, conversationIds.join(",")],
    enabled: conversationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,conversation_id,sender_id,body,media_path,created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(500, conversationIds.length * 20));
      if (error) throw error;
      return (data ?? []) as DirectMessagePreview[];
    },
  });
  const previewByConversation = useMemo(() => {
    const map = new Map<string, DirectMessagePreview>();
    for (const message of previews)
      if (!map.has(message.conversation_id)) map.set(message.conversation_id, message);
    return map;
  }, [previews]);

  useEffect(() => {
    if (!userId) return;
    const presenceChannel = supabase.channel("expertsteam-live-presence", {
      config: { presence: { key: userId } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState() as Record<string, { user_id?: string }[]>;
        setOnlineIds(
          Object.values(state)
            .flat()
            .map((entry) => entry.user_id ?? "")
            .filter((id) => id && id !== userId),
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });
    return () => {
      setOnlineIds([]);
      void supabase.removeChannel(presenceChannel);
    };
  }, [userId]);

  useEffect(() => {
    if (!activeConversation?.id || !userId) return;
    const channel = supabase.channel("direct-chat-" + activeConversation.id, {
      config: { broadcast: { self: false } },
    });
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages",
          filter: "conversation_id=eq." + activeConversation.id,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["direct-messages", activeConversation.id],
          });
          void queryClient.invalidateQueries({ queryKey: ["direct-conversations", userId] });
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.user_id !== userId) setTyping(Boolean(payload?.typing));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      setTyping(false);
      void supabase.removeChannel(channel);
    };
  }, [activeConversation?.id, userId, queryClient]);

  useEffect(() => {
    if (!activeConversationId || !userId) return;
    void supabase
      .from("direct_conversation_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", activeConversationId)
      .eq("user_id", userId);
  }, [activeConversationId, userId, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  useEffect(() => {
    return () => {
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [attachmentPreview]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user || !activeConversation) throw new Error("Choose a conversation first.");
      let media_path: string | null = null;
      if (attachment) {
        const path =
          activeConversation.id +
          "/" +
          user.id +
          "/" +
          crypto.randomUUID() +
          "-" +
          attachment.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-70);
        const { error: uploadError } = await supabase.storage
          .from("direct-messages")
          .upload(path, attachment, {
            cacheControl: "3600",
            upsert: false,
            contentType: attachment.type.split(";")[0] || "application/octet-stream",
          });
        if (uploadError) throw uploadError;
        media_path = path;
      }
      const body = draft.trim();
      if (!body && !media_path)
        throw new Error("Write a message, share a photo or record a voice note.");
      const { error } = await supabase.from("direct_messages").insert({
        conversation_id: activeConversation.id,
        sender_id: user.id,
        body,
        media_path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setAttachment(null);
      setAttachmentPreview("");
      void queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversation?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-conversations", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", user?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unsendMessage = useMutation({
    mutationFn: async (message: DirectMessage) => {
      if (!user || message.sender_id !== user.id)
        throw new Error("You can only unsend your own messages.");
      const { error } = await supabase
        .from("direct_messages")
        .delete()
        .eq("id", message.id)
        .eq("sender_id", user.id);
      if (error) throw error;
      if (message.media_path) {
        await supabase.storage.from("direct-messages").remove([message.media_path]);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["direct-messages", activeConversation?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-conversations", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", user?.id] });
      toast.success("Message unsent");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error("Sign in to delete a conversation.");
      const { error } = await supabase.from("direct_conversation_hidden").insert({
        conversation_id: conversationId,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveId(null);
      setMobileChatOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["direct-conversations", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["direct-message-previews", user?.id] });
      toast.success("Chat removed from your inbox");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restoreConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error("Sign in to restore a conversation.");
      const { error } = await supabase
        .from("direct_conversation_hidden")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: async (_data, conversationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["direct-hidden-conversations", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["direct-conversations", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["direct-message-previews", user?.id] }),
      ]);
      setActiveId(conversationId);
      setMobileChatOpen(true);
      toast.success("Conversation restored and reopened");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startConversation = useCallback(async (person: Person) => {
    if (!user) return;
    const pairKey = [user.id, person.id].sort().join(":");
    try {
      const { data: existingConversation, error } = await supabase
        .from("direct_conversations")
        .select("id")
        .eq("pair_key", pairKey)
        .maybeSingle();
      if (error) throw error;
      let conversation = existingConversation;
      if (!conversation) {
        const created = await supabase
          .from("direct_conversations")
          .insert({ pair_key: pairKey, created_by: user.id })
          .select("id")
          .single();
        if (created.error) {
          if (created.error.code !== "23505") throw created.error;
          const retry = await supabase
            .from("direct_conversations")
            .select("id")
            .eq("pair_key", pairKey)
            .single();
          if (retry.error) throw retry.error;
          conversation = retry.data;
        } else conversation = created.data;
        const { error: memberError } = await supabase.from("direct_conversation_members").insert([
          { conversation_id: conversation.id, user_id: user.id },
          { conversation_id: conversation.id, user_id: person.id },
        ]);
        if (memberError && memberError.code !== "23505") throw memberError;
      }
      const { error: restoreError } = await supabase
        .from("direct_conversation_hidden")
        .delete()
        .eq("conversation_id", conversation.id)
        .eq("user_id", user.id);
      if (restoreError) throw restoreError;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["direct-hidden-conversations", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["direct-conversations", user.id] }),
      ]);
      setActiveId(conversation.id);
      setMobileChatOpen(true);
      setPeopleOpen(false);
      setSearch("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start this conversation.");
    }
  }, [user, queryClient]);

  useEffect(() => {
    if (!user || !requestedRecipient || requestedRecipientRef.current === requestedRecipient) return;
    requestedRecipientRef.current = requestedRecipient;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .eq("username", requestedRecipient)
        .maybeSingle();
      if (error || !data) {
        toast.error("That ExpertsTeam contact could not be found.");
        return;
      }
      await startConversation(data as Person);
    })();
  }, [user, requestedRecipient, startConversation]);

  function updateDraft(value: string) {
    setDraft(value);
    if (!activeConversation || !user) return;
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id, typing: Boolean(value.trim()) },
    });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void channelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id, typing: false },
      });
    }, 1800);
  }

  function chooseAttachment(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      toast.error("Choose an image up to 8 MB.");
      return;
    }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachment(file);
    setAttachmentPreview(URL.createObjectURL(file));
  }

  const visibleConversations = conversations.filter((conversation) => {
    const person = conversation.direct_conversation_members.find(
      (member) => member.user_id !== user?.id,
    )?.profiles;
    return (
      personName(person).toLowerCase().includes(search.toLowerCase()) ||
      (person?.username ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  if (!user) {
    return (
      <PageShell hideFooter>
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <MessageCircle className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-2xl font-bold">Your messages</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to start private conversations with the ExpertsTeam community.
          </p>
          <a
            href={`/auth?next=${encodeURIComponent(typeof window === "undefined" ? "/messages" : window.location.pathname + window.location.search)}`}
            className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          >
            Sign in
          </a>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell hideFooter>
      <section className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-3 sm:px-5 lg:px-8">
        <div className="mb-3 flex shrink-0 items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Stay connected
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Messages</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Private conversations, live presence and instant replies.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {onlineIds.length} {onlineIds.length === 1 ? "developer" : "developers"} active now
            </p>
          </div>
          <Button
            onClick={() => {
              setPeopleOpen((open) => !open);
              setSearch("");
            }}
            className="rounded-xl"
          >
            <MessageCircle className="mr-2 h-4 w-4" /> New message
          </Button>
        </div>

        <section className="grid min-h-0 flex-1 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl shadow-black/5 md:grid-cols-[320px_minmax(0,1fr)]">
          <aside
            className={`flex min-h-0 flex-col overflow-hidden border-r border-border/70 bg-background/70 ${mobileChatOpen ? "hidden md:flex" : "flex"}`}
          >
            <div className="border-b border-border/70 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {initials(profile?.display_name || profile?.username || "E")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">
                      {profile?.display_name || profile?.username || "Your inbox"}
                    </p>
                    <p className="text-xs text-muted-foreground">Your inbox</p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="New message"
                  onClick={() => {
                    setPeopleOpen((open) => !open);
                    setSearch("");
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={peopleOpen ? "Find people by name…" : "Search messages"}
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              {peopleOpen && (
                <div className="mt-3 space-y-1">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Start a conversation
                  </p>
                  {peopleLoading && (
                    <p className="p-3 text-xs text-muted-foreground">Searching people…</p>
                  )}
                  {!peopleLoading && search.trim().length >= 2 && people.length === 0 && (
                    <p className="p-3 text-xs text-muted-foreground">No matching members found.</p>
                  )}
                  {people.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => void startConversation(person)}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-secondary"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={person.avatar_url ?? undefined} />
                        <AvatarFallback>{initials(personName(person))}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {personName(person)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{person.username || "member"}
                        </span>
                      </span>
                      <MessageCircle className="h-4 w-4 text-primary" />
                    </button>
                  ))}
                  {search.trim().length < 2 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      Type at least two characters to find a member.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Recent chats
              </span>
              <span className="text-xs text-muted-foreground">{conversations.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {isLoading && (
                <div className="space-y-3 p-3">
                  <div className="h-12 animate-pulse rounded-xl bg-secondary" />
                  <div className="h-12 animate-pulse rounded-xl bg-secondary" />
                </div>
              )}
              {!isLoading && visibleConversations.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-semibold">No conversations yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start a chat with someone in the community.
                  </p>
                </div>
              )}
              {visibleConversations.map((conversation) => {
                const member = conversation.direct_conversation_members.find(
                  (item) => item.user_id !== user.id,
                );
                const selfMember = conversation.direct_conversation_members.find(
                  (item) => item.user_id === user.id,
                );
                const person = member?.profiles;
                const latest = previewByConversation.get(conversation.id);
                const unread =
                  latest &&
                  latest.sender_id !== user.id &&
                  new Date(latest.created_at) > new Date(selfMember?.last_read_at ?? 0);
                return (
                  <button
                    key={conversation.id}
                    onClick={() => {
                      setActiveId(conversation.id);
                      setMobileChatOpen(true);
                    }}
                    className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${conversation.id === activeConversation?.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-secondary/70"}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={person?.avatar_url ?? undefined} />
                        <AvatarFallback>{initials(personName(person))}</AvatarFallback>
                      </Avatar>
                      {onlineIds.includes(person?.id ?? "") && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{personName(person)}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {shortTime(conversation.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {latest ? latest.body || "Photo" : "Start a conversation"}
                      </span>
                    </span>
                    {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
              {recentlyDeleted.length > 0 && (
                <section className="mt-4 border-t border-border/70 px-2 pt-4">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Recently deleted</span>
                    <span className="text-xs text-muted-foreground">{recentlyDeleted.length}</span>
                  </div>
                  <p className="px-2 pb-2 text-[11px] leading-5 text-muted-foreground">
                    Hidden only from your inbox. The other member's chat history is unchanged.
                  </p>
                  {recentlyDeleted.map((conversation) => {
                    const person = conversation.direct_conversation_members.find((item) => item.user_id !== user.id)?.profiles;
                    return (
                      <div key={conversation.id} className="mb-2 flex items-center gap-2 rounded-xl border border-border/70 p-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={person?.avatar_url ?? undefined} />
                          <AvatarFallback>{initials(personName(person))}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{personName(person)}</span>
                        <Button type="button" size="sm" variant="outline" disabled={restoreConversation.isPending} onClick={() => restoreConversation.mutate(conversation.id)}>
                          Restore & open
                        </Button>
                      </div>
                    );
                  })}
                </section>
              )}
            </div>
          </aside>

          <div
            className={`flex min-h-0 min-w-0 flex-col overflow-hidden bg-gradient-to-b from-background to-secondary/20 ${mobileChatOpen ? "flex" : "hidden md:flex"}`}
          >
            {activeConversation && recipient ? (
              <>
                <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-border/70 bg-background/70 px-4 backdrop-blur">
                  <div className="flex min-w-0 items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                      aria-label="Back to inbox"
                      onClick={() => setMobileChatOpen(false)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={recipient.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(personName(recipient))}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{personName(recipient)}</p>
                      <p className="text-xs text-muted-foreground">
                        {onlineIds.includes(recipient.id)
                          ? "Active now"
                          : typing
                            ? "Typing…"
                            : "ExpertsTeam member"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Start video call"
                      title="Start video call"
                      onClick={() => void startVideoCall()}
                      disabled={callState !== "idle"}
                    >
                      <Video className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete chat"
                      title="Remove chat from your inbox"
                      onClick={() => deleteConversation.mutate(activeConversation.id)}
                      disabled={deleteConversation.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </header>
                {callState !== "idle" && (
                  <div className="shrink-0 border-b border-border/70 bg-card/90 p-3">
                    {callState === "incoming" ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Incoming video call</p>
                          <p className="text-xs text-muted-foreground">
                            {personName(recipient)} is calling you.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void acceptVideoCall()}>
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void sendCallSignal("reject").catch(() => undefined);
                              void endCall(false);
                            }}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative overflow-hidden rounded-xl bg-black">
                            <video
                              ref={localVideoRef}
                              autoPlay
                              muted
                              playsInline
                              className="aspect-video w-full object-cover"
                            />
                            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
                              You
                            </span>
                          </div>
                          <div className="relative overflow-hidden rounded-xl bg-black">
                            <video
                              ref={remoteVideoRef}
                              autoPlay
                              playsInline
                              className="aspect-video w-full object-cover"
                            />
                            {!remoteStream && (
                              <span className="absolute inset-0 grid place-items-center text-xs text-white/70">
                                Connecting…
                              </span>
                            )}
                            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
                              {personName(recipient)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {callState === "connected" ? "Connected" : "Calling…"}
                          </span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={muted ? "secondary" : "outline"}
                              onClick={() => {
                                const next = !muted;
                                localStream?.getAudioTracks().forEach((track) => {
                                  track.enabled = !next;
                                });
                                setMuted(next);
                              }}
                            >
                              {muted ? "Unmute" : "Mute"}
                            </Button>
                            <Button
                              size="sm"
                              variant={cameraOff ? "secondary" : "outline"}
                              onClick={() => {
                                const next = !cameraOff;
                                localStream?.getVideoTracks().forEach((track) => {
                                  track.enabled = !next;
                                });
                                setCameraOff(next);
                              }}
                            >
                              {cameraOff ? (
                                <Video className="mr-1 h-3.5 w-3.5" />
                              ) : (
                                <VideoOff className="mr-1 h-3.5 w-3.5" />
                              )}{" "}
                              Camera
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void endCall(true)}
                            >
                              <PhoneOff className="mr-1 h-3.5 w-3.5" /> End
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7">
                  <div className="mb-7 text-center">
                    <Avatar className="mx-auto h-16 w-16">
                      <AvatarImage src={recipient.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(personName(recipient))}</AvatarFallback>
                    </Avatar>
                    <p className="mt-3 font-semibold">{personName(recipient)}</p>
                    <p className="text-xs text-muted-foreground">
                      @{recipient.username || "member"} · ExpertsTeam
                    </p>
                  </div>
                  {messagesLoading && (
                    <p className="text-center text-xs text-muted-foreground">
                      Loading conversation…
                    </p>
                  )}
                  {!messagesLoading && messages.length === 0 && (
                    <div className="mx-auto max-w-xs rounded-2xl border border-border/70 bg-card p-5 text-center">
                      <Sparkles className="mx-auto h-6 w-6 text-primary" />
                      <p className="mt-2 text-sm font-semibold">Say hello</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This is the beginning of your conversation. Send a message, share a photo or
                        record a voice note.
                      </p>
                    </div>
                  )}
                  {messages.map((message) => {
                    const mine = message.sender_id === user.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[min(82%,520px)] rounded-3xl px-4 py-3 shadow-sm ${mine ? "rounded-br-md bg-gradient-to-br from-primary to-primary/80 text-primary-foreground" : "rounded-bl-md border border-border/70 bg-card"}`}
                        >
                          {message.media_url &&
                            (message.media_path?.match(/\.(webm|ogg|m4a|mp3|wav)$/i) ? (
                              <audio
                                controls
                                preload="metadata"
                                src={message.media_url}
                                className="mb-2 max-w-full"
                              />
                            ) : (
                              <a href={message.media_url} target="_blank" rel="noreferrer">
                                <img
                                  src={message.media_url}
                                  alt="Shared attachment"
                                  className="mb-2 max-h-80 rounded-2xl object-cover"
                                />
                              </a>
                            ))}
                          {message.body && (
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>
                          )}
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <span
                              className={`flex items-center gap-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                            >
                              {shortTime(message.created_at)}{" "}
                              {mine && <Check className="h-3 w-3" />}
                            </span>
                            {mine && (
                              <button
                                type="button"
                                aria-label="Unsend message"
                                title="Unsend message"
                                onClick={() => unsendMessage.mutate(message)}
                                disabled={unsendMessage.isPending}
                                className="rounded p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typing && (
                    <div className="flex">
                      <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                        Typing…
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!sendMessage.isPending) sendMessage.mutate();
                  }}
                  className="border-t border-border/70 bg-background/80 p-3 sm:p-4"
                >
                  {attachmentPreview && (
                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                      {attachment?.type.startsWith("audio/") ? (
                        <audio controls src={attachmentPreview} className="min-w-0 flex-1" />
                      ) : (
                        <img
                          src={attachmentPreview}
                          alt="Attachment preview"
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs">{attachment?.name}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setAttachment(null);
                          setAttachmentPreview("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-inner">
                    <label
                      className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-primary"
                      title="Attach photo"
                    >
                      <ImagePlus className="h-5 w-5" />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(event) => chooseAttachment(event.target.files?.[0])}
                      />
                    </label>
                    <Button
                      type="button"
                      size="icon"
                      variant={recording ? "destructive" : "ghost"}
                      className="h-10 w-10 shrink-0 rounded-xl"
                      aria-label={recording ? "Stop voice recording" : "Record voice message"}
                      title={recording ? "Stop recording" : "Record voice message"}
                      onClick={() =>
                        recording ? stopVoiceRecording() : void startVoiceRecording()
                      }
                      disabled={sendMessage.isPending || Boolean(attachment && !recording)}
                    >
                      {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <textarea
                      value={draft}
                      onChange={(event) => updateDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (!sendMessage.isPending) sendMessage.mutate();
                        }
                      }}
                      rows={1}
                      maxLength={5000}
                      placeholder="Message…"
                      className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={
                        sendMessage.isPending || (!draft.trim() && !attachment) || recording
                      }
                      className="h-10 w-10 shrink-0 rounded-xl"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-2 px-2 text-[10px] text-muted-foreground">
                    Enter to send · Shift + Enter for a new line
                  </p>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary/20 to-violet-500/10 text-primary ring-1 ring-primary/15">
                  <MessageCircle className="h-9 w-9" />
                </div>
                <h2 className="mt-5 text-xl font-bold">Your conversations, together</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Choose a conversation or start a new one with a creator, learner or builder from
                  the community.
                </p>
                <Button
                  className="mt-5 rounded-xl"
                  onClick={() => {
                    setPeopleOpen(true);
                    setSearch("");
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Start a conversation
                </Button>
              </div>
            )}
          </div>
        </section>
      </section>
    </PageShell>
  );
}
