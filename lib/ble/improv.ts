/**
 * Improv Wi-Fi BLE protocol — pure, transport-agnostic core.
 *
 * This is the app-side counterpart to the firmware's load-bearing protocol
 * module (`hush-device/src/proto/improv.rs`). It implements the wire format
 * and the client-side view of the provisioning state machine of the
 * [Improv Wi-Fi BLE standard](https://www.improv-wifi.com/ble/), which the
 * app drives to hand a fresh device its Wi-Fi credentials over BLE.
 *
 * ## Why this file must be byte-for-byte correct
 *
 * The UUIDs, the RPC framing/checksum and the SSID/password sub-framing here
 * are a contract shared with the firmware (coordination point: OPE-54). A
 * wrong checksum byte or an off-by-one in the sub-framing silently bricks
 * onboarding. Everything in here is pure logic with no BLE/React Native
 * imports, so it is fully exercised by the host tests in `improv.test.ts`.
 * The BLE radio plumbing lives in `transport.ts`.
 *
 * If this file and the firmware ever disagree, the published Improv standard
 * (and `hush-protocol`) win and this is the bug.
 */

// -----------------------------------------------------------------------------
// UUIDs
// -----------------------------------------------------------------------------

/**
 * Improv Wi-Fi service UUID. Lowercase to match `react-native-ble-plx`, which
 * normalises every UUID it returns to lowercase — comparisons must be
 * lowercase on both sides or scan filtering silently drops the device.
 */
export const IMPROV_SERVICE_UUID = "00467768-6228-2272-4663-277478268000";

/** `Current State` characteristic — read + notify, 1 byte ({@link ImprovState}). */
export const CHAR_CURRENT_STATE_UUID = "00467768-6228-2272-4663-277478268001";
/** `Error State` characteristic — read + notify, 1 byte ({@link ImprovError}). */
export const CHAR_ERROR_STATE_UUID = "00467768-6228-2272-4663-277478268002";
/** `RPC Command` characteristic — write, framed RPC packet. */
export const CHAR_RPC_COMMAND_UUID = "00467768-6228-2272-4663-277478268003";
/** `RPC Result` characteristic — read + notify, framed RPC result. */
export const CHAR_RPC_RESULT_UUID = "00467768-6228-2272-4663-277478268004";
/** `Capabilities` characteristic — read, 1 byte bitfield. */
export const CHAR_CAPABILITIES_UUID = "00467768-6228-2272-4663-277478268005";

// -----------------------------------------------------------------------------
// State / error enums (the single-byte characteristic values)
// -----------------------------------------------------------------------------

/** `Current State` characteristic values (Improv spec §"Current State"). */
export enum ImprovState {
  /** Device wants a physical authorization step before accepting credentials. */
  AuthorizationRequired = 0x01,
  /** Ready to receive credentials. */
  Authorized = 0x02,
  /** Credentials received; the device is attempting to join the AP. */
  Provisioning = 0x03,
  /** Joined the AP and registered with the backend. Terminal success. */
  Provisioned = 0x04,
}

/** `Error State` characteristic values (Improv spec §"Error State"). */
export enum ImprovError {
  None = 0x00,
  InvalidRpcPacket = 0x01,
  UnknownRpcCommand = 0x02,
  /** Could not join the AP (wrong password, AP out of range, DHCP failure…). */
  UnableToConnect = 0x03,
  NotAuthorized = 0x04,
  Unknown = 0xff,
}

/** RPC command identifiers (app → device, written to `RPC Command`). */
export enum ImprovRpcCommand {
  SendWifiSettings = 0x01,
  Identify = 0x02,
}

/**
 * SSID / password capacities. Match the firmware's
 * `WIFI_SSID_MAX_LEN` / `WIFI_PSK_MAX_LEN` (32 / 64, the 802.11 + WPA2 maxima).
 * A credential the radio cannot accept is rejected here rather than written
 * and silently dropped.
 */
export const SSID_MAX_LEN = 32;
export const PSK_MAX_LEN = 64;

// -----------------------------------------------------------------------------
// Framing
// -----------------------------------------------------------------------------

/** Raised when an outgoing credential exceeds what the radio accepts. */
export class ImprovEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImprovEncodeError";
  }
}

/** Raised when an incoming RPC result packet is malformed. */
export class ImprovDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImprovDecodeError";
  }
}

