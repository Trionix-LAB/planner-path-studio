import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  APP_SETTINGS_SCHEMA_VERSION,
  normalizeAppSettings,
  type AppUiDefaults,
} from '@/features/settings';
import type { DiverUiConfig } from '@/features/mission';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: AppUiDefaults;
  missionDivers: DiverUiConfig[];
  onApply: (next: AppUiDefaults) => Promise<void> | void;
  onApplyDivers: (next: DiverUiConfig[]) => Promise<void> | void;
  onReset: () => Promise<void> | void;
  onResetDivers: () => Promise<void> | void;
  equipmentName?: string;
  equipmentEnabled?: boolean;
  equipmentStatusText?: string;
  onToggleEquipment?: (enabled: boolean) => Promise<void> | void;
}

const clampNumber = (value: string, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const SettingsDialog = ({
  open,
  onOpenChange,
  value,
  missionDivers,
  onApply,
  onApplyDivers,
  onReset,
  onResetDivers,
  equipmentName,
  equipmentEnabled = false,
  equipmentStatusText,
  onToggleEquipment,
}: SettingsDialogProps) => {
  const initial = useMemo(() => value, [value]);
  const [draft, setDraft] = useState<AppUiDefaults>(initial);
  const [diversDraft, setDiversDraft] = useState<DiverUiConfig[]>(missionDivers);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setDiversDraft(missionDivers);
    setIsDirty(false);
  }, [open, value, missionDivers]);

  const update = (next: AppUiDefaults) => {
    setDraft(next);
    setIsDirty(true);
  };

  const updateDivers = (next: DiverUiConfig[]) => {
    setDiversDraft(next);
    setIsDirty(true);
  };

  const updateDiver = (index: number, updates: Partial<DiverUiConfig>) => {
    updateDivers(
      diversDraft.map((diver, currentIndex) =>
        currentIndex === index ? { ...diver, ...updates } : diver,
      ),
    );
  };

  const handleAddDiver = () => {
    const index = diversDraft.length;
    updateDivers([
      ...diversDraft,
      {
        uid: crypto.randomUUID(),
        id: `${index + 1}`,
        title: `Маяк ${index + 1}`,
        marker_color: '#0ea5e9',
        marker_size_px: 32,
        track_color: '#a855f7',
      },
    ]);
  };

  const handleRemoveDiver = (index: number) => {
    if (diversDraft.length <= 1) return;
    updateDivers(diversDraft.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleApply = async () => {
    setIsSaving(true);
    try {
      const normalized = normalizeAppSettings({
        schema_version: APP_SETTINGS_SCHEMA_VERSION,
        defaults: draft,
      }).defaults;
      await onApply(normalized);
      await onApplyDivers(diversDraft);
      setIsDirty(false);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      await onReset();
      await onResetDivers();
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,56rem)] h-[80vh] max-h-[80vh] sm:max-w-2xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="measurements" className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="measurements">Измерения</TabsTrigger>
            <TabsTrigger value="coordinates">Координаты</TabsTrigger>
            <TabsTrigger value="styles">Стили</TabsTrigger>
            <TabsTrigger value="defaults">По умолчанию</TabsTrigger>
            <TabsTrigger value="connection">Агенты</TabsTrigger>
          </TabsList>

          <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-1">
            <TabsContent value="measurements" className="mt-0 space-y-4">
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={draft.layers.scale_bar}
                  onCheckedChange={(c) =>
                    update({
                      ...draft,
                      layers: { ...draft.layers, scale_bar: c as boolean },
                    })
                  }
                />
                <span>Линейка масштаба</span>
              </label>

              <label className="flex items-center gap-3">
                <Checkbox
                  checked={draft.layers.grid}
                  onCheckedChange={(c) =>
                    update({
                      ...draft,
                      layers: { ...draft.layers, grid: c as boolean },
                    })
                  }
                />
                <span>Сетка (метры)</span>
              </label>

              {draft.layers.grid && (
                <div className="ml-7 space-y-3">
                  <div className="space-y-1.5">
                    <Label>Вид сетки</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={draft.measurements.grid.color}
                        onChange={(e) =>
                          update({
                            ...draft,
                            measurements: {
                              ...draft.measurements,
                              grid: { ...draft.measurements.grid, color: e.target.value },
                            },
                          })
                        }
                        className="w-10 h-10 p-1"
                      />
                      <Input
                        className="w-20 font-mono"
                        inputMode="numeric"
                        value={String(draft.measurements.grid.width_px)}
                        onChange={(e) =>
                          update({
                            ...draft,
                            measurements: {
                              ...draft.measurements,
                              grid: {
                                ...draft.measurements.grid,
                                width_px: clampNumber(e.target.value, 1, 1, 8),
                              },
                            },
                          })
                        }
                      />
                      <Select
                        value={draft.measurements.grid.line_style}
                        onValueChange={(v) =>
                          update({
                            ...draft,
                            measurements: {
                              ...draft.measurements,
                              grid: {
                                ...draft.measurements.grid,
                                line_style: v as typeof draft.measurements.grid.line_style,
                              },
                            },
                          })
                        }
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solid">Сплошная</SelectItem>
                          <SelectItem value="dashed">Пунктир</SelectItem>
                          <SelectItem value="dotted">Точки</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-xs text-muted-foreground">цвет / толщина / тип линии</div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Длины отрезков</Label>
                <Select
                  value={draft.measurements.segment_lengths_mode}
                  onValueChange={(v) =>
                    update({
                      ...draft,
                      measurements: {
                        ...draft.measurements,
                        segment_lengths_mode: v as typeof draft.measurements.segment_lengths_mode,
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Выкл</SelectItem>
                    <SelectItem value="on-select">Только выбранный</SelectItem>
                    <SelectItem value="always">Всегда</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="coordinates" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Точность вывода (знаков после запятой)</Label>
                <Select
                  value={String(draft.coordinates.precision)}
                  onValueChange={(v) =>
                    update({
                      ...draft,
                      coordinates: { precision: clampNumber(v, 6, 0, 12) },
                    })
                  }
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="styles" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Трек</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={draft.styles.track.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, track: { ...draft.styles.track, color: e.target.value } },
                        })
                      }
                      className="w-10 h-10 p-1"
                    />
                    <Input
                      value={draft.styles.track.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, track: { ...draft.styles.track, color: e.target.value } },
                        })
                      }
                      className="font-mono"
                    />
                    <Input
                      className="w-20 font-mono"
                      inputMode="numeric"
                      value={String(draft.styles.track.width_px)}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: {
                            ...draft.styles,
                            track: { ...draft.styles.track, width_px: clampNumber(e.target.value, 3, 1, 20) },
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Маршрут</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={draft.styles.route.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, route: { ...draft.styles.route, color: e.target.value } },
                        })
                      }
                      className="w-10 h-10 p-1"
                    />
                    <Input
                      value={draft.styles.route.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, route: { ...draft.styles.route, color: e.target.value } },
                        })
                      }
                      className="font-mono"
                    />
                    <Input
                      className="w-20 font-mono"
                      inputMode="numeric"
                      value={String(draft.styles.route.width_px)}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: {
                            ...draft.styles,
                            route: { ...draft.styles.route, width_px: clampNumber(e.target.value, 3, 1, 20) },
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Зона (обводка/заливка)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={draft.styles.survey_area.stroke_color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: {
                            ...draft.styles,
                            survey_area: { ...draft.styles.survey_area, stroke_color: e.target.value },
                          },
                        })
                      }
                      className="w-10 h-10 p-1"
                    />
                    <Input
                      type="color"
                      value={draft.styles.survey_area.fill_color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: {
                            ...draft.styles,
                            survey_area: { ...draft.styles.survey_area, fill_color: e.target.value },
                          },
                        })
                      }
                      className="w-10 h-10 p-1"
                    />
                    <Input
                      className="w-20 font-mono"
                      inputMode="numeric"
                      value={String(draft.styles.survey_area.stroke_width_px)}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: {
                            ...draft.styles,
                            survey_area: {
                              ...draft.styles.survey_area,
                              stroke_width_px: clampNumber(e.target.value, 2, 1, 20),
                            },
                          },
                        })
                      }
                    />
                    <Input
                      className="w-20 font-mono"
                      inputMode="decimal"
                      value={String(draft.styles.survey_area.fill_opacity)}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: {
                            ...draft.styles,
                            survey_area: {
                              ...draft.styles.survey_area,
                              fill_opacity: clampNumber(e.target.value, 0.15, 0, 1),
                            },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">stroke width / fill opacity</div>
                </div>

                <div className="space-y-2">
                  <Label>Галсы</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={draft.styles.lane.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, lane: { ...draft.styles.lane, color: e.target.value } },
                        })
                      }
                      className="w-10 h-10 p-1"
                    />
                    <Input
                      value={draft.styles.lane.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, lane: { ...draft.styles.lane, color: e.target.value } },
                        })
                      }
                      className="font-mono"
                    />
                    <Input
                      className="w-20 font-mono"
                      inputMode="numeric"
                      value={String(draft.styles.lane.width_px)}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: {
                            ...draft.styles,
                            lane: { ...draft.styles.lane, width_px: clampNumber(e.target.value, 2, 1, 20) },
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Маркеры</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={draft.styles.marker.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, marker: { ...draft.styles.marker, color: e.target.value } },
                        })
                      }
                      className="w-10 h-10 p-1"
                    />
                    <Input
                      value={draft.styles.marker.color}
                      onChange={(e) =>
                        update({
                          ...draft,
                          styles: { ...draft.styles, marker: { ...draft.styles.marker, color: e.target.value } },
                        })
                      }
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="defaults" className="mt-0 space-y-4">
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={draft.follow_diver}
                  onCheckedChange={(c) => update({ ...draft, follow_diver: c as boolean })}
                />
                <span>Режим слежения за водолазом</span>
              </label>

              <label className="flex items-center gap-3">
                <Checkbox
                  checked={draft.interactions.center_on_object_select}
                  onCheckedChange={(c) =>
                    update({
                      ...draft,
                      interactions: { ...draft.interactions, center_on_object_select: c as boolean },
                    })
                  }
                />
                <span>Центрировать карту при выборе объекта в списке</span>
              </label>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-sm font-medium">Видимость слоев</div>

                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.layers.track}
                    onCheckedChange={(c) =>
                      update({ ...draft, layers: { ...draft.layers, track: c as boolean } })
                    }
                  />
                  <span>Трек</span>
                </label>

                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.layers.routes}
                    onCheckedChange={(c) =>
                      update({ ...draft, layers: { ...draft.layers, routes: c as boolean } })
                    }
                  />
                  <span>Маршруты/Галсы</span>
                </label>

                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={draft.layers.markers}
                    onCheckedChange={(c) =>
                      update({ ...draft, layers: { ...draft.layers, markers: c as boolean } })
                    }
                  />
                  <span>Маркеры</span>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="connection" className="mt-0 space-y-6">
              <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-foreground">Оборудование</div>
                    <div className="text-muted-foreground">{equipmentName ?? 'Не выбрано'}</div>
                  </div>
                  <Button
                    type="button"
                    variant={equipmentEnabled ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => onToggleEquipment?.(!equipmentEnabled)}
                    disabled={!onToggleEquipment}
                  >
                    {equipmentEnabled ? 'Выключить' : 'Включить'}
                  </Button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Статус: {equipmentStatusText ?? 'Выключено'}</div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Водолазы</div>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddDiver}>
                    Добавить маяк
                  </Button>
                </div>

                <div className="space-y-3">
                  {diversDraft.map((diver, index) => (
                    <div key={diver.uid} className="border border-border rounded-md p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">#{index + 1}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDiver(index)}
                          disabled={diversDraft.length <= 1}
                        >
                          Удалить
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>ID</Label>
                          <Input
                            value={diver.id}
                            onChange={(e) => updateDiver(index, { id: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Заголовок</Label>
                          <Input
                            value={diver.title}
                            onChange={(e) => updateDiver(index, { title: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label>Цвет маркера</Label>
                          <Input
                            type="color"
                            value={diver.marker_color}
                            onChange={(e) => updateDiver(index, { marker_color: e.target.value })}
                            className="w-12 h-9 p-1"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Размер маркера</Label>
                          <Input
                            inputMode="numeric"
                            value={String(diver.marker_size_px)}
                            onChange={(e) =>
                              updateDiver(index, {
                                marker_size_px: clampNumber(e.target.value, 32, 12, 64),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Цвет трека</Label>
                          <Input
                            type="color"
                            value={diver.track_color}
                            onChange={(e) => updateDiver(index, { track_color: e.target.value })}
                            className="w-12 h-9 p-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Закрыть
          </Button>
          <Button variant="secondary" onClick={handleReset} disabled={isSaving}>
            Сбросить по умолчанию
          </Button>
          <Button onClick={handleApply} disabled={isSaving || !isDirty}>
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
