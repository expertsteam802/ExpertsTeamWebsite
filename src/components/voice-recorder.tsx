import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function VoiceRecorder({ onRecorded, disabled=false }: { onRecorded: (file: File) => void; disabled?: boolean }) {
  const recorder = useRef<MediaRecorder|null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream|null>(null);\n  const sizeRef = useRef(0);
  const [recording,setRecording] = useState(false);

  useEffect(() => () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  async function toggle() {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported in this browser. Try the latest Chrome or Edge.");
      return;
    }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      stream.current=audioStream;
      const mimeType = ["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(type=>MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(audioStream,mimeType?{mimeType}:undefined);
      chunks.current=[];
      instance.ondataavailable=event=>{if(event.data.size){sizeRef.current+=event.data.size;if(sizeRef.current>8*1024*1024){toast.error("Voice note reached the 8 MB limit and was stopped.");if(instance.state==="recording")instance.stop();return;}chunks.current.push(event.data);}};
      instance.onerror=()=>{audioStream.getTracks().forEach(track=>track.stop());setRecording(false);toast.error("Recording failed. Please try again.");};
      instance.onstop=()=>{
        const blob=new Blob(chunks.current,{type:instance.mimeType||"audio/webm"});
        audioStream.getTracks().forEach(track=>track.stop());
        stream.current=null;
        if(blob.size>0 && blob.size<=8*1024*1024) onRecorded(new File([blob],"voice-note."+((instance.mimeType||"audio/webm").includes("mp4")?"m4a":"webm"),{type:blob.type}));
      };
      recorder.current=instance;
      instance.start(250);
      setRecording(true);
    } catch(error) { toast.error(error instanceof Error ? error.message : "Allow microphone access to record a voice message."); }
  }

  return <Button type="button" size="icon" variant={recording?"destructive":"ghost"} disabled={disabled} title={recording?"Stop recording":"Record voice message"} aria-label={recording?"Stop recording":"Record voice message"} onClick={()=>void toggle()}>
    {recording?<Square className="h-4 w-4"/>:<Mic className="h-5 w-5"/>}
  </Button>;
}
