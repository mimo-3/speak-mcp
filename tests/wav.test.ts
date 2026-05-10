import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pcmToWav, readWavMetadata } from "../src/wav.js";

describe("pcmToWav", () => {
  it("wraps PCM bytes in a valid WAV header", () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const wav = pcmToWav(pcm);

    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.toString("ascii", 12, 16), "fmt ");
    assert.equal(wav.toString("ascii", 36, 40), "data");
    assert.equal(wav.readUInt32LE(40), pcm.length);
    assert.deepEqual(wav.subarray(44), pcm);
  });

  it("reads metadata from a WAV header", () => {
    const wav = pcmToWav(Buffer.from([0x01, 0x02]), {
      channels: 1,
      sampleRate: 48_000,
      bitsPerSample: 16,
    });

    assert.deepEqual(readWavMetadata(wav), {
      sampleRate: 48_000,
      channels: 1,
      bitsPerSample: 16,
    });
  });
});

describe("readWavMetadata", () => {
  it("rejects buffers smaller than the minimum header", () => {
    assert.throws(
      () => readWavMetadata(Buffer.alloc(8)),
      /too small/,
    );
  });

  it("rejects buffers without a RIFF magic", () => {
    const wav = pcmToWav(Buffer.from([0x00]));
    wav.write("XXXX", 0);
    assert.throws(() => readWavMetadata(wav), /RIFF/);
  });

  it("rejects buffers without a WAVE magic", () => {
    const wav = pcmToWav(Buffer.from([0x00]));
    wav.write("XXXX", 8);
    assert.throws(() => readWavMetadata(wav), /WAVE/);
  });

  it("rejects buffers without an fmt chunk", () => {
    const wav = pcmToWav(Buffer.from([0x00]));
    // overwrite the fmt chunk id with something else and shrink the chunk to 0
    wav.write("LIST", 12);
    wav.writeUInt32LE(0, 16);
    assert.throws(() => readWavMetadata(wav), /missing fmt chunk/);
  });

  it("skips a leading LIST chunk before the fmt chunk", () => {
    const fmtChunk = Buffer.alloc(8 + 16);
    fmtChunk.write("fmt ", 0);
    fmtChunk.writeUInt32LE(16, 4);
    fmtChunk.writeUInt16LE(1, 8);   // wFormatTag
    fmtChunk.writeUInt16LE(2, 10);  // channels
    fmtChunk.writeUInt32LE(44_100, 12); // sample rate
    fmtChunk.writeUInt32LE(0, 16);  // byte rate (unused by reader)
    fmtChunk.writeUInt16LE(0, 20);  // block align (unused)
    fmtChunk.writeUInt16LE(24, 22); // bits per sample

    const listSize = 4;
    const listChunk = Buffer.alloc(8 + listSize);
    listChunk.write("LIST", 0);
    listChunk.writeUInt32LE(listSize, 4);
    listChunk.write("INFO", 8);

    const head = Buffer.alloc(12);
    head.write("RIFF", 0);
    head.writeUInt32LE(4 + listChunk.length + fmtChunk.length, 4);
    head.write("WAVE", 8);

    const wav = Buffer.concat([head, listChunk, fmtChunk]);

    assert.deepEqual(readWavMetadata(wav), {
      sampleRate: 44_100,
      channels: 2,
      bitsPerSample: 24,
    });
  });

  it("respects odd-sized chunk padding when scanning for fmt", () => {
    const oddChunk = Buffer.alloc(8 + 3 + 1); // 3 bytes payload + 1 byte pad
    oddChunk.write("JUNK", 0);
    oddChunk.writeUInt32LE(3, 4);

    const fmtChunk = Buffer.alloc(8 + 16);
    fmtChunk.write("fmt ", 0);
    fmtChunk.writeUInt32LE(16, 4);
    fmtChunk.writeUInt16LE(1, 8);
    fmtChunk.writeUInt16LE(1, 10);
    fmtChunk.writeUInt32LE(16_000, 12);
    fmtChunk.writeUInt32LE(0, 16);
    fmtChunk.writeUInt16LE(0, 20);
    fmtChunk.writeUInt16LE(16, 22);

    const head = Buffer.alloc(12);
    head.write("RIFF", 0);
    head.writeUInt32LE(4 + oddChunk.length + fmtChunk.length, 4);
    head.write("WAVE", 8);

    const wav = Buffer.concat([head, oddChunk, fmtChunk]);

    assert.deepEqual(readWavMetadata(wav), {
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
    });
  });
});
