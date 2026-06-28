import { PermissionsAndroid, Platform, type Permission } from "react-native";

/**
 * Request the runtime permissions BLE scanning needs. iOS gates Bluetooth via
 * the `Info.plist` usage strings (declared in `app.json`), so no runtime
 * prompt is issued there — the OS shows its own dialog on first radio use.
 *
 * Android is version-dependent:
 * - API 31+ (Android 12): `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`. With
 *   `neverForLocation` on the scan permission (set in `app.json`) no location
 *   permission is required.
 * - API ≤30: scanning is gated behind `ACCESS_FINE_LOCATION`.
 *
 * Returns `true` only when every required permission was granted.
 */
export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  const required: Permission[] =
    Platform.Version >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(required);
  return required.every(
    (perm) => result[perm] === PermissionsAndroid.RESULTS.GRANTED,
  );
}
