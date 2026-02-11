import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Cpu, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
  type EquipmentSettingsV2,
} from '@/features/devices';
import { toast } from '@/hooks/use-toast';
import { platform } from '@/platform';

const makeProfileId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `profile-${crypto.randomUUID()}`;
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const EquipmentScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const schemas = useMemo(() => loadDeviceSchemas(), []);

  const [settings, setSettings] = useState<EquipmentSettingsV2>(() => createDefaultEquipmentSettings(schemas));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const returnPath = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const value = query.get('return');
    if (!value || !value.startsWith('/')) return '/';
    return value;
  }, [location.search]);

  const selectedProfile = useMemo(
    () => settings.profiles.find((profile) => profile.id === settings.selected_profile_id) ?? settings.profiles[0] ?? null,
    [settings.profiles, settings.selected_profile_id],
  );

  const selectedSchema = useMemo(() => {
    if (!selectedProfile) return schemas[0] ?? null;
    if (selectedProfile.device_ids.includes(settings.selected_device_id)) {
      return schemas.find((schema) => schema.id === settings.selected_device_id) ?? null;
    }
    const fallbackId = selectedProfile.device_ids[0];
    if (!fallbackId) return null;
    return schemas.find((schema) => schema.id === fallbackId) ?? null;
  }, [schemas, selectedProfile, settings.selected_device_id]);

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

  const selectProfile = (profileId: string) => {
    setSettings((prev) => {
      const profile = prev.profiles.find((item) => item.id === profileId);
      const nextDeviceId = profile?.device_ids.includes(prev.selected_device_id)
        ? prev.selected_device_id
        : (profile?.device_ids[0] ?? prev.selected_device_id);
      return {
        ...prev,
        selected_profile_id: profileId,
        selected_device_id: nextDeviceId,
      };
    });
    setFieldErrors({});
  };

  const selectDevice = (deviceId: string) => {
    setSettings((prev) => ({ ...prev, selected_device_id: deviceId }));
    setFieldErrors({});
  };

  const updateSelectedProfileName = (name: string) => {
    const trimmed = name.trimStart();
    setSettings((prev) => ({
      ...prev,
      profiles: prev.profiles.map((profile) =>
        profile.id === prev.selected_profile_id ? { ...profile, name: trimmed } : profile,
      ),
    }));
  };

  const toggleDeviceInProfile = (deviceId: string, checked: boolean) => {
    if (
      !checked &&
      selectedProfile &&
      selectedProfile.device_ids.includes(deviceId) &&
      selectedProfile.device_ids.length <= 1
    ) {
      toast({ title: 'Нужен минимум один тип оборудования в профиле' });
      return;
    }

    setSettings((prev) => {
      const profiles = prev.profiles.map((profile) => {
        if (profile.id !== prev.selected_profile_id) return profile;

        const hasDevice = profile.device_ids.includes(deviceId);
        if (checked && !hasDevice) {
          return { ...profile, device_ids: [...profile.device_ids, deviceId] };
        }
        if (!checked && hasDevice) {
          return { ...profile, device_ids: profile.device_ids.filter((id) => id !== deviceId) };
        }
        return profile;
      });

      const activeProfile = profiles.find((profile) => profile.id === prev.selected_profile_id) ?? null;
      const nextSelectedDeviceId =
        activeProfile?.device_ids.includes(prev.selected_device_id)
          ? prev.selected_device_id
          : (activeProfile?.device_ids[0] ?? prev.selected_device_id);

      return {
        ...prev,
        profiles,
        selected_device_id: nextSelectedDeviceId,
      };
    });
    setFieldErrors({});
  };

  const addProfile = () => {
    const fallbackDeviceId = schemas[0]?.id;
    if (!fallbackDeviceId) {
      toast({ title: 'Нет доступных схем оборудования' });
      return;
    }

    setSettings((prev) => {
      const profileNumber = prev.profiles.length + 1;
      const nextProfile = {
        id: makeProfileId(),
        name: `Профиль ${profileNumber}`,
        device_ids: [fallbackDeviceId],
      };
      return {
        ...prev,
        profiles: [...prev.profiles, nextProfile],
        selected_profile_id: nextProfile.id,
        selected_device_id: fallbackDeviceId,
      };
    });
    setFieldErrors({});
  };

  const removeProfile = (profileId: string) => {
    if (settings.profiles.length <= 1) {
      toast({ title: 'Должен остаться хотя бы один профиль' });
      return;
    }
    if (!window.confirm('Удалить профиль оборудования?')) return;

    setSettings((prev) => {
      const profiles = prev.profiles.filter((profile) => profile.id !== profileId);
      const nextProfile = profiles.find((profile) => profile.id === prev.selected_profile_id) ?? profiles[0] ?? null;
      return {
        ...prev,
        profiles,
        selected_profile_id: nextProfile?.id ?? '',
        selected_device_id: nextProfile?.device_ids[0] ?? schemas[0]?.id ?? '',
      };
    });
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
    const nextSettings = normalizeEquipmentSettings(settings, schemas);
    const profile = nextSettings.profiles.find((item) => item.id === nextSettings.selected_profile_id) ?? null;
    if (!profile || profile.device_ids.length === 0) {
      toast({ title: 'В профиле должно быть хотя бы одно оборудование' });
      return;
    }

    for (const deviceId of profile.device_ids) {
      const schema = schemas.find((item) => item.id === deviceId);
      if (!schema) continue;
      const errors = validateDeviceConfig(schema, nextSettings.devices[deviceId] ?? {});
      if (Object.keys(errors).length > 0) {
        setSettings((prev) => ({ ...prev, selected_device_id: deviceId }));
        setFieldErrors(errors);
        toast({
          title: 'Проверьте значения',
          description: `Есть ошибки валидации в настройках "${schema.title}".`,
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const saved = await writeEquipmentSettings(platform.settings, nextSettings, schemas);
      setSettings(saved.settings);
      setFieldErrors({});
      toast({ title: 'Профили оборудования сохранены' });
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
              <p className="text-xs text-muted-foreground">Профили оборудования и параметры подключения устройств</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving || isLoading || !selectedProfile} className="gap-2">
            <Save className="h-4 w-4" />
            Сохранить
          </Button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[18rem,1fr]">
          <aside className="rounded-md border border-border bg-card p-3">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Профили</div>
            <div className="space-y-2">
              {settings.profiles.map((profile) => {
                const isActive = selectedProfile?.id === profile.id;
                return (
                  <div key={profile.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectProfile(profile.id)}
                      className={`flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-primary/60 bg-primary/10 text-primary'
                          : 'border-border bg-background text-foreground hover:bg-secondary'
                      }`}
                    >
                      <div className="text-sm font-medium">{profile.name || 'Без названия'}</div>
                      <div className="text-xs opacity-80">{profile.device_ids.length} устройств(а)</div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProfile(profile.id)}
                      disabled={settings.profiles.length <= 1}
                      title="Удалить профиль"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <Button type="button" variant="outline" className="mt-3 w-full gap-2" onClick={addProfile}>
              <Plus className="h-4 w-4" />
              Добавить профиль
            </Button>
          </aside>

          <section className="rounded-md border border-border bg-card p-4 md:p-5">
            {selectedProfile ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Название профиля</label>
                    <Input
                      value={selectedProfile.name}
                      disabled={isLoading || isSaving}
                      onChange={(event) => updateSelectedProfileName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Оборудование в профиле</div>
                    <div className="space-y-2 rounded-md border border-border p-3">
                      {schemas.map((schema) => {
                        const checked = selectedProfile.device_ids.includes(schema.id);
                        return (
                          <label key={schema.id} className="flex items-center justify-between gap-3">
                            <span className="text-sm">{schema.title}</span>
                            <Checkbox
                              checked={checked}
                              disabled={isLoading || isSaving}
                              onCheckedChange={(next) => toggleDeviceInProfile(schema.id, Boolean(next))}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {selectedProfile.device_ids.length > 0 ? (
                  <>
                    <div className="mt-6">
                      <div className="mb-2 text-sm font-medium">Настройка устройства</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedProfile.device_ids.map((deviceId) => {
                          const schema = schemas.find((item) => item.id === deviceId);
                          if (!schema) return null;
                          const isActive = selectedSchema?.id === schema.id;
                          return (
                            <Button
                              key={schema.id}
                              type="button"
                              variant={isActive ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => selectDevice(schema.id)}
                              className="gap-2"
                            >
                              {isActive ? <Check className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                              {schema.title}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedSchema ? (
                      <>
                        <div className="mt-5 mb-4">
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
                            Сбросить устройство к значениям по умолчанию
                          </Button>
                          <Button variant="ghost" onClick={() => navigate(returnPath)} disabled={isSaving}>
                            Закрыть
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-6 text-sm text-muted-foreground">
                        Выберите устройство для редактирования параметров.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-6 text-sm text-muted-foreground">Добавьте хотя бы одно устройство в профиль.</div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Нет доступных профилей оборудования.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default EquipmentScreen;
