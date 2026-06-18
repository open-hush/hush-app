import Constants from "expo-constants";

// Base URL for the Hush API. Sourced from `expo.extra.apiUrl` in app.json so it
// can be overridden per build profile without touching code.
const configured = Constants.expoConfig?.extra?.apiUrl;

export const API_BASE_URL =
  typeof configured === "string" && configured.length > 0
    ? configured
    : "http://localhost:8080";
