import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Signal = { sender_id: string; target_id: string; kind: "offer"|"answer"|"ice"|"hangup"; media?: "audio"|"video"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function ConversationCall({ conversationId, recipientId, recipientName }: { conversationId: string; recipientId: string; recipientName: string }) {
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel|null>(null);
  const peerRef = useRef<RTCPeerConnection|null>(null);
  const localRef = useRef<MediaStream|null>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const incomingOffer = useRef<{sdp:RTCSessionDescriptionInit; senderId:string; media:"audio"|"video"}|null>(null);
  const [status,setStatus] = useState<"idle"|"calling"|"incoming"|"connected">("idle");
  const [muted,setMuted] = useState(false);
  const [cameraOff,setCameraOff] = useState(false);
  const [mediaMode,setMediaMode] = useState<"audio"|"video">("video");
  const [channelReady,setChannelReady] = useState(false);
  const [localStream,setLocalStream] = useState<MediaStream|null>(null);
  const [remoteStream,setRemoteStream] = useState<MediaStream|null>(null);

  function cleanup() {
    peerRef.current?.close(); peerRef.current=null;
    localRef.current?.getTracks().forEach(track=>track.stop()); localRef.current=null;
    if (localVideo.current) localVideo.current.srcObject=null;
    if (remoteVideo.current) remoteVideo.current.srcObject=null;
    setLocalStream(null); setRemoteStream(null);
    pendingIce.current=[];
    incomingOffer.current=null;
  }

  useEffect(() => {
    if (localVideo.current && localStream) localVideo.current.srcObject = localStream;
    if (remoteVideo.current && remoteStream) remoteVideo.current.srcObject = remoteStream;
  }, [localStream, remoteStream, status]);

  const userId = user?.id;

  useEffect(() => {
    if (!userId || !conversationId) return;
    const channel = supabase.channel("call:"+conversationId,{config:{private:true}});
    channel.on("broadcast",{event:"signal"},async ({payload}) => {
      const signal = payload as Signal;
      if (!signal || signal.sender_id === userId || signal.target_id !== userId) return;
      try {
        if (signal.kind === "hangup") { cleanup(); setStatus("idle"); return; }
        if (signal.kind === "offer" && signal.sdp) {
          incomingOffer.current={sdp:signal.sdp,senderId:signal.sender_id,media:signal.media === "audio" ? "audio" : "video"};
          setMediaMode(signal.media === "audio" ? "audio" : "video");
          setStatus("incoming");
        }
        if (signal.kind === "answer" && signal.sdp && peerRef.current) {
          await peerRef.current.setRemoteDescription(signal.sdp);
          setStatus("connected");
          for (const candidate of pendingIce.current.splice(0)) await peerRef.current.addIceCandidate(candidate);
        }
        if (signal.kind === "ice" && signal.candidate) {
          if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(signal.candidate);
          else pendingIce.current.push(signal.candidate);
        }
      } catch (error) { toast.error(error instanceof Error ? error.message : "Call connection failed."); }
    }).subscribe((channelStatus) => {
      setChannelReady(channelStatus === "SUBSCRIBED");
      if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
        toast.error("Secure call signaling is unavailable. Check your connection and try again.");
      }
    });
    channelRef.current=channel;
    return () => { setChannelReady(false); cleanup(); channelRef.current=null; void supabase.removeChannel(channel); };
  },[userId,conversationId]);

  async function preparePeer(withVideo = true) {
    if (!user) throw new Error("Sign in to call.");
    const channel=channelRef.current;
    if (!channel || !channelReady) throw new Error("Secure call channel is still connecting. Try again in a moment.");
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:withVideo?{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}:false});
    localRef.current=stream;
    setLocalStream(stream);
    const peer=new RTCPeerConnection({iceServers:ICE_SERVERS});
    peerRef.current=peer;
    stream.getTracks().forEach(track=>peer.addTrack(track,stream));
    peer.ontrack=event=>setRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
    peer.onicecandidate=event=>{if(event.candidate) void channel.send({type:"broadcast",event:"signal",payload:{sender_id:user.id,target_id:recipientId,kind:"ice",candidate:event.candidate.toJSON()}});};
    peer.onconnectionstatechange=()=>{if(peer.connectionState==="connected") setStatus("connected"); if(["failed","closed"].includes(peer.connectionState)){cleanup();setStatus("idle");}};
    peer.oniceconnectionstatechange=()=>{if(peer.iceConnectionState==="failed") toast.error("This network could not connect the call directly. Try audio-only or another network; some networks require a TURN relay.");};
    return {peer,channel};
  }

  async function startCall() {
    try {
      const {peer,channel}=await preparePeer();
      setStatus("calling");
      const offer=await peer.createOffer();
      await peer.setLocalDescription(offer);
      await channel.send({type:"broadcast",event:"signal",payload:{sender_id:user!.id,target_id:recipientId,kind:"offer",media:mode,sdp:offer}});
    } catch(error) { cleanup(); setStatus("idle"); toast.error(error instanceof Error ? error.message : "Allow camera and microphone access to start a call."); }
  }

  async function answerCall() {
    try {
      const invitation=incomingOffer.current;
      if(!invitation) throw new Error("This call invitation has expired. Ask them to call again.");
      const {peer,channel}=await preparePeer();
      await peer.setRemoteDescription(invitation.sdp);
      const answer=await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await channel.send({type:"broadcast",event:"signal",payload:{sender_id:user!.id,target_id:invitation.senderId,kind:"answer",sdp:answer}});
      for (const candidate of pendingIce.current.splice(0)) await peer.addIceCandidate(candidate);
      setStatus("calling");
    } catch(error) { cleanup(); setStatus("idle"); toast.error(error instanceof Error ? error.message : "Could not answer call."); }
  }

  async function hangup() {
    if(user) await channelRef.current?.send({type:"broadcast",event:"signal",payload:{sender_id:user.id,target_id:recipientId,kind:"hangup"}});
    cleanup(); setStatus("idle");
  }

  async function declineCall() {
    const callerId = incomingOffer.current?.senderId;
    if (user && callerId) {
      await channelRef.current?.send({type:"broadcast",event:"signal",payload:{sender_id:user.id,target_id:callerId,kind:"hangup"}});
    }
    cleanup();
    setStatus("idle");
  }

  return <Card className="space-y-3 p-3">
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-semibold">{mediaMode === "audio" ? "Audio call" : "Video call"}</p>
        <p className="text-xs text-muted-foreground">{status==="connected"?"Connected":status==="incoming"?(mediaMode==="audio"?"Incoming audio call":"Incoming video call"):status==="calling"?"Connecting…":"Call "+recipientName}</p>
      </div>
      {status==="idle" ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!channelReady} onClick={()=>void startCall("audio")}><Phone className="mr-2 h-4 w-4"/>Audio call</Button><Button size="sm" disabled={!channelReady} onClick={()=>void startCall("video")}><Video className="mr-2 h-4 w-4"/>Video call</Button></div> : status==="incoming" ? <div className="flex gap-2"><Button size="sm" onClick={()=>void answerCall()}><Phone className="mr-2 h-4 w-4"/>Answer</Button><Button size="sm" variant="destructive" onClick={()=>void declineCall()}><PhoneOff className="mr-2 h-4 w-4"/>Decline</Button></div> : <Button size="sm" variant="destructive" onClick={()=>void hangup()}><PhoneOff className="mr-2 h-4 w-4"/>End</Button>}
    </div>
    {status!=="idle" && status!=="incoming" && mediaMode==="video" && <div className="grid grid-cols-2 gap-2"><video ref={remoteVideo} autoPlay playsInline className="aspect-video w-full rounded-xl bg-black"/><video ref={localVideo} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black"/></div>}
    {status!=="idle" && status!=="incoming" && mediaMode==="audio" && <><video ref={remoteVideo} autoPlay playsInline className="hidden"/><p className="rounded-xl bg-secondary/60 px-3 py-2 text-center text-xs text-muted-foreground">Audio call · echo cancellation and noise suppression enabled</p></>}
    {status!=="idle" && status!=="incoming" && <div className="flex gap-2"><Button size="icon" variant="outline" aria-label="Toggle microphone" onClick={()=>{const track=localRef.current?.getAudioTracks()[0]; if(track){track.enabled=!track.enabled;setMuted(!track.enabled);}}}>{muted?<MicOff/>:<Mic/>}</Button>{mediaMode==="video" && <Button size="icon" variant="outline" aria-label="Toggle camera" onClick={()=>{const track=localRef.current?.getVideoTracks()[0]; if(track){track.enabled=!track.enabled;setCameraOff(!track.enabled);}}}>{cameraOff?<VideoOff/>:<Video/>}</Button>}</div>}
    <p className="text-[11px] text-muted-foreground">Calls are user-initiated. Microphone processing reduces echo and background noise. Video uses adaptive browser capture up to 720p. Direct peer connections may need a TURN relay on restrictive networks; no relay credentials are currently configured.</p>
  </Card>;
}
