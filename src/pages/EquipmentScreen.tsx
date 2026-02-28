import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Cpu, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DeviceSchemaForm from '@/components/devices/DeviceSchemaForm';
import {
  createDefaultDeviceConfig,
  createDefaultEquipmentSettings,
  describeDeviceConfigErrors,
  loadDeviceSchemas,
  normalizeEquipmentSettings,
  readEquipmentSettings,
  validateDeviceConfig,
  writeEquipmentSettings,
  type DeviceConfig,
  type DeviceInstance,
  type EquipmentSettingsV3,
} from '@/features/devices';
import { toast } from '@/hooks/use-toast';
import { platform } from '@/platform';

const makeProfileId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `profile-${crypto.randomUUID()}`;
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const makeDeviceInstanceId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `device-${crypto.randomUUID()}`;
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const EquipmentScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const schemas = useMemo(() => loadDeviceSchemas(), []);

  const [settings, setSettings] = useState<EquipmentSettingsV3>(() => createDefaultEquipmentSettings(schemas));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationSummary, setValidationSummary] = useState<string[]>([]);
  const [focusFieldKey, setFocusFieldKey] = useState<string | null>(null);
  const [focusRequestVersion, setFocusRequestVersion] = useState(0);

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

  const selectedDeviceInstance = useMemo(() => {
    if (!selectedProfile) return null;

    const selectedInstanceId = settings.selected_device_instance_id;
    if (selectedInstanceId && selectedProfile.device_instance_ids.includes(selectedInstanceId)) {
      return settings.device_instances[selectedInstanceId] ?? null;
    }

    const fallbackInstanceId = selectedProfile.device_instance_ids[0];
    return fallbackInstanceId ? settings.device_instances[fallbackInstanceId] ?? null : null;
  }, [selectedProfile, settings.device_instances, settings.selected_device_instance_id]);

  const selectedSchema = useMemo(() => {
    if (!selectedDeviceInstance) return schemas[0] ?? null;
    return schemas.find((schema) => schema.id === selectedDeviceInstance.schema_id) ?? null;
  }, [schemas, selectedDeviceInstance]);

  const selectedConfig = useMemo<DeviceConfig>(() => {
    if (!selectedSchema || !selectedDeviceInstance) return {};
    return selectedDeviceInstance.config ?? createDefaultDeviceConfig(selectedSchema);
  }, [selectedSchema, selectedDeviceInstance]);

  const selectedProfileInstances = useMemo<DeviceInstance[]>(() => {
    if (!selectedProfile) return [];
    return selectedProfile.device_instance_ids
      .map((instanceId) => settings.device_instances[instanceId])
      .filter((instance): instance is DeviceInstance => Boolean(instance));
  }, [selectedProfile, settings.device_instances]);

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

  const clearValidationFeedback = () => {
    setFieldErrors({});
    setValidationSummary([]);
    setFocusFieldKey(null);
  };

  const selectProfile = (profileId: string) => {
    setSettings((prev) => {
      const profile = prev.profiles.find((item) => item.id === profileId);
      const nextInstanceId = profile?.device_instance_ids.includes(prev.selected_device_instance_id)
        ? prev.selected_device_instance_id
        : (profile?.device_instance_ids[0] ?? prev.selected_device_instance_id);

      return {
        ...prev,
        selected_profile_id: profileId,
        selected_device_instance_id: nextInstanceId,
      };
    });
    clearValidationFeedback();
  };

  const selectDeviceInstance = (instanceId: string) => {
    setSettings((prev) => ({ ...prev, selected_device_instance_id: instanceId }));
    clearValidationFeedback();
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

  const updateSelectedDeviceInstanceName = (name: string) => {
    if (!selectedDeviceInstance) return;
    const trimmed = name.trimStart();

    setSettings((prev) => ({
      ...prev,
      device_instances: {
        ...prev.device_instances,
        [selectedDeviceInstance.id]: {
          ...prev.device_instances[selectedDeviceInstance.id],
          name: trimmed,
        },
      },
    }));
  };

  const addDeviceInstance = (schemaId: string) => {
    const schema = schemas.find((item) => item.id === schemaId);
    if (!schema || !selectedProfile) return;

    setSettings((prev) => {
      const profile = prev.profiles.find((item) => item.id === prev.selected_profile_id);
      if (!profile) return prev;

      const sameSchemaCount = profile.device_instance_ids.filter((instanceId) => {
        const instance = prev.device_instances[instanceId];
        return instance?.schema_id === schemaId;
      }).length;

      const instanceId = makeDeviceInstanceId();
      const instanceName = sameSchemaCount > 0 ? `${schema.title} ${sameSchemaCount + 1}` : schema.title;

      return {
        ...prev,
        selected_device_instance_id: instanceId,
        profiles: prev.profiles.map((item) =>
          item.id === prev.selected_profile_id
            ? { ...item, device_instance_ids: [...item.device_instance_ids, instanceId] }
            : item,
        ),
        device_instances: {
          ...prev.device_instances,
          [instanceId]: {
            id: instanceId,
            schema_id: schema.id,
            name: instanceName,
            config: createDefaultDeviceConfig(schema),
          },
        },
      };
    });

    clearValidationFeedback();
  };

  const removeDeviceInstance = (instanceId: string) => {
    if (!selectedProfile) return;
    if (selectedProfile.device_instance_ids.length <= 1) {
      toast({ title: 'В профиле должно остаться хотя бы одно устройство' });
      return;
    }

    const instance = settings.device_instances[instanceId];
    if (!instance) return;

    if (!window.confirm(`Удалить устройство "${instance.name ?? instance.schema_id}"?`)) return;

    setSettings((prev) => {
      const profile = prev.profiles.find((item) => item.id === prev.selected_profile_id);
      if (!profile) return prev;

      const nextProfileInstanceIds = profile.device_instance_ids.filter((id) => id !== instanceId);
      const nextSelectedInstanceId =
        prev.selected_device_instance_id === instanceId
          ? (nextProfileInstanceIds[0] ?? prev.selected_device_instance_id)
          : prev.selected_device_instance_id;

      const nextInstances: Record<string, DeviceInstance> = {};
      for (const [id, value] of Object.entries(prev.device_instances)) {
        if (id === instanceId) continue;
        nextInstances[id] = value;
      }

      return {
        ...prev,
        selected_device_instance_id: nextSelectedInstanceId,
        profiles: prev.profiles.map((item) =>
          item.id === prev.selected_profile_id
            ? { ...item, device_instance_ids: nextProfileInstanceIds }
            : item,
        ),
        device_instances: nextInstances,
      };
    });

    clearValidationFeedback();
  };

  const addProfile = () => {
    const fallbackSchema = schemas[0];
    if (!fallbackSchema) {
      toast({ title: 'Нет доступных схем оборудования' });
      return;
    }

    setSettings((prev) => {
      const profileNumber = prev.profiles.length + 1;
      const nextProfileId = makeProfileId();
      const instanceId = makeDeviceInstanceId();

      const nextProfile = {
        id: nextProfileId,
        name: `Профиль ${profileNumber}`,
        device_instance_ids: [instanceId],
      };

      return {
        ...prev,
        selected_profile_id: nextProfile.id,
        selected_device_instance_id: instanceId,
        profiles: [...prev.profiles, nextProfile],
        device_instances: {
          ...prev.device_instances,
          [instanceId]: {
            id: instanceId,
            schema_id: fallbackSchema.id,
            name: fallbackSchema.title,
            config: createDefaultDeviceConfig(fallbackSchema),
          },
        },
      };
    });

    clearValidationFeedback();
  };

  const removeProfile = (profileId: string) => {
    if (settings.profiles.length <= 1) {
      toast({ title: 'Должен остаться хотя бы один профиль' });
      return;
    }
    if (!window.confirm('Удалить профиль оборудования?')) return;

    setSettings((prev) => {
      const removedProfile = prev.profiles.find((profile) => profile.id === profileId);
      const profiles = prev.profiles.filter((profile) => profile.id !== profileId);
      const nextProfile = profiles.find((profile) => profile.id === prev.selected_profile_id) ?? profiles[0] ?? null;

      const usedInstanceIds = new Set(profiles.flatMap((profile) => profile.device_instance_ids));
      const nextDeviceInstances: Record<string, DeviceInstance> = {};
      for (const [instanceId, instance] of Object.entries(prev.device_instances)) {
        if (!usedInstanceIds.has(instanceId)) continue;
        nextDeviceInstances[instanceId] = instance;
      }

      const nextSelectedInstanceId =
        nextProfile?.device_instance_ids.includes(prev.selected_device_instance_id)
          ? prev.selected_device_instance_id
          : (nextProfile?.device_instance_ids[0] ?? '');

      if (removedProfile) {
        for (const instanceId of removedProfile.device_instance_ids) {
          if (usedInstanceIds.has(instanceId)) continue;
          delete nextDeviceInstances[instanceId];
        }
      }

      return {
        ...prev,
        profiles,
        device_instances: nextDeviceInstances,
        selected_profile_id: nextProfile?.id ?? '',
        selected_device_instance_id: nextSelectedInstanceId,
      };
    });

    clearValidationFeedback();
  };

  const updateDeviceField = (key: string, value: string | number | boolean) => {
    if (!selectedSchema || !selectedDeviceInstance) return;

    setSettings((prev) => ({
      ...prev,
      device_instances: {
        ...prev.device_instances,
        [selectedDeviceInstance.id]: {
          ...prev.device_instances[selectedDeviceInstance.id],
          config: {
            ...(prev.device_instances[selectedDeviceInstance.id]?.config ?? createDefaultDeviceConfig(selectedSchema)),
            [key]: value,
          },
        },
      },
    }));

    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      setValidationSummary(describeDeviceConfigErrors(selectedSchema, rest).map((issue) => issue.summary));
      return rest;
    });

    setFocusFieldKey(null);
  };

  const resetSelected = () => {
    if (!selectedSchema || !selectedDeviceInstance) return;

    setSettings((prev) => ({
      ...prev,
      device_instances: {
        ...prev.device_instances,
        [selectedDeviceInstance.id]: {
          ...prev.device_instances[selectedDeviceInstance.id],
          config: createDefaultDeviceConfig(selectedSchema),
        },
      },
    }));

    clearValidationFeedback();
  };

  const handleSave = async () => {
    const nextSettings = normalizeEquipmentSettings(settings, schemas);
    const profile = nextSettings.profiles.find((item) => item.id === nextSettings.selected_profile_id) ?? null;
    if (!profile || profile.device_instance_ids.length === 0) {
      toast({ title: 'В профиле должно быть хотя бы одно оборудование' });
      return;
    }

    setValidationSummary([]);
    setFocusFieldKey(null);

    for (const instanceId of profile.device_instance_ids) {
      const instance = nextSettings.device_instances[instanceId];
      if (!instance) continue;
      const schema = schemas.find((item) => item.id === instance.schema_id);
      if (!schema) continue;

      const errors = validateDeviceConfig(schema, instance.config ?? {});
      if (Object.keys(errors).length > 0) {
        const issues = describeDeviceConfigErrors(schema, errors);
        const firstIssue = issues[0];
        const instanceName = instance.name?.trim() || schema.title;

        setSettings((prev) => ({ ...prev, selected_device_instance_id: instanceId }));
        setFieldErrors(errors);
        setValidationSummary(
          issues.map((issue) => `${instanceName}: ${issue.fieldLabel} — ${issue.message}`),
        );

        if (firstIssue) {
          setFocusFieldKey(firstIssue.fieldKey);
          setFocusRequestVersion((prev) => prev + 1);
        }

        toast({
          title: 'Проверьте значения',
          description: firstIssue
            ? `${instanceName}: ${firstIssue.fieldLabel} — ${firstIssue.message}`
            : `Есть ошибки валидации в настройках "${instanceName}".`,
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const saved = await writeEquipmentSettings(platform.settings, nextSettings, schemas);
      setSettings(saved.settings);
      clearValidationFeedback();
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
                      <div className="text-xs opacity-80">{profile.device_instance_ids.length} устройств(а)</div>
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
                    <div className="text-sm font-medium">Добавить устройство</div>
                    <div className="flex flex-wrap gap-2 rounded-md border border-border p-3">
                      {schemas.map((schema) => (
                        <Button
                          key={schema.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addDeviceInstance(schema.id)}
                          disabled={isLoading || isSaving}
                          className="gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {schema.title}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedProfileInstances.length > 0 ? (
                  <>
                    <div className="mt-6">
                      <div className="mb-2 text-sm font-medium">Устройства в профиле</div>
                      <div className="space-y-2">
                        {selectedProfileInstances.map((instance) => {
                          const schema = schemas.find((item) => item.id === instance.schema_id);
                          const isActive = selectedDeviceInstance?.id === instance.id;

                          return (
                            <div
                              key={instance.id}
                              className={`flex items-center gap-2 rounded-md border p-2 ${
                                isActive ? 'border-primary/60 bg-primary/5' : 'border-border'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => selectDeviceInstance(instance.id)}
                                className="flex-1 text-left"
                              >
                                <div className="text-sm font-medium">{instance.name?.trim() || schema?.title || instance.schema_id}</div>
                                <div className="text-xs text-muted-foreground">{schema?.title ?? instance.schema_id}</div>
                              </button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDeviceInstance(instance.id)}
                                disabled={selectedProfileInstances.length <= 1}
                                title="Удалить устройство"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {selectedSchema && selectedDeviceInstance ? (
                      <>
                        <div className="mt-5 mb-4 space-y-3">
                          <h2 className="text-base font-semibold">{selectedDeviceInstance.name?.trim() || selectedSchema.title}</h2>
                          <div className="grid gap-3 md:grid-cols-1 md:items-end">
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Имя устройства</label>
                              <Input
                                value={selectedDeviceInstance.name ?? ''}
                                disabled={isLoading || isSaving}
                                onChange={(event) => updateSelectedDeviceInstanceName(event.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {validationSummary.length > 0 ? (
                          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3" role="alert">
                            <p className="text-sm font-medium text-destructive">Исправьте ошибки в полях:</p>
                            <ul className="mt-2 space-y-1">
                              {validationSummary.slice(0, 5).map((message, index) => (
                                <li key={`${index}-${message}`} className="text-xs text-destructive">
                                  {message}
                                </li>
                              ))}
                            </ul>
                            {validationSummary.length > 5 ? (
                              <p className="mt-2 text-xs text-destructive">И ещё ошибок: {validationSummary.length - 5}</p>
                            ) : null}
                          </div>
                        ) : null}

                        <DeviceSchemaForm
                          schema={selectedSchema}
                          value={selectedConfig}
                          errors={fieldErrors}
                          focusFieldKey={focusFieldKey}
                          focusRequestVersion={focusRequestVersion}
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
