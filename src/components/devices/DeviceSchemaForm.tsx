import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isEnabledByConditionSatisfied } from '@/features/devices/model/enabledBy';
import type { DeviceConfig, DeviceFieldSchema, DeviceSchema } from '@/features/devices';

interface DeviceSchemaFormProps {
  schema: DeviceSchema;
  value: DeviceConfig;
  errors: Record<string, string>;
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

const DeviceSchemaForm = ({ schema, value, errors, disabled = false, onChange }: DeviceSchemaFormProps) => {
  return (
    <div className="space-y-4">
      {schema.fields.map((field) => {
        const fieldValue = getFieldValue(field, value);
        const error = errors[field.key];
        const fieldEnabled = isFieldEnabled(field, value);
        const controlDisabled = disabled || !fieldEnabled;

        if (field.inputForm === 'boolean') {
          return (
            <div key={field.key} className="flex items-center justify-between gap-3">
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
          <div key={field.key} className="space-y-2">
            <Label className="text-sm font-medium">{field.label}</Label>
            {renderFieldControl(field, fieldValue, controlDisabled, (next) => onChange(field.key, next))}
            {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        );
      })}
    </div>
  );
};

export default DeviceSchemaForm;