/**
 * Improv checksum: the unsigned-8 sum of every byte that precedes the trailing
 * checksum byte. Used by both the command and result framings.
 */
export function checksum(bytes: ArrayLike<number>): number {
  let acc = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    acc = (acc + bytes[i]) & 0xff;
  }
  return acc;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Frame an Improv RPC command packet:
 *
 * ```text
 * byte 0      : command
 * byte 1      : data length (N)
 * byte 2..2+N : data
 * byte 2+N    : checksum = (sum of bytes 0..2+N) mod 256
 * ```
 *
 * The total packet length is therefore always `N + 3`. The data field is a
 * single `u8` length, so `data` must be at most 255 bytes.
 */
export function frameRpcCommand(
  command: ImprovRpcCommand,
  data: Uint8Array,
): Uint8Array {
  if (data.length > 255) {
    throw new ImprovEncodeError(
      `RPC data too long: ${data.length} bytes (max 255).`,
    );
  }
  const packet = new Uint8Array(data.length + 3);
  packet[0] = command;
  packet[1] = data.length;
  packet.set(data, 2);
  packet[packet.length - 1] = checksum(packet.subarray(0, packet.length - 1));
  return packet;
}

/**
 * Build a `SendWifiSettings` (0x01) command. The payload sub-frames the SSID
 * and password, each as `[len, ...bytes]`:
 *
 * ```text
 * byte 0          : ssid length (S)
 * byte 1..1+S     : ssid (UTF-8)
 * byte 1+S        : password length (P)
 * byte 2+S..2+S+P : password (UTF-8)
 * ```
 *
 * An empty password is valid (open network). Throws {@link ImprovEncodeError}
 * if either field exceeds the radio's capacity.
 */
export function buildSendWifiSettings(
  ssid: string,
  password: string,
): Uint8Array {
  const ssidBytes = utf8Encoder.encode(ssid);
  const passBytes = utf8Encoder.encode(password);
  if (ssidBytes.length === 0) {
    throw new ImprovEncodeError("SSID must not be empty.");
  }
  if (ssidBytes.length > SSID_MAX_LEN) {
    throw new ImprovEncodeError(
      `SSID too long: ${ssidBytes.length} bytes (max ${SSID_MAX_LEN}).`,
    );
  }
  if (passBytes.length > PSK_MAX_LEN) {
    throw new ImprovEncodeError(
      `Password too long: ${passBytes.length} bytes (max ${PSK_MAX_LEN}).`,
    );
  }

  const data = new Uint8Array(1 + ssidBytes.length + 1 + passBytes.length);
  let offset = 0;
  data[offset] = ssidBytes.length;
  offset += 1;
  data.set(ssidBytes, offset);
  offset += ssidBytes.length;
  data[offset] = passBytes.length;
  offset += 1;
  data.set(passBytes, offset);

  return frameRpcCommand(ImprovRpcCommand.SendWifiSettings, data);
}

/** Build an `Identify` (0x02) command. Carries no data. */
export function buildIdentify(): Uint8Array {
  return frameRpcCommand(ImprovRpcCommand.Identify, new Uint8Array(0));
}

/**
 * Decode an Improv RPC **result** packet (device → app, notified on the
 * `RPC Result` characteristic):
 *
 * ```text
 * byte 0  : command (echo, e.g. 0x01 for SendWifiSettings)
 * byte 1  : data length
 * data    : repeated [str_len(1), str_bytes (UTF-8)...]
 * last    : checksum
 * ```
 *
 * Returns the list of strings. For `SendWifiSettings` the device may return
 * zero strings (empty list) or a single post-provisioning redirect URL.
 * Throws {@link ImprovDecodeError} on any framing/checksum/UTF-8 violation.
 */
