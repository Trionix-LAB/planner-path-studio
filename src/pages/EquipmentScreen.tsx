import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Cpu, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DeviceSchemaForm from '@/components/devices/DeviceSchemaForm';
import {
  createDefaultDeviceConfig,
  createDefaultEquipmentSettings,
  loadDeviceSchemas,
  normalizeEquipmentSettings,
  readEquipmentSettings,
  validateDeviceConfig,
  writeEquipmentSettings,
  type DeviceConfig,
  type EquipmentSettingsV1,
} from '@/features/devices';
import { toast } from '@/hooks/use-toast';
import { platform } from '@/platform';

const EquipmentScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const schemas = useMemo(() => loadDeviceSchemas(), []);

  const [settings, setSettings] = useState<EquipmentSettingsV1>(() => createDefaultEquipmentSettings(schemas));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const returnPath = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const value = query.get('return');
    if (!value || !value.startsWith('/')) return '/';
    return value;
  }, [location.search]);

  const selectedSchema = useMemo(
    () => schemas.find((schema) => schema.id === settings.selected_device_id) ?? schemas[0] ?? null,
    [schemas, settings.selected_device_id],
  );

  const selectedConfig = useMemo<DeviceConfig>(() => {
    if (!selectedSchema) return {};
    return settings.devices[selectedSchema.id] ?? createDefaultDeviceConfig(selectedSchema);
  }, [selectedSchema, settings.devices]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const stored = await readEquipmentSettings(platform.settings, schemas);
        setSettings(stored);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить оборудование';
        toast({ title: 'Ошибка загрузки', description: message });
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [schemas]);

  const selectDevice = (deviceId: string) => {
    setSettings((prev) => ({ ...prev, selected_device_id: deviceId }));
    setFieldErrors({});
  };

  const updateDeviceField = (key: string, value: string | number | boolean) => {
    if (!selectedSchema) return;
    setSettings((prev) => ({
      ...prev,
      devices: {
        ...prev.devices,
        [selectedSchema.id]: {
          ...(prev.devices[selectedSchema.id] ?? createDefaultDeviceConfig(selectedSchema)),
          [key]: value,
        },
      },
    }));

    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const resetSelected = () => {
    if (!selectedSchema) return;
    setSettings((prev) => ({
      ...prev,
      devices: {
        ...prev.devices,
        [selectedSchema.id]: createDefaultDeviceConfig(selectedSchema),
      },
    }));
    setFieldErrors({});
  };

  const handleSave = async () => {
    if (!selectedSchema) return;

    const nextSettings = normalizeEquipmentSettings(settings, schemas);
    const errors = validateDeviceConfig(selectedSchema, nextSettings.devices[selectedSchema.id] ?? {});
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      toast({ title: 'Проверьте значения', description: 'Есть ошибки валидации формы.' });
      return;
    }

    setIsSaving(true);
    try {
      const saved = await writeEquipmentSettings(platform.settings, nextSettings, schemas);
      setSettings(saved.settings);
      setFieldErrors({});
      toast({ title: 'Оборудование сохранено' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить настройки оборудования';
      toast({ title: 'Ошибка сохранения', description: message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(returnPath)} title="Назад">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Оборудование</h1>
              <p className="text-xs text-muted-foreground">Выбор устройства и настройка параметров подключения</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving || isLoading || !selectedSchema} className="gap-2">
            <Save className="h-4 w-4" />
            Сохранить
          </Button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[18rem,1fr]">
          <aside className="rounded-md border border-border bg-card p-3">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Оборудование</div>
            <div className="space-y-2">
              {schemas.map((schema) => {
                const isActive = selectedSchema?.id === schema.id;
                return (
                  <button
                    key={schema.id}
                    type="button"
                    onClick={() => selectDevice(schema.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:bg-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      <span className="text-sm font-medium">{schema.title}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="rounded-md border border-border bg-card p-4 md:p-5">
            {selectedSchema ? (
              <>
                <div className="mb-4">
                  <h2 className="text-base font-semibold">{selectedSchema.title}</h2>
                </div>

                <DeviceSchemaForm
                  schema={selectedSchema}
                  value={selectedConfig}
                  errors={fieldErrors}
                  disabled={isLoading || isSaving}
                  onChange={updateDeviceField}
                />

                <div className="mt-6 flex items-center gap-2">
                  <Button variant="outline" onClick={resetSelected} disabled={isLoading || isSaving}>
                    Сбросить к значениям по умолчанию
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(returnPath)} disabled={isSaving}>
                    Закрыть
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Нет доступных схем оборудования.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default EquipmentScreen;
