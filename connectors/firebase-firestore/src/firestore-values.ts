/** Converts between plain JSON and Firestore's typed value wire format ({ stringValue: "x" }, { mapValue: { fields: {...} } }, ...), so tool authors and callers only ever deal with plain JSON. */
export function toFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toFirestoreValue(v)]));
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

export function fromFirestoreValue(value: Record<string, unknown>): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return values.map(fromFirestoreValue);
  }
  if ("mapValue" in value) {
    const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFirestoreValue(v)]));
  }
  return null;
}

export function documentToPlainObject(doc: { name?: string; fields?: Record<string, Record<string, unknown>> }): unknown {
  return {
    name: doc.name,
    fields: Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, fromFirestoreValue(v)])),
  };
}