export function parseRpcResult(packet: Uint8Array): string[] {
  // Smallest valid packet is [cmd, 0, checksum].
  if (packet.length < 3) {
    throw new ImprovDecodeError(
      `RPC result too short: ${packet.length} bytes (min 3).`,
    );
  }
  const dataLen = packet[1];
  const expected = dataLen + 3;
  if (packet.length !== expected) {
    throw new ImprovDecodeError(
      `RPC result length mismatch: got ${packet.length}, expected ${expected}.`,
    );
  }
  const got = packet[packet.length - 1];
  const want = checksum(packet.subarray(0, packet.length - 1));
  if (got !== want) {
    throw new ImprovDecodeError(
      `RPC result checksum mismatch: got 0x${got.toString(16)}, expected 0x${want.toString(16)}.`,
    );
  }

  const data = packet.subarray(2, 2 + dataLen);
  const strings: string[] = [];
  let offset = 0;
  while (offset < data.length) {
    const strLen = data[offset];
    offset += 1;
    const end = offset + strLen;
    if (end > data.length) {
      throw new ImprovDecodeError(
        `RPC result string overruns buffer: needs ${strLen} bytes, ${data.length - offset} left.`,
      );
    }
    try {
      strings.push(utf8Decoder.decode(data.subarray(offset, end)));
    } catch {
      throw new ImprovDecodeError("RPC result string is not valid UTF-8.");
    }
    offset = end;
  }
  return strings;
}

// -----------------------------------------------------------------------------
// Client state machine
// -----------------------------------------------------------------------------

/** Human-facing phase of the pairing flow, derived from the Improv bytes. */
export type ImprovPhase =
  | "idle" // not yet started / waiting for the device to report a state
  | "ready" // device is Authorized and waiting for credentials
  | "provisioning" // credentials sent; device is joining the AP
  | "provisioned" // success; redirect URL (if any) available
  | "error"; // a recoverable error; the device is back to Authorized

/** Outcome of a successful provisioning attempt. */
export type ImprovProvisionResult = {
  /**
   * Strings returned by the device on the `RPC Result` characteristic. Per the
   * Improv spec the first, if present, is a post-provisioning URL to open. The
   * current firmware sends an empty list (see OPE-49 open decision in the PR).
   */
  redirectUrls: string[];
};

/**
 * Map an {@link ImprovError} to a stable, machine-readable code plus a
 * user-facing message. Kept separate from rendering so screens branch on
 * `code`, not on copy.
 */
export function describeImprovError(error: ImprovError): {
  code: string;
  message: string;
} {
  switch (error) {
    case ImprovError.UnableToConnect:
      return {
        code: "unable_to_connect",
        message:
          "The device couldn't join that network. Check the password and that the network is in range.",
      };
    case ImprovError.NotAuthorized:
      return {
        code: "not_authorized",
        message: "The device rejected provisioning before it was authorized.",
      };
    case ImprovError.InvalidRpcPacket:
      return {
        code: "invalid_rpc_packet",
        message: "The device couldn't read the credentials. Please try again.",
      };
    case ImprovError.UnknownRpcCommand:
      return {
        code: "unknown_rpc_command",
        message: "This device firmware doesn't support that command.",
      };
    case ImprovError.Unknown:
      return {
        code: "unknown",
        message: "The device reported an unexpected error. Please try again.",
      };
    case ImprovError.None:
      return { code: "none", message: "" };
    default:
      return {
        code: "unknown",
        message: "The device reported an unexpected error. Please try again.",
      };
  }
}

/** Error thrown when a provisioning attempt fails. Carries the device's error. */
export class ImprovProvisionError extends Error {
  readonly improvError: ImprovError;
  readonly code: string;
  constructor(improvError: ImprovError) {
    const { code, message } = describeImprovError(improvError);
    super(message || `Provisioning failed (error 0x${improvError.toString(16)}).`);
    this.name = "ImprovProvisionError";
    this.improvError = improvError;
    this.code = code;
  }
}

/**
 * Client-side view of the Improv provisioning machine. This is the mirror of
 * the firmware's `Improv` struct, but from the *app's* perspective: instead of
 * owning the state, it observes the device's `Current State` / `Error State` /
 * `RPC Result` notifications and resolves a single pending provisioning
 * attempt.
 *
 * It is deliberately free of any BLE dependency: `transport.ts` feeds it the
 * decoded characteristic values via {@link applyState} / {@link applyError} /
 * {@link applyResult}, and the screens read {@link phase} and await
 * {@link waitForProvision}. This keeps the transition logic fully host-tested.
 */
export class ImprovClient {
  private state: ImprovState | null = null;
  private error: ImprovError = ImprovError.None;
  private result: string[] | null = null;
  private listeners = new Set<(phase: ImprovPhase) => void>();

  // The single in-flight provisioning attempt. We only ever track one: the UI
  // sends credentials, then awaits the next terminal transition.
  private pending: {
    resolve: (result: ImprovProvisionResult) => void;
    reject: (error: ImprovProvisionError) => void;
    // `true` once we've observed Provisioning, so a late settle on the initial
    // Authorized state doesn't resolve a fresh attempt prematurely.
    sawProvisioning: boolean;
    settled: boolean;
  } | null = null;

