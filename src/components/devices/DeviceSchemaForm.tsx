import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isEnabledByConditionSatisfied } from '@/features/devices/model/enabledBy';
import type { DeviceConfig, DeviceFieldSchema, DeviceSchema } from '@/features/devices';
import { cn } from '@/lib/utils';

interface DeviceSchemaFormProps {
  schema: DeviceSchema;
  value: DeviceConfig;
  errors: Record<string, string>;
  focusFieldKey?: string | null;
  focusRequestVersion?: number;
  disabled?: boolean;
  onChange: (key: string, value: string | number | boolean) => void;
}

const getFieldValue = (schemaField: DeviceFieldSchema, value: DeviceConfig): string | number | boolean => {
  const raw = value[schemaField.key];
  if (raw === undefined || raw === null) return schemaField.defaultValue;
  return raw;
};

const isFieldEnabled = (field: DeviceFieldSchema, value: DeviceConfig): boolean => {
  return isEnabledByConditionSatisfied(field.enabledBy, value);
};

const inputPattern = (field: DeviceFieldSchema): string | undefined => {
  if (field.inputMask === '0.0.0.0') {
    return '^(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}$';
  }
  return undefined;
};

const inputMode = (field: DeviceFieldSchema): 'text' | 'numeric' | 'decimal' => {
  if (field.inputForm === 'number') return 'decimal';
  if (field.validation.type === 'port' || /port|baud/i.test(field.key)) return 'numeric';
  return 'text';
};

const renderFieldControl = (
  field: DeviceFieldSchema,
  value: string | number | boolean,
  disabled: boolean,
  onChange: (next: string | number | boolean) => void,
) => {
  if (field.inputForm === 'select' && field.options) {
    return (
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(next)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      value={String(value)}
      type={field.inputForm === 'number' ? 'number' : 'text'}
      inputMode={inputMode(field)}
      placeholder={field.inputMask && field.inputMask !== 'none' ? field.inputMask : undefined}
      pattern={inputPattern(field)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};

type ComPortComboboxProps = {
  value: string;
  ports: string[];
  disabled: boolean;
  onChange: (next: string) => void;
};

type ComPortOption = {
  value: string;
  source: string;
};

const normalizeComPortOptions = (ports: string[], value: string): ComPortOption[] => {
  const options = new Map<string, ComPortOption>();

  for (const rawPort of ports) {
    const source = rawPort.trim();
    if (source.length === 0) continue;
    if (options.has(source)) continue;
    options.set(source, {
      value: source,
      source,
    });
  }

  const currentValue = value.trim();
  if (currentValue.length > 0 && !options.has(currentValue)) {
    options.set(currentValue, {
      value: currentValue,
      source: currentValue,
    });
  }

  return Array.from(options.values());
};

const ComPortCombobox = ({ value, ports, disabled, onChange }: ComPortComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedOptions = useMemo(() => normalizeComPortOptions(ports, value), [ports, value]);
  const typedPortName = query.trim();
  const hasExactTypedPort = typedPortName.length > 0 && normalizedOptions.some((option) => option.value === typedPortName);
  const canUseTypedValue = typedPortName.length > 0 && !hasExactTypedPort;

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const currentValue = value.trim();
  const currentLabel = currentValue.length > 0 ? currentValue : 'Выберите COM-порт';

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled && nextOpen) return;
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="truncate text-left">{currentLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder="Введите или найдите COM-порт"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-56">
            <CommandEmpty>Порты не найдены</CommandEmpty>
            {canUseTypedValue ? (
              <CommandGroup heading="Ввести вручную">
                <CommandItem
                  value={`manual:${typedPortName}`}
                  onSelect={() => {
                    onChange(typedPortName);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="truncate">Использовать "{typedPortName}"</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Доступные порты">
              {normalizedOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.source}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      currentValue.trim() === option.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{option.source}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const DeviceSchemaForm = ({
  schema,
  value,
  errors,
  focusFieldKey = null,
  focusRequestVersion = 0,
  disabled = false,
  onChange,
}: DeviceSchemaFormProps) => {
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [gnssComPorts, setGnssComPorts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadPorts = async () => {
      if (schema.id !== 'gnss-com') {
        if (!cancelled) setGnssComPorts([]);
        return;
      }

      const electronApi = (window as unknown as {
        electronAPI?: {
          gnssCom?: {
            listPorts?: () => Promise<Array<{ path?: string } | string>>;
          };
        };
      }).electronAPI;
      const listPorts = electronApi?.gnssCom?.listPorts;
      if (typeof listPorts !== 'function') {
        if (!cancelled) setGnssComPorts([]);
        return;
      }

      try {
        const raw = await listPorts();
        if (cancelled) return;
        const normalized = raw
          .map((entry) => {
            if (typeof entry === 'string') return entry.trim();
            if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
              return entry.path.trim();
            }
            return '';
          })
          .filter((item) => item.length > 0);
        setGnssComPorts(Array.from(new Set(normalized)));
      } catch {
        if (!cancelled) setGnssComPorts([]);
      }
    };

    void loadPorts();
    return () => {
      cancelled = true;
    };
  }, [schema.id]);

  useEffect(() => {
    if (!focusFieldKey) return;
    const fieldNode = fieldRefs.current[focusFieldKey];
    if (!fieldNode) return;

    if (typeof fieldNode.scrollIntoView === 'function') {
      fieldNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const control = fieldNode.querySelector<HTMLElement>(
      'input,button,[role="combobox"],[tabindex]:not([tabindex="-1"])',
    );
    if (control && typeof control.focus === 'function') {
      control.focus();
    }
  }, [focusFieldKey, focusRequestVersion]);

  return (
    <div className="space-y-4">
      {schema.fields.map((field) => {
        const fieldValue = getFieldValue(field, value);
        const error = errors[field.key];
        const fieldEnabled = isFieldEnabled(field, value);
        const controlDisabled = disabled || !fieldEnabled;

        if (field.inputForm === 'boolean') {
          return (
            <div
              key={field.key}
              ref={(node) => {
                fieldRefs.current[field.key] = node;
              }}
              data-field-key={field.key}
              className="flex items-center justify-between gap-3"
            >
              <Label className="text-sm font-medium">{field.label}</Label>
              <Checkbox
                checked={Boolean(fieldValue)}
                onCheckedChange={(checked) => onChange(field.key, Boolean(checked))}
                disabled={disabled}
              />
            </div>
          );
        }

        return (
          <div
            key={field.key}
            ref={(node) => {
              fieldRefs.current[field.key] = node;
            }}
            data-field-key={field.key}
            className="space-y-2"
          >
            <Label className="text-sm font-medium">{field.label}</Label>
            {schema.id === 'gnss-com' && field.key === 'comPort' ? (
              <ComPortCombobox
                value={String(fieldValue)}
                ports={gnssComPorts}
                disabled={controlDisabled}
                onChange={(next) => onChange(field.key, next)}
              />
            ) : (
              renderFieldControl(field, fieldValue, controlDisabled, (next) => onChange(field.key, next))
            )}
            {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        );
      })}
    </div>
  );
};

export default DeviceSchemaForm;
