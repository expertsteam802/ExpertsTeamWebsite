import { useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ResultEvent = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function SpeechInputButton({ onTranscript, disabled=false }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const recognition = useRef<Recognition|null>(null);
  const [listening,setListening] = useState(false);
  function toggle() {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { toast.error("Voice typing is not supported here. Use Chrome or Edge, or type your message."); return; }
    const instance = new Speech();
    instance.lang = navigator.language || "en-US";
    instance.interimResults = false;
    instance.continuous = false;
    instance.onresult = event => {
      const text = Array.from(event.results).filter(result=>result.isFinal).map(result=>result[0].transcript).join(" ").trim();
      if (text) onTranscript(text);
    };
    instance.onerror = event => { setListening(false); if(event.error!=="no-speech" && event.error!=="aborted") toast.error("Voice input failed: "+event.error); };
    instance.onend = () => setListening(false);
    recognition.current=instance;
    try { instance.start(); setListening(true); } catch { setListening(false); toast.error("Could not start voice input. Check microphone permissions."); }
  }
  return <Button type="button" size="icon" variant={listening?"destructive":"secondary"} disabled={disabled} aria-label={listening?"Stop voice input":"Speak your message"} title={listening?"Listening…":"Voice input"} onClick={toggle}>{listening?<MicOff className="h-4 w-4"/>:<Mic className="h-4 w-4"/>}</Button>;
}
