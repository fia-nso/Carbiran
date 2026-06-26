export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const APP_URL = (
  import.meta.env.VITE_APP_URL || window.location.origin
).replace(/\/+$/, "");
