// HA addons sometimes send ha_device_id as a 32-char hex string without dashes.
// Normalize to standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
export function normalizeHaDeviceId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.includes("-")) return id;
  if (/^[0-9a-fA-F]{32}$/.test(id)) {
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }
  return id;
}
