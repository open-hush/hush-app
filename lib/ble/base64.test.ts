import { base64ToBytes, bytesToBase64 } from "./base64";

describe("base64", () => {
  const cases: [number[], string][] = [
    [[], ""],
    [[0x66], "Zg=="],
    [[0x66, 0x6f], "Zm8="],
    [[0x66, 0x6f, 0x6f], "Zm9v"],
    [[0x01, 0x02, 0x6e], "AQJu"], // a framed Improv-style packet
    [[0x00, 0xff, 0x80, 0x7f], "AP+Afw=="],
  ];

  it.each(cases)("encodes %j to %s", (bytes, b64) => {
    expect(bytesToBase64(new Uint8Array(bytes))).toBe(b64);
  });

  it.each(cases)("decodes %s back to %j", (bytes, b64) => {
    expect(Array.from(base64ToBytes(b64))).toEqual(bytes);
  });

  it("round-trips arbitrary binary including high bytes", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bytes[i] = i;
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes),
    );
  });

  it("tolerates unpadded input", () => {
    expect(Array.from(base64ToBytes("Zm8"))).toEqual([0x66, 0x6f]);
  });
});
