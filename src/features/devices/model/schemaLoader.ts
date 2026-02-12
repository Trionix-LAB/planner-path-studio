import type { DeviceConfig, DeviceFieldOption, DeviceFieldSchema, DeviceInputForm, DeviceSchema } from './types';
import zima2rSchemaSource from '@/features/devices/schemas/zima2r.ui.yaml?raw';
import gnssUdpSchemaSource from '@/features/devices/schemas/gnss-udp.ui.yaml?raw';

type DeviceSchemaSource = {
  id: string;
  fallbackTitle: string;
  content: string;
};

const SCHEMA_SOURCES: DeviceSchemaSource[] = [
  {
    id: 'zima2r',
    fallbackTitle: 'Zima2R',
    content: zima2rSchemaSource,
  },
  {
    id: 'gnss-udp',
    fallbackTitle: 'GNSS-UDP',
    content: gnssUdpSchemaSource,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toDeviceId = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

const parseScalar = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed === '') return '';

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
};

const parseYamlObject = (source: string): Record<string, unknown> => {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];

  const lines = source.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const match = /^(\s*)([^:#][^:]*):(?:\s*(.*))?$/.exec(line);
    if (!match) {
      throw new Error(`Unsupported YAML line: "${rawLine}"`);
    }

    const indent = match[1].length;
    const key = match[2].trim();
    const rawValue = (match[3] ?? '').trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.value;
    if (!parent) {
      throw new Error('Invalid YAML indentation.');
    }

    if (rawValue === '') {
      const nested: Record<string, unknown> = {};
      parent[key] = nested;
      stack.push({ indent, value: nested });
      continue;
    }

    parent[key] = parseScalar(rawValue);
  }

  return root;
};

const parseSchemaContent = (source: string): Record<string, unknown> => {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    throw new Error('Device schema file is empty.');
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (isRecord(parsed)) return parsed;
  } catch {
    // fallback to YAML
  }

  return parseYamlObject(trimmed);
};

const normalizeInputForm = (value: unknown): DeviceInputForm => {
  if (typeof value !== 'string') return 'text-line';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'number' || normalized === 'numeric') return 'number';
  if (normalized === 'boolean' || normalized === 'bool' || normalized === 'checkbox') return 'boolean';
  if (normalized === 'select' || normalized === 'dropdown') return 'select';
  if (normalized === 'textline' || normalized === 'text-line' || normalized === 'text_line' || normalized === 'text') {
    return 'text-line';
  }
  return 'text-line';
};

const normalizeOptions = (value: unknown): DeviceFieldOption[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .map((option): DeviceFieldOption | null => {
      if (typeof option === 'string') {
        return { label: option, value: option };
      }
      if (!isRecord(option)) {
        return null;
      }
      const rawValue = option.value;
      if (typeof rawValue !== 'string') return null;
      const rawLabel = option.label;
      return {
        value: rawValue,
        label: typeof rawLabel === 'string' ? rawLabel : rawValue,
      };
    })
    .filter((option): option is DeviceFieldOption => option !== null);
  return options.length > 0 ? options : undefined;
};

