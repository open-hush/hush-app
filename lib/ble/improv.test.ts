import {
  buildIdentify,
  buildSendWifiSettings,
  CHAR_CAPABILITIES_UUID,
  CHAR_CURRENT_STATE_UUID,
  CHAR_ERROR_STATE_UUID,
  CHAR_RPC_COMMAND_UUID,
  CHAR_RPC_RESULT_UUID,
  checksum,
  describeImprovError,
  frameRpcCommand,
  ImprovClient,
  ImprovEncodeError,
  ImprovError,
  ImprovDecodeError,
  ImprovProvisionError,
  ImprovRpcCommand,
  ImprovState,
  IMPROV_SERVICE_UUID,
  parseRpcResult,
  PSK_MAX_LEN,
  SSID_MAX_LEN,
} from "./improv";

/** Frame an Improv RPC result packet with a correct checksum (device → app). */
function frameResult(command: number, strings: string[]): Uint8Array {
  const enc = new TextEncoder();
  const data: number[] = [];
  for (const s of strings) {
    const bytes = enc.encode(s);
    data.push(bytes.length, ...bytes);
  }
  const packet = [command, data.length, ...data];
  let cs = 0;
  for (const b of packet) cs = (cs + b) & 0xff;
  packet.push(cs);
  return new Uint8Array(packet);
}

describe("UUIDs", () => {
  it("match the firmware constants and differ only in the last hex pair", () => {
    expect(IMPROV_SERVICE_UUID).toBe("00467768-6228-2272-4663-277478268000");
    expect(CHAR_CURRENT_STATE_UUID.endsWith("8001")).toBe(true);
    expect(CHAR_ERROR_STATE_UUID.endsWith("8002")).toBe(true);
    expect(CHAR_RPC_COMMAND_UUID.endsWith("8003")).toBe(true);
    expect(CHAR_RPC_RESULT_UUID.endsWith("8004")).toBe(true);
    expect(CHAR_CAPABILITIES_UUID.endsWith("8005")).toBe(true);
    for (const u of [
      CHAR_CURRENT_STATE_UUID,
      CHAR_ERROR_STATE_UUID,
      CHAR_RPC_COMMAND_UUID,
      CHAR_RPC_RESULT_UUID,
      CHAR_CAPABILITIES_UUID,
    ]) {
      expect(u.slice(0, -1)).toBe(IMPROV_SERVICE_UUID.slice(0, -1));
    }
  });

  it("are all lowercase (react-native-ble-plx normalises to lowercase)", () => {
    expect(IMPROV_SERVICE_UUID).toBe(IMPROV_SERVICE_UUID.toLowerCase());
  });
});

describe("checksum", () => {
  it("is the unsigned-8 sum of the bytes and wraps at 256", () => {
    expect(checksum([0xff, 0x02])).toBe(0x01);
    expect(checksum([])).toBe(0x00);
    expect(checksum([0x01, 0x02, 0x03])).toBe(0x06);
  });
});

describe("frameRpcCommand", () => {
  it("frames [cmd, len, ...data, checksum] with total length N+3", () => {
    const packet = frameRpcCommand(
      ImprovRpcCommand.Identify,
      new Uint8Array([]),
    );
    expect(Array.from(packet)).toEqual([0x02, 0x00, 0x02]);
  });

  it("rejects data longer than a single u8 length field", () => {
    expect(() =>
      frameRpcCommand(ImprovRpcCommand.SendWifiSettings, new Uint8Array(256)),
    ).toThrow(ImprovEncodeError);
  });
});

