// Fixed for now — real tenant resolution comes later. session_id is no
// longer fixed: each chat page load generates its own via
// crypto.randomUUID() and passes it through on every request.
export const TENANT_ID = "4bcf1436-9e03-4c4c-be67-a5404d322470";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}
