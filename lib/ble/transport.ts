/**
 * BLE transport for the Improv Wi-Fi pairing flow.
 *
 * Wraps `react-native-ble-plx` and bridges its Base64 characteristic values to
 * the pure protocol core in `improv.ts`. Nothing here parses or frames bytes —
 * that lives in `improv.ts` and is host-tested; this module only moves bytes
 * across the radio and feeds the {@link ImprovClient}.
 */
import { BleManager, type BleError, type Device } from "react-native-ble-plx";

import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  buildIdentify,
  buildSendWifiSettings,
  CHAR_CURRENT_STATE_UUID,
  CHAR_ERROR_STATE_UUID,
  CHAR_RPC_COMMAND_UUID,
  CHAR_RPC_RESULT_UUID,
  ImprovClient,
  type ImprovProvisionResult,
  IMPROV_SERVICE_UUID,
} from "./improv";

/** Shared manager. A single instance owns the radio for the whole app. */
export const bleManager = new BleManager();

/** A device surfaced by the scanner, trimmed to what the UI renders. */
export type DiscoveredDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
};

/**
 * Scan for devices advertising the Improv Wi-Fi service. Calls `onDevice` for
 * each sighting (devices may be seen repeatedly — de-dupe by `id` upstream) and
 * `onError` if the scan fails. Returns a function that stops the scan.
 */
export function scanForImprovDevices(
  onDevice: (device: DiscoveredDevice) => void,
  onError: (error: BleError) => void,
): () => void {
  void bleManager.startDeviceScan(
    [IMPROV_SERVICE_UUID],
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        onError(error);
        return;
      }
      if (device) {
        onDevice({ id: device.id, name: device.name, rssi: device.rssi });
      }
    },
  );
  return () => {
    void bleManager.stopDeviceScan();
  };
}

/** How long to wait for the device to finish provisioning before giving up. */
const PROVISION_TIMEOUT_MS = 30_000;

/**
 * A live connection to an Improv device. Owns the GATT subscriptions that feed
 * the {@link ImprovClient} and exposes the two commands the UI needs.
 *
 * Lifecycle: {@link connect} → {@link sendWifiSettings} (possibly retried) →
 * {@link disconnect}.
 */
export class ImprovConnection {
  readonly client: ImprovClient;
  private readonly deviceId: string;
  private readonly subscriptions: { remove: () => void }[] = [];
  private disconnected = false;

  private constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.client = new ImprovClient();
  }

  /**
   * Connect, discover services, subscribe to the state/error/result
   * characteristics, then seed the initial state with a one-shot read (Android
   * does not always emit the current value on subscribe).
   */
  static async connect(deviceId: string): Promise<ImprovConnection> {
    const conn = new ImprovConnection(deviceId);
    await bleManager.connectToDevice(deviceId, { requestMTU: 256 });
    await bleManager.discoverAllServicesAndCharacteristicsForDevice(deviceId);

    conn.subscribeByte(CHAR_CURRENT_STATE_UUID, (byte) =>
      conn.client.applyState(byte),
    );
    conn.subscribeByte(CHAR_ERROR_STATE_UUID, (byte) =>
      conn.client.applyError(byte),
    );
    conn.subscribePacket(CHAR_RPC_RESULT_UUID, (bytes) =>
      conn.client.applyResult(bytes),
    );

    await conn.seedInitialState();
    return conn;
  }

  /**
   * Send Wi-Fi credentials and await the provisioning outcome. Resolves with
   * the device's redirect URLs on success, rejects with an
   * {@link ImprovProvisionError} (from the protocol core) on a reported
   * failure, or a timeout error if the device never settles.
   */
  async sendWifiSettings(
    ssid: string,
    password: string,
  ): Promise<ImprovProvisionResult> {
    this.client.reset();
    const settled = this.client.waitForProvision();
    await this.writeRpc(buildSendWifiSettings(ssid, password));
    return Promise.race([settled, this.timeout()]);
  }

  /** Ask the device to blink so the user can identify the right unit. */
  async identify(): Promise<void> {
    await this.writeRpc(buildIdentify());
  }

  /** Tear down subscriptions and drop the GATT connection. Idempotent. */
  async disconnect(): Promise<void> {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions.length = 0;
    try {
      await bleManager.cancelDeviceConnection(this.deviceId);
    } catch {
      // Already gone (device rebooted into station mode after provisioning, or
      // the user walked away). Nothing to clean up.
    }
  }

  // --- internals -----------------------------------------------------------

  private async writeRpc(packet: Uint8Array): Promise<void> {
    await bleManager.writeCharacteristicWithResponseForDevice(
      this.deviceId,
      IMPROV_SERVICE_UUID,
      CHAR_RPC_COMMAND_UUID,
      bytesToBase64(packet),
    );
  }

  private subscribeByte(
    characteristicUUID: string,
    onByte: (byte: number) => void,
  ): void {
    const sub = bleManager.monitorCharacteristicForDevice(
      this.deviceId,
      IMPROV_SERVICE_UUID,
      characteristicUUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) {
          return;
        }
        const bytes = base64ToBytes(characteristic.value);
        if (bytes.length > 0) {
          onByte(bytes[0]);
        }
      },
    );
    this.subscriptions.push(sub);
  }

  private subscribePacket(
    characteristicUUID: string,
    onPacket: (bytes: Uint8Array) => void,
  ): void {
    const sub = bleManager.monitorCharacteristicForDevice(
      this.deviceId,
      IMPROV_SERVICE_UUID,
      characteristicUUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) {
          return;
        }
        onPacket(base64ToBytes(characteristic.value));
      },
    );
    this.subscriptions.push(sub);
  }

  private async seedInitialState(): Promise<void> {
    const seed = async (uuid: string, apply: (byte: number) => void) => {
      try {
        const ch = await bleManager.readCharacteristicForDevice(
          this.deviceId,
          IMPROV_SERVICE_UUID,
          uuid,
        );
        if (ch.value) {
          const bytes = base64ToBytes(ch.value);
          if (bytes.length > 0) {
            apply(bytes[0]);
          }
        }
      } catch {
        // A failed seed read is non-fatal: the notification path will deliver
        // the value. We only read to avoid a blank first frame.
      }
    };
    await seed(CHAR_CURRENT_STATE_UUID, (b) => this.client.applyState(b));
    await seed(CHAR_ERROR_STATE_UUID, (b) => this.client.applyError(b));
  }

  private timeout(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "The device didn't finish connecting in time. Move closer and try again.",
          ),
        );
      }, PROVISION_TIMEOUT_MS);
    });
  }
}

/** Re-export for screens that only need the device type. */
export type { Device };
