import {
  AppWindow,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Gamepad2,
  Package,
  type LucideIcon,
} from "lucide-react";

const MAP: Array<{ icon: LucideIcon; ext: string[]; tone: string }> = [
  { icon: AppWindow, ext: ["apk", "exe", "app", "msi", "dmg", "ipa", "aab", "jar"], tone: "text-accent" },
  { icon: Gamepad2, ext: ["unity3d", "love", "swf", "rom", "nes", "gba", "iso"], tone: "text-accent" },
  { icon: FileVideo, ext: ["mp4", "mov", "avi", "mkv", "webm"], tone: "text-primary" },
  { icon: FileAudio, ext: ["mp3", "wav", "ogg", "m4a", "flac"], tone: "text-chart-3" },
  {
    icon: FileImage,
    ext: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"],
    tone: "text-chart-4",
  },
  { icon: FileArchive, ext: ["zip", "rar", "7z", "tar", "gz"], tone: "text-chart-5" },
  { icon: FileSpreadsheet, ext: ["csv", "xls", "xlsx"], tone: "text-accent" },
  { icon: FileText, ext: ["pdf", "doc", "docx", "txt", "md", "epub", "ppt", "pptx", "odt", "rtf", "pages"], tone: "text-primary" },
  {
    icon: FileCode2,
    ext: ["js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "html", "css", "json", "php", "sql", "go", "rs", "cs", "sh", "bash", "vue", "svelte"],
    tone: "text-chart-3",
  },
];

export function fileIconFor(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const found = MAP.find((entry) => entry.ext.includes(ext));
  return { Icon: found?.icon ?? Package, tone: found?.tone ?? "text-muted-foreground", ext };
}