  /** Current human-facing phase, derived from the latest state + error. */
  get phase(): ImprovPhase {
    if (this.state === null) {
      return "idle";
    }
    switch (this.state) {
      case ImprovState.Provisioning:
        return "provisioning";
      case ImprovState.Provisioned:
        return "provisioned";
      case ImprovState.AuthorizationRequired:
        return "idle";
      case ImprovState.Authorized:
      default:
        return this.error !== ImprovError.None ? "error" : "ready";
    }
  }

  get currentState(): ImprovState | null {
    return this.state;
  }

  get currentError(): ImprovError {
    return this.error;
  }

  /** Subscribe to phase changes. Returns an unsubscribe function. */
  subscribe(listener: (phase: ImprovPhase) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Feed a `Current State` notification (1 raw byte). */
  applyState(byte: number): void {
    this.state = byte as ImprovState;
    if (this.state === ImprovState.Provisioning) {
      if (this.pending) {
        this.pending.sawProvisioning = true;
      }
    } else if (this.state === ImprovState.Provisioned) {
      this.settleSuccess();
    } else if (this.state === ImprovState.Authorized) {
      // A drop back to Authorized after Provisioning means the attempt failed;
      // the matching error byte tells us why. If the error byte hasn't arrived
      // yet we wait for it (the firmware notifies error before state).
      if (this.error !== ImprovError.None) {
        this.settleFailure(this.error);
      }
    }
    this.emit();
  }

  /** Feed an `Error State` notification (1 raw byte). */
  applyError(byte: number): void {
    this.error = byte as ImprovError;
    if (
      this.error !== ImprovError.None &&
      this.pending?.sawProvisioning &&
      this.state !== ImprovState.Provisioning
    ) {
      // Error reported while not actively provisioning → the attempt failed.
      this.settleFailure(this.error);
    }
    this.emit();
  }

  /** Feed an `RPC Result` notification (raw framed packet). */
  applyResult(packet: Uint8Array): void {
    try {
      this.result = parseRpcResult(packet);
    } catch {
      // A malformed result doesn't change the provisioning outcome — the state
      // byte is authoritative — so we degrade to "no redirect URLs".
      this.result = [];
    }
    // If we've already reached Provisioned, the success may have settled with
    // an empty result before this notification landed; nothing more to do here.
    this.emit();
  }

  /**
   * Await the outcome of the provisioning attempt started by sending
   * credentials. Resolves on {@link ImprovState.Provisioned}, rejects with
   * {@link ImprovProvisionError} when the device falls back to Authorized with
   * a non-None error. Only one attempt may be pending at a time.
   */
  waitForProvision(): Promise<ImprovProvisionResult> {
    if (this.pending && !this.pending.settled) {
      return Promise.reject(
        new ImprovProvisionError(ImprovError.Unknown),
      );
    }
    // If we're already terminal, settle synchronously.
    if (this.state === ImprovState.Provisioned) {
      return Promise.resolve({ redirectUrls: this.result ?? [] });
    }
    return new Promise<ImprovProvisionResult>((resolve, reject) => {
      this.pending = {
        resolve,
        reject,
        sawProvisioning: this.state === ImprovState.Provisioning,
        settled: false,
      };
    });
  }

  /** Reset for a fresh attempt (e.g. after an error, before re-sending). */
  reset(): void {
    if (this.pending && !this.pending.settled) {
      this.pending.settled = true;
      this.pending.reject(new ImprovProvisionError(ImprovError.Unknown));
    }
    this.pending = null;
    this.error = ImprovError.None;
    this.result = null;
    this.emit();
  }

  private settleSuccess(): void {
    if (this.pending && !this.pending.settled) {
      this.pending.settled = true;
      this.pending.resolve({ redirectUrls: this.result ?? [] });
    }
  }

  private settleFailure(error: ImprovError): void {
    if (this.pending && !this.pending.settled && this.pending.sawProvisioning) {
      this.pending.settled = true;
      this.pending.reject(new ImprovProvisionError(error));
    }
  }

  private emit(): void {
    const phase = this.phase;
    for (const listener of this.listeners) {
      listener(phase);
    }
  }
}
