export type ImportedZipTextFile = {
  path: string;
  content: string;
  sizeBytes: number;
};

export type ZipTextImportResult = {
  files: ImportedZipTextFile[];
  skipped: number;
};

const SUPPORTED_TEXT_FILE =
  /\.(html?|css|[cm]?[jt]sx?|json|jsonc|md|mdx|txt|ya?ml|toml|py|sql|sh|xml|svg|vue|svelte|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|rb|ipynb|graphql|prisma|env\.(example|template))$/i;
const SUPPORTED_BASENAMES = new Set(["dockerfile", "makefile", "procfile", "readme", "license"]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  "vendor",
  "__macosx",
]);

function safeArchivePath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return null;
  const parts = normalized.split("/").filter((part) => part && part !== ".");
  if (!parts.length || parts.some((part) => part === "..")) return null;
  if (parts.some((part) => SKIPPED_DIRECTORIES.has(part.toLowerCase()))) return null;
  const safe = parts.join("/");
  const basename = parts[parts.length - 1].toLowerCase();
  if (
    basename === ".env" ||
    (basename.startsWith(".env.") && basename !== ".env.example" && basename !== ".env.template") ||
    [".npmrc", ".pypirc", ".netrc", ".git-credentials", "id_rsa", "id_ed25519", "credentials.json"].includes(basename) ||
    /\.(pem|key|p12|pfx|keystore)$/i.test(basename) ||
    /^service-account.*\.json$/i.test(basename)
  ) {
    return null;
  }
  return SUPPORTED_TEXT_FILE.test(safe) || SUPPORTED_BASENAMES.has(basename) ? safe : null;
}

async function inflateRaw(compressed: Uint8Array, maxOutputBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot unpack ZIP files. Open ExpertAI Studio in an up-to-date Chrome or Edge browser.");
  }
  let stream: ReadableStream<Uint8Array>;
  try {
    const copy = new ArrayBuffer(compressed.byteLength);
    new Uint8Array(copy).set(compressed);
    stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  } catch {
    throw new Error("This browser does not support the ZIP compression used by this archive.");
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxOutputBytes) {
        await reader.cancel();
        throw new Error("A ZIP source file expands beyond the 500 KB import limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function extractZipTextFiles(blob: Blob): Promise<ZipTextImportResult> {
  const maxArchiveBytes = 25 * 1024 * 1024;
  const maxFileBytes = 500 * 1024;
  const maxTotalTextBytes = 3 * 1024 * 1024;
  const maxFiles = 400;

  if (blob.size > maxArchiveBytes) {
    throw new Error("ZIP archives must be 25 MB or smaller to import into ExpertAI Studio.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEocd = Math.max(0, bytes.length - 65_557);
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumEocd; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("This ZIP archive is invalid or incomplete.");

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const commentLength = view.getUint16(eocdOffset + 20, true);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    eocdOffset + 22 + commentLength > bytes.length
  ) {
    throw new Error("Multi-disk and ZIP64 archives are not supported yet.");
  }
  if (totalEntries > 2_000 || centralOffset + centralSize > eocdOffset) {
    throw new Error("This ZIP archive has an invalid or excessive file directory.");
  }

  const decoder = new TextDecoder("utf-8");
  const files: ImportedZipTextFile[] = [];
  let skipped = 0;
  let totalTextBytes = 0;
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("This ZIP archive has a damaged file directory.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const nextEntry = nameStart + nameLength + extraLength + fileCommentLength;
    if (nextEntry > bytes.length) throw new Error("This ZIP archive has a damaged file entry.");
    const rawName = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    offset = nextEntry;

    if (!rawName || rawName.endsWith("/")) continue;
    const safePath = safeArchivePath(rawName);
    if (!safePath || (flags & 0x0001) !== 0 || uncompressedSize > maxFileBytes) {
      skipped += 1;
      continue;
    }
    if (files.length >= maxFiles || totalTextBytes + uncompressedSize > maxTotalTextBytes) {
      skipped += 1;
      continue;
    }
    if (method !== 0 && method !== 8) {
      skipped += 1;
      continue;
    }
    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      skipped += 1;
      continue;
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset || dataEnd > bytes.length) {
      skipped += 1;
      continue;
    }
    const compressed = bytes.subarray(dataStart, dataEnd);
    let expanded: Uint8Array;
    if (method === 0) {
      expanded = compressed.slice();
    } else {
      expanded = await inflateRaw(compressed, maxFileBytes);
    }
    if (expanded.byteLength !== uncompressedSize || expanded.subarray(0, Math.min(1024, expanded.length)).includes(0)) {
      skipped += 1;
      continue;
    }
    const content = decoder.decode(expanded);
    files.push({ path: safePath, content, sizeBytes: expanded.byteLength });
    totalTextBytes += expanded.byteLength;
  }

  if (!files.length) return { files, skipped };

  const firstParts = files[0].path.split("/");
  if (firstParts.length > 1) {
    const commonRoot = firstParts[0];
    if (files.every((file) => file.path.startsWith(commonRoot + "/"))) {
      for (const file of files) file.path = file.path.slice(commonRoot.length + 1);
    }
  }

  return { files, skipped };
}
