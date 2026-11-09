import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Signal = { sender_id: string; target_id: string; kind: "offer"|"answer"|"ice"|"hangup"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

export function ConversationCall({ conversationId, recipientName }: { conversationId: string; recipientName: string }) {
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel|null>(null);
  const peerRef = useRef<RTCPeerConnection|null>(null);
  const localRef = useRef<MediaStream|null>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const [status,setStatus] = useState<"idle"|"calling"|"incoming"|"connected">("idle");
  const [muted,setMuted] = useState(false);
  const [cameraOff,setCameraOff] = useState(false);
  const [incoming,setIncoming] = useState(false);

  useEffect(() => {
    if (!user || !conversationId) return;
    const channel = supabase.channel("call:"+conversationId,{config:{private:true}});
    channel.on("broadcast",{event:"signal"},async ({payload}) => {
      const signal = payload as Signal;
      if (!signal || signal.sender_id === user.id || signal.target_id !== user.id) return;
      try {
        if (signal.kind === "hangup") { cleanup(); setStatus("idle"); setIncoming(false); return; }
        if (signal.kind === "offer" && signal.sdp) {
          setIncoming(true); setStatus("incoming");
          (channelRef.current as RealtimeChannel).send({type:"broadcast",event:"ring",payload:{sender_id:user.id,target_id:signal.sender_id}});
          (window as Window & {__expertCallOffer?:RTCSessionDescriptionInit}).__expertCallOffer = signal.sdp;
        }
        if (signal.kind === "answer" && signal.sdp && peerRef.current) {
          await peerRef.current.setRemoteDescription(signal.sdp);
          setStatus("connected");
          for (const candidate of pendingIce.current.splice(0)) await peerRef.current.addIceCandidate(candidate);
        }
        if (signal.kind === "ice" && signal.candidate && peerRef.current) {
          if (peerRef.current.remoteDescription) await peerRef.current.addIceCandidate(signal.candidate);
          else pendingIce.current.push(signal.candidate);
        }
      } catch (error) { toast.error(error instanceof Error ? error.message : "Call connection failed."); }
    }).subscribe();
    channelRef.current=channel;
    return () => { cleanup(); channelRef.current=null; void supabase.removeChannel(channel); };
  },[user?.id,conversationId]);

  function cleanup() {
    peerRef.current?.close(); peerRef.current=null;
    localRef.current?.getTracks().forEach(track=>track.stop()); localRef.current=null;
    if (localVideo.current) localVideo.current.srcObject=null;
    if (remoteVideo.current) remoteVideo.current.srcObject=null;
    pendingIce.current=[];
  }

  async function preparePeer() {
    if (!user) throw new Error("Sign in to call.");
    const channel=channelRef.current;
    if (!channel) throw new Error("Call channel is not ready yet.");
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
    localRef.current=stream;
    if (localVideo.current) localVideo.current.srcObject=stream;
    const peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]});
    peerRef.current=peer;
    stream.getTracks().forEach(track=>peer.addTrack(track,stream));
    peer.ontrack=event=>{if(remoteVideo.current) remoteVideo.current.srcObject=event.streams[0] ?? new MediaStream([event.track]);};
    peer.onicecandidate=event=>{if(event.candidate) void channel.send({type:"broadcast",event:"signal",payload:{sender_id:user.id,target_id:recipientIdRef.current,kind:"ice",candidate:event.candidate.toJSON()}});};
    peer.onconnectionstatechange=()=>{if(peer.connectionState==="connected") setStatus("connected"); if(["failed","disconnected","closed"].includes(peer.connectionState)) setStatus("idle");};
    return {peer,channel};
  }
  const recipientIdRef = useRef("");

  async function startCall() {
    try {
      const {peer,channel}=await preparePeer();
      setStatus("calling");
      const offer=await peer.createOffer();
      await peer.setLocalDescription(offer);
      await channel.send({type:"broadcast",event:"signal",payload:{sender_id:user!.id,target_id:recipientIdRef.current,kind:"offer",sdp:offer}});
    } catch(error) { cleanup(); setStatus("idle"); toast.error(error instanceof Error ? error.message : "Could not start call. Allow camera and microphone access."); }
  }

  async function answerCall() {
    try {
      const offer=(window as Window & {__expertCallOffer?:RTCSessionDescriptionInit}).__expertCallOffer;
      if(!offer) throw new Error("The caller ended the request. Ask them to call again.");
      const {peer,channel}=await preparePeer();
      await peer.setRemoteDescription(offer);
      const answer=await peer.createAnswer();
      await peer.setLocalDescription(answer);
      const sender=(offer as RTCSessionDescriptionInit & {__sender?:string}).__sender;
      if(!sender) throw new Error("Call invitation expired. Ask them to call again.");
      await channel.send({type:"broadcast",event:"signal",payload:{sender_id:user!.id,target_id:sender,kind:"answer",sdp:answer}});
      setIncoming(false); setStatus("calling");
    } catch(error) { cleanup(); setStatus("idle"); toast.error(error instanceof Error ? error.message : "Could not answer call."); }
  }

  async function hangup() {
    if(user && recipientIdRef.current) await channelRef.current?.send({type:"broadcast",event:"signal",payload:{sender_id:user.id,target_id:recipientIdRef.current,kind:"hangup"}});
    cleanup(); setIncoming(false); setStatus("idle");
  }

  return <Card className="space-y-3 p-3">
    <div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Video call</p><p className="text-xs text-muted-foreground">{status==="connected"?"Connected":status==="incoming"?"Incoming call":status==="calling"?"Connecting…":"Call "+recipientName}</p></div>
      {status==="idle" ? <Button size="sm" onClick={()=>void startCall()}><Video className="mr-2 h-4 w-4"/>Start call</Button> : status==="incoming" ? <Button size="sm" onClick={()=>void answerCall()}><Phone className="mr-2 h-4 w-4"/>Answer</Button> : <Button size="sm" variant="destructive" onClick={()=>void hangup()}><PhoneOff className="mr-2 h-4 w-4"/>End</Button>}
    </div>
    {status!=="idle" && <div className="grid grid-cols-2 gap-2"><video ref={remoteVideo} autoPlay playsInline className="aspect-video w-full rounded-xl bg-black"/><video ref={localVideo} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black"/></div>}
    {status!=="idle" && <div className="flex gap-2"><Button size="icon" variant="outline" onClick={()=>{const track=localRef.current?.getAudioTracks()[0]; if(track){track.enabled=!track.enabled;setMuted(!track.enabled);}}}>{muted?<MicOff/>:<Mic/>}</Button><Button size="icon" variant="outline" onClick={()=>{const track=localRef.current?.getVideoTracks()[0]; if(track){track.enabled=!track.enabled;setCameraOff(!track.enabled);}}}>{cameraOff?<VideoOff/>:<Video/>}</Button></div>}
    <p className="text-[11px] text-muted-foreground">Camera and microphone access are required. Some networks require a TURN relay; this build uses public STUN servers.</p>
  </Card>;
}