describe("buildSendWifiSettings", () => {
  it("sub-frames ssid and password and is parseable back by the firmware layout", () => {
    const packet = buildSendWifiSettings("home-net", "s3cr3t-pass");
    // [cmd=1, dataLen, ssidLen, ssid..., passLen, pass..., checksum]
    expect(packet[0]).toBe(ImprovRpcCommand.SendWifiSettings);
    const dataLen = packet[1];
    expect(packet.length).toBe(dataLen + 3);
    // checksum verifies.
    expect(checksum(packet.subarray(0, packet.length - 1))).toBe(
      packet[packet.length - 1],
    );
    // ssid sub-frame.
    const ssidLen = packet[2];
    expect(ssidLen).toBe("home-net".length);
    expect(new TextDecoder().decode(packet.subarray(3, 3 + ssidLen))).toBe(
      "home-net",
    );
    const passLen = packet[3 + ssidLen];
    expect(passLen).toBe("s3cr3t-pass".length);
  });

  it("allows an empty password (open network)", () => {
    const packet = buildSendWifiSettings("open-ap", "");
    const ssidLen = packet[2];
    expect(packet[3 + ssidLen]).toBe(0); // password length 0
  });

  it("accepts max-length ssid and password", () => {
    const ssid = "x".repeat(SSID_MAX_LEN);
    const pass = "y".repeat(PSK_MAX_LEN);
    expect(() => buildSendWifiSettings(ssid, pass)).not.toThrow();
  });

  it("rejects an empty ssid", () => {
    expect(() => buildSendWifiSettings("", "pw")).toThrow(ImprovEncodeError);
  });

  it("rejects an over-capacity ssid or password (byte length, not char length)", () => {
    expect(() => buildSendWifiSettings("x".repeat(SSID_MAX_LEN + 1), "")).toThrow(
      ImprovEncodeError,
    );
    expect(() =>
      buildSendWifiSettings("ok", "y".repeat(PSK_MAX_LEN + 1)),
    ).toThrow(ImprovEncodeError);
    // A 32-char SSID of multi-byte glyphs exceeds 32 bytes and is rejected.
    expect(() => buildSendWifiSettings("é".repeat(SSID_MAX_LEN), "")).toThrow(
      ImprovEncodeError,
    );
  });
});

describe("buildIdentify", () => {
  it("is a zero-data 0x02 command", () => {
    expect(Array.from(buildIdentify())).toEqual([0x02, 0x00, 0x02]);
  });
});

describe("parseRpcResult", () => {
  it("decodes the single redirect URL the firmware may return", () => {
    const url = "https://app.open-hush.com/claim";
    const out = parseRpcResult(frameResult(0x01, [url]));
    expect(out).toEqual([url]);
  });

  it("decodes an empty result (no redirect URL) — the current firmware case", () => {
    expect(parseRpcResult(frameResult(0x01, []))).toEqual([]);
  });

  it("decodes multiple strings", () => {
    expect(parseRpcResult(frameResult(0x01, ["a", "bc"]))).toEqual(["a", "bc"]);
  });

  it("rejects a bad checksum", () => {
    const packet = frameResult(0x01, ["x"]);
    packet[packet.length - 1] ^= 0xff;
    expect(() => parseRpcResult(packet)).toThrow(ImprovDecodeError);
  });

  it("rejects a length-mismatched / truncated packet", () => {
    expect(() => parseRpcResult(new Uint8Array([0x01, 0x00]))).toThrow(
      ImprovDecodeError,
    );
    const packet = frameResult(0x01, ["x"]);
    expect(() => parseRpcResult(packet.subarray(0, packet.length - 1))).toThrow(
      ImprovDecodeError,
    );
  });

  it("rejects a string length that overruns the data buffer", () => {
    // data = [strLen=5, only 1 byte follows]
    const data = [5, 0x61];
    const packet = [0x01, data.length, ...data];
    let cs = 0;
    for (const b of packet) cs = (cs + b) & 0xff;
    packet.push(cs);
    expect(() => parseRpcResult(new Uint8Array(packet))).toThrow(
      ImprovDecodeError,
    );
  });
});

describe("describeImprovError", () => {
  it("maps UnableToConnect to a stable code with a user-facing message", () => {
    const { code, message } = describeImprovError(ImprovError.UnableToConnect);
    expect(code).toBe("unable_to_connect");
    expect(message.length).toBeGreaterThan(0);
  });

  it("maps None to an empty message", () => {
    expect(describeImprovError(ImprovError.None).message).toBe("");
  });
});

