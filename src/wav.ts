const WAV_HEADER_SIZE = 44;
const RIFF_CHUNK_PREFIX_SIZE = 36;
const PCM_FMT_CHUNK_SIZE = 16;
const WAVE_FORMAT_PCM = 1;

export type WavOptions = {
  channels?: number;
  sampleRate?: number;
  bitsPerSample?: number;
};

export type WavMetadata = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

export function pcmToWav(
  pcm: Buffer,
  {
    channels = 1,
    sampleRate = 24_000,
    bitsPerSample = 16,
  }: WavOptions = {},
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const wav = Buffer.alloc(WAV_HEADER_SIZE + pcm.length);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(RIFF_CHUNK_PREFIX_SIZE + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(PCM_FMT_CHUNK_SIZE, 16);
  wav.writeUInt16LE(WAVE_FORMAT_PCM, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, WAV_HEADER_SIZE);

  return wav;
}

export function readWavMetadata(wav: Buffer): WavMetadata {
  if (wav.length < WAV_HEADER_SIZE) {
    throw new Error("WAV file is too small to contain a valid header");
  }
  if (wav.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("WAV file is missing RIFF header");
  }
  if (wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("WAV file is missing WAVE header");
  }

  let offset = 12;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let bitsPerSample: number | undefined;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      if (chunkSize < PCM_FMT_CHUNK_SIZE || chunkStart + chunkSize > wav.length) {
        throw new Error("WAV fmt chunk is invalid");
      }
      channels = wav.readUInt16LE(chunkStart + 2);
      sampleRate = wav.readUInt32LE(chunkStart + 4);
      bitsPerSample = wav.readUInt16LE(chunkStart + 14);
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (sampleRate === undefined || channels === undefined || bitsPerSample === undefined) {
    throw new Error("WAV file is missing fmt chunk");
  }

  return { sampleRate, channels, bitsPerSample };
}