const normalizeDefaultValue = (value: unknown, inputForm: DeviceInputForm): string | number | boolean => {
  if (inputForm === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    return false;
  }

  if (inputForm === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const normalizeValidation = (
  key: string,
  field: Record<string, unknown>,
  inputForm: DeviceInputForm,
  inputMask?: string,
): DeviceFieldSchema['validation'] => {
  const explicit = field.validation;
  if (typeof explicit === 'string') {
    const normalized = explicit.trim().toLowerCase();
    if (normalized === 'ip') return { type: 'ip' };
    if (normalized === 'port') return { type: 'port' };
    if (normalized === 'number') return { type: 'number' };
  }
  if (isRecord(explicit)) {
    const typeRaw = explicit.type;
    const type =
      typeRaw === 'ip' || typeRaw === 'port' || typeRaw === 'number' || typeRaw === 'none' ? typeRaw : 'none';
    const min = typeof explicit.min === 'number' ? explicit.min : undefined;
    const max = typeof explicit.max === 'number' ? explicit.max : undefined;
    const integer = typeof explicit.integer === 'boolean' ? explicit.integer : undefined;
    const allowEmpty = typeof explicit.allowEmpty === 'boolean' ? explicit.allowEmpty : undefined;
    return {
      type,
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(integer !== undefined ? { integer } : {}),
      ...(allowEmpty !== undefined ? { allowEmpty } : {}),
    };
  }

  if (inputForm === 'boolean') return { type: 'none' };
  if (inputMask === '0.0.0.0') return { type: 'ip' };
  if (/port/i.test(key)) return { type: 'port' };
  if (/baud/i.test(key)) return { type: 'number', min: 1, integer: true };
  if (inputForm === 'number') return { type: 'number' };
  return { type: 'none' };
};

const normalizeDeviceSchema = (id: string, fallbackTitle: string, raw: Record<string, unknown>): DeviceSchema => {
  let root = raw;
  let title = fallbackTitle;

  if (isRecord(raw.fields)) {
    root = raw.fields;
    if (typeof raw.title === 'string' && raw.title.trim()) {
      title = raw.title.trim();
    } else if (typeof raw.id === 'string' && raw.id.trim()) {
      title = raw.id.trim();
    }
  } else {
    const firstNested = Object.entries(raw).find(([, value]) => isRecord(value));
    if (firstNested && isRecord(firstNested[1])) {
      title = firstNested[0];
      root = firstNested[1];
    }
  }

  const fields = Object.entries(root)
    .map(([key, value]): DeviceFieldSchema | null => {
      if (!isRecord(value)) return null;
      const inputForm = normalizeInputForm(value.inputForm ?? value.input_form);
      const inputMaskValue = value.inputMask ?? value.input_mask;
      const inputMask = typeof inputMaskValue === 'string' ? inputMaskValue : undefined;
      const enabledByValue = value.enabledBy ?? value.enabled_by;
      const enabledBy = typeof enabledByValue === 'string' ? enabledByValue : undefined;
      const options = normalizeOptions(value.options);
      const label = typeof value.label === 'string' ? value.label : key;

      return {
        key,
        label,
        ...(typeof value.description === 'string' ? { description: value.description } : {}),
        inputForm,
        ...(inputMask ? { inputMask } : {}),
        ...(enabledBy ? { enabledBy } : {}),
        defaultValue: normalizeDefaultValue(value.defaultValue ?? value.default_value, inputForm),
        ...(options ? { options } : {}),
        validation: normalizeValidation(key, value, inputForm, inputMask),
      };
    })
    .filter((field): field is DeviceFieldSchema => field !== null);

  if (fields.length === 0) {
    throw new Error(`Schema "${title}" has no fields.`);
  }

  return {
    id: toDeviceId(id, 'device'),
    title,
    fields,
  };
};

const createDefaultConfig = (schema: DeviceSchema): DeviceConfig => {
  const config: DeviceConfig = {};
  for (const field of schema.fields) {
    config[field.key] = field.defaultValue;
  }
  return config;
};

let schemaCache: DeviceSchema[] | null = null;

export const loadDeviceSchemas = (): DeviceSchema[] => {
  if (schemaCache) return schemaCache;

  schemaCache = SCHEMA_SOURCES.map((source) => {
    const parsed = parseSchemaContent(source.content);
    return normalizeDeviceSchema(source.id, source.fallbackTitle, parsed);
  });
  return schemaCache;
};

export const getDeviceSchemaById = (id: string): DeviceSchema | null => {
  return loadDeviceSchemas().find((schema) => schema.id === id) ?? null;
};

export const createDefaultDeviceConfig = (schema: DeviceSchema): DeviceConfig => createDefaultConfig(schema);