describe("ImprovClient state machine", () => {
  it("starts idle, then becomes ready when the device reports Authorized", () => {
    const c = new ImprovClient();
    expect(c.phase).toBe("idle");
    c.applyState(ImprovState.Authorized);
    expect(c.phase).toBe("ready");
  });

  it("resolves waitForProvision on the Authorized → Provisioning → Provisioned path", async () => {
    const c = new ImprovClient();
    c.applyState(ImprovState.Authorized);
    const pending = c.waitForProvision();
    c.applyState(ImprovState.Provisioning);
    expect(c.phase).toBe("provisioning");
    c.applyResult(frameResult(0x01, ["https://app.open-hush.com/claim"]));
    c.applyState(ImprovState.Provisioned);
    await expect(pending).resolves.toEqual({
      redirectUrls: ["https://app.open-hush.com/claim"],
    });
    expect(c.phase).toBe("provisioned");
  });

  it("resolves with an empty redirect list when the firmware sends no result", async () => {
    const c = new ImprovClient();
    c.applyState(ImprovState.Authorized);
    const pending = c.waitForProvision();
    c.applyState(ImprovState.Provisioning);
    c.applyState(ImprovState.Provisioned);
    await expect(pending).resolves.toEqual({ redirectUrls: [] });
  });

  it("rejects when the device falls back to Authorized with UnableToConnect (error before state)", async () => {
    const c = new ImprovClient();
    c.applyState(ImprovState.Authorized);
    const pending = c.waitForProvision();
    c.applyState(ImprovState.Provisioning);
    // Firmware notifies the error byte, then the state byte.
    c.applyError(ImprovError.UnableToConnect);
    c.applyState(ImprovState.Authorized);
    await expect(pending).rejects.toBeInstanceOf(ImprovProvisionError);
    await pending.catch((e: ImprovProvisionError) => {
      expect(e.improvError).toBe(ImprovError.UnableToConnect);
      expect(e.code).toBe("unable_to_connect");
    });
    expect(c.phase).toBe("error");
  });

  it("rejects when state returns to Authorized first and the error byte lands after", async () => {
    const c = new ImprovClient();
    c.applyState(ImprovState.Authorized);
    const pending = c.waitForProvision();
    c.applyState(ImprovState.Provisioning);
    // Reverse ordering: state first, then error.
    c.applyState(ImprovState.Authorized);
    c.applyError(ImprovError.UnableToConnect);
    await expect(pending).rejects.toBeInstanceOf(ImprovProvisionError);
  });

  it("does not settle a fresh attempt on the initial Authorized error state", async () => {
    const c = new ImprovClient();
    // A leftover error from a previous attempt is visible before we send again.
    c.applyState(ImprovState.Authorized);
    c.applyError(ImprovError.UnableToConnect);
    expect(c.phase).toBe("error");
    const pending = c.waitForProvision();
    // Never saw Provisioning → the stale error must not reject the new wait.
    let settled = false;
    void pending.then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    // A real attempt now succeeds.
    c.reset();
    const p2 = c.waitForProvision();
    c.applyState(ImprovState.Provisioning);
    c.applyState(ImprovState.Provisioned);
    await expect(p2).resolves.toEqual({ redirectUrls: [] });
  });

  it("notifies subscribers on phase changes", () => {
    const c = new ImprovClient();
    const phases: string[] = [];
    const unsub = c.subscribe((p) => phases.push(p));
    c.applyState(ImprovState.Authorized);
    c.applyState(ImprovState.Provisioning);
    c.applyState(ImprovState.Provisioned);
    unsub();
    c.applyState(ImprovState.Authorized);
    expect(phases).toEqual(["ready", "provisioning", "provisioned"]);
  });

  it("settles synchronously if already provisioned when awaited", async () => {
    const c = new ImprovClient();
    c.applyState(ImprovState.Provisioned);
    await expect(c.waitForProvision()).resolves.toEqual({ redirectUrls: [] });
  });
});
