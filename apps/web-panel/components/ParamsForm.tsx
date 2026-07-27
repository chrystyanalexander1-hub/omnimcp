"use client";

interface PropertySchema {
  readonly type?: string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly default?: unknown;
  readonly items?: { readonly type?: string };
}

interface ObjectSchema {
  readonly properties?: Record<string, PropertySchema>;
  readonly required?: readonly string[];
}

interface Props {
  readonly schema: Record<string, unknown> | undefined;
  readonly value: Record<string, unknown>;
  readonly onChange: (next: Record<string, unknown>) => void;
}

/** Seeds a params object with each property's declared JSON Schema default, so a tool
 * like tiktok-content.publish_video_from_url starts with privacyLevel already set instead
 * of blank. */
export function defaultParamsFrom(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const properties = (schema as ObjectSchema | undefined)?.properties ?? {};
  const result: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(properties)) {
    if (prop.default !== undefined) result[name] = prop.default;
  }
  return result;
}

/** Renders one plain-language input per property declared in a tool's inputSchema —
 * text/number/checkbox/dropdown for the common cases, falling back to a small scoped
 * JSON field only for the rare nested-object/array-of-objects parameter. Reads any
 * tool's schema, so it never needs a hand-built form per tool. */
export default function ParamsForm({ schema, value, onChange }: Props) {
  const properties = (schema as ObjectSchema | undefined)?.properties ?? {};
  const required = new Set((schema as ObjectSchema | undefined)?.required ?? []);
  const propertyNames = Object.keys(properties);

  function setField(name: string, fieldValue: unknown) {
    onChange({ ...value, [name]: fieldValue });
  }

  function unsetField(name: string) {
    const next = { ...value };
    delete next[name];
    onChange(next);
  }

  if (propertyNames.length === 0) {
    return <p className="hint">Esta herramienta no necesita parámetros.</p>;
  }

  return (
    <>
      {propertyNames.map((name) => {
        const prop = properties[name]!;
        const isRequired = required.has(name);
        const label = `${name}${isRequired ? " *" : ""}`;
        const current = value[name];

        if (prop.enum) {
          return (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}</label>
              <select
                id={name}
                value={typeof current === "string" ? current : ""}
                onChange={(e) => (e.target.value ? setField(name, e.target.value) : unsetField(name))}
              >
                <option value="">{isRequired ? "-- elegir --" : "-- ninguno --"}</option>
                {prop.enum.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {prop.description && <span className="hint">{prop.description}</span>}
            </div>
          );
        }

        if (prop.type === "boolean") {
          return (
            <div className="field" key={name} style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                id={name}
                checked={current === true}
                onChange={(e) => setField(name, e.target.checked)}
              />
              <label htmlFor={name} style={{ margin: 0 }}>
                {label}
              </label>
              {prop.description && <span className="hint">{prop.description}</span>}
            </div>
          );
        }

        if (prop.type === "number" || prop.type === "integer") {
          return (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}</label>
              <input
                type="number"
                id={name}
                value={typeof current === "number" ? current : ""}
                onChange={(e) => (e.target.value === "" ? unsetField(name) : setField(name, Number(e.target.value)))}
              />
              {prop.description && <span className="hint">{prop.description}</span>}
            </div>
          );
        }

        if (prop.type === "array" && (prop.items?.type === "string" || prop.items === undefined)) {
          const items = Array.isArray(current) ? (current as unknown[]) : [];
          return (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}</label>
              <input
                type="text"
                id={name}
                placeholder="separado por comas"
                defaultValue={items.join(", ")}
                onBlur={(e) => {
                  const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  if (parts.length > 0) setField(name, parts);
                  else unsetField(name);
                }}
              />
              {prop.description && <span className="hint">{prop.description}</span>}
            </div>
          );
        }

        if (prop.type === "string" || prop.type === undefined) {
          return (
            <div className="field" key={name}>
              <label htmlFor={name}>{label}</label>
              <input
                type="text"
                id={name}
                value={typeof current === "string" ? current : ""}
                onChange={(e) => (e.target.value ? setField(name, e.target.value) : unsetField(name))}
              />
              {prop.description && <span className="hint">{prop.description}</span>}
            </div>
          );
        }

        // Nested object / array-of-objects: no clean single-input representation,
        // scoped JSON just for this one field rather than the whole tool.
        const jsonText = current !== undefined ? JSON.stringify(current, null, 2) : "";
        return (
          <div className="field" key={name}>
            <label htmlFor={name}>{label} (formato JSON)</label>
            <textarea
              id={name}
              defaultValue={jsonText}
              onBlur={(e) => {
                if (!e.target.value.trim()) {
                  unsetField(name);
                  return;
                }
                try {
                  setField(name, JSON.parse(e.target.value));
                } catch {
                  // Invalid JSON mid-edit — leave the user's text alone instead of wiping it.
                }
              }}
            />
            {prop.description && <span className="hint">{prop.description}</span>}
          </div>
        );
      })}
    </>
  );
}
