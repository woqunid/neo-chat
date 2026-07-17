interface ValidationState {
  readonly seen: WeakSet<object>;
  entries: number;
}

const MAX_SCHEMA_DEPTH = 20;
const MAX_SCHEMA_ENTRIES = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function typeMatches(type: string, value: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number")
    return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function getAllowedTypes(schema: Record<string, unknown>): string[] {
  if (typeof schema.type === "string") return [schema.type];
  return Array.isArray(schema.type)
    ? schema.type.filter((item): item is string => typeof item === "string")
    : [];
}

function validateScalar(
  schema: Record<string, unknown>,
  value: unknown,
  path: string,
): string | null {
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((item) => Object.is(item, value))
  ) {
    return `${path} 必须是工具声明的枚举值之一`;
  }
  if (typeof value === "string") {
    if (
      typeof schema.minLength === "number" &&
      value.length < schema.minLength
    ) {
      return `${path} 长度不能小于 ${schema.minLength}`;
    }
    if (
      typeof schema.maxLength === "number" &&
      value.length > schema.maxLength
    ) {
      return `${path} 长度不能超过 ${schema.maxLength}`;
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      return `${path} 不能小于 ${schema.minimum}`;
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      return `${path} 不能大于 ${schema.maximum}`;
    }
  }
  return null;
}

function validateValue(
  schema: Record<string, unknown>,
  value: unknown,
  path: string,
  depth: number,
  state: ValidationState,
): string | null {
  if (depth > MAX_SCHEMA_DEPTH) return `${path} 的结构层级过深`;
  state.entries += 1;
  if (state.entries > MAX_SCHEMA_ENTRIES) return `${path} 包含过多字段`;

  const allowedTypes = getAllowedTypes(schema);
  if (
    allowedTypes.length &&
    !allowedTypes.some((type) => typeMatches(type, value))
  ) {
    return `${path} 的类型不符合工具参数定义`;
  }
  const scalarError = validateScalar(schema, value, path);
  if (scalarError) return scalarError;

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      return `${path} 至少需要 ${schema.minItems} 项`;
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return `${path} 最多允许 ${schema.maxItems} 项`;
    }
    if (isRecord(schema.items)) {
      for (const [index, item] of value.entries()) {
        const error = validateValue(
          schema.items,
          item,
          `${path}[${index}]`,
          depth + 1,
          state,
        );
        if (error) return error;
      }
    }
    return null;
  }

  if (!isRecord(value)) return null;
  if (state.seen.has(value)) return `${path} 不能包含循环引用`;
  state.seen.add(value);
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  for (const name of required) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) {
      return `${path}.${name} 是必填参数`;
    }
  }
  if (schema.additionalProperties === false) {
    const unknown = Object.keys(value).find(
      (name) => !Object.prototype.hasOwnProperty.call(properties, name),
    );
    if (unknown) return `${path}.${unknown} 不是工具声明的参数`;
  }
  for (const [name, child] of Object.entries(value)) {
    const childSchema = properties[name];
    if (!isRecord(childSchema)) continue;
    const error = validateValue(
      childSchema,
      child,
      `${path}.${name}`,
      depth + 1,
      state,
    );
    if (error) return error;
  }
  return null;
}

export function validateMcpSchemaValue(
  schema: unknown,
  value: unknown,
  rootLabel: string,
): string | null {
  if (!isRecord(schema)) return null;
  return validateValue(schema, value, rootLabel, 0, {
    seen: new WeakSet(),
    entries: 0,
  });
}

export function validateMcpToolArguments(
  schema: unknown,
  args: Record<string, unknown>,
): string | null {
  return validateMcpSchemaValue(schema, args, "工具参数");
}
