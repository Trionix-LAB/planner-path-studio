Формат миссии (MVP)

Документ описывает структуру папки миссии, формат `mission.json`, внутренние форматы треков и объектов планирования.

## 1. Структура папки миссии

Рекомендуемая структура:

- `mission.json` - метаданные миссии, список треков, ссылки на файлы объектов, UI-настройки.
- `tracks/` - треки (CSV).
- `routes/` - маршруты, измерения, зоны обследования и галсы (GeoJSON).
- `markers/` - точки-маркеры (GeoJSON).
- `overlays/` - импортированные пользовательские наложения:
  - `overlays/rasters/` - растры (`*.tif.b64`, `*.tfw`);
  - `overlays/vectors/` - CAD-исходники (`*.dxf`, `*.dwg.b64`) и кэш распарсенной CAD-геометрии (`*.vector-cache.json`).
- `exports/` - опционально: результаты экспорта (GPX/KML/CSV).
  - Для CSV-экспорта пользователь может выбрать CRS (`WGS84`/`СК-42`/`ГСК-2011`) и формат представления координат (`ДД`/`ГМ`/`ГМС`); это влияет только на файлы в `exports/`.
- `logs/` - опционально: файлы логов/телеметрии.
  - `logs/equipment/` - сырые пакеты оборудования per-device (`<device-instance-id>.log`).

### 1.1 Логи оборудования (`logs/equipment/*.log`)

- Один файл MUST соответствовать одному `DeviceInstance`: `logs/equipment/<device-instance-id>.log`.
- Файл создается лениво: только при первой записи raw-пакета.
- Логирование raw-пакетов оборудования MUST работать независимо от статуса записи трека.
- Логирование оборудования MUST быть always-on (пользовательского выключателя логирования нет).
- Если в активном профиле несколько `DeviceInstance` одного `schema_id`, MUST вестись отдельный файл для каждого экземпляра.
- Для источников raw-данных, где доступен только `schema_id` (без `instance_id`), один входной raw-поток дублируется в каждый `.log` соответствующих экземпляров этого `schema_id`.
- Каждая строка лога:
  - начинается с UTC timestamp в ISO-8601 с миллисекундами и `Z`;
  - после пробела содержит JSON-объект с минимумом полей:
    - `profile_name`: string;
    - `raw`: string (полная сырая строка пакета до парсинга).
- Рекомендуемый пример строки:
  - `2026-03-06T14:23:01.123Z {"profile_name":"Workboat A","raw":"$AZMLOC,0,59.93,30.33,..."}`

## 2. `mission.json`

### 2.1 Общие правила

- Формат: JSON, кодировка UTF-8.
- Даты/время: ISO-8601 UTC с суффиксом `Z` (например `2026-02-03T12:34:56.789Z`).
- Версия схемы: `schema_version` (number). Для MVP = `1`.

### 2.2 Минимальная схема (MVP)

- `schema_version`: number (например `1`)
- `mission_id`: string (UUID)
- `name`: string
- `created_at`: string (ISO-8601 UTC, `Z`)
- `updated_at`: string (ISO-8601 UTC, `Z`)
- `active_track_id`: string | null (deprecated, сохраняется для обратной совместимости; при наличии `active_tracks` игнорируется)
- `active_tracks`: object | null (опционально; ключ = `agent_uid`, значение = `track_id` активного трека этого агента; `null` или отсутствие = ни один агент не записывает)
- `tracks`: array объектов:
  - `id`: string (UUID)
  - `agent_id`: string | null (uid агента, которому принадлежит трек; `null` для треков, созданных до введения мультиагентной записи)
  - `color`: string | undefined (исторический цвет конкретного трека; при отсутствии используется fallback стилей)
  - `file`: string (относительный путь, например `tracks/agent1-track-0001.csv`)
  - `started_at`: string (системное время начала записи, UTC, `Z`)
  - `ended_at`: string | null (системное время окончания записи, UTC, `Z`)
  - `note`: string | null
- `files`: object:
  - `routes`: string (например `routes/routes.geojson`)
  - `markers`: string (например `markers/markers.geojson`)
- `ui` (опционально, но рекомендуется сохранять):
  - `follow_diver`: boolean
  - `hidden_track_ids`: string[] (список скрытых треков; по умолчанию пустой)
  - `raster_overlays`: array (опционально)
    - `id`: string
    - `name`: string
    - `file`: string (относительный путь к файлу данных слоя, например `overlays/rasters/<id>.tif.b64`)
    - `tfw_file`: string | undefined (опционально, для источника `tif+tfw`; относительный путь, например `overlays/rasters/<id>.tfw`)
    - `bounds`: `{ north, south, east, west }`
    - `opacity`: number (`0..1`)
    - `visible`: boolean
    - `z_index`: number
    - `source`: `'geotiff' | 'tif+tfw'`
  - `vector_overlays`: array (опционально)
    - `id`: string
    - `name`: string
    - `file`: string (относительный путь к файлу слоя; `DXF` — как текстовый `.dxf`, `DWG` — в бинарном содержимом, сохраненном как base64-текст `.dwg.b64`; каталог `overlays/vectors/`)
    - `cache_file`: string | undefined (опционально, относительный путь к файлу кэша распарсенной геометрии, например `overlays/vectors/<id>.vector-cache.json`)
    - `color`: string | undefined (опционально, пользовательский цвет отображения сущностей векторного слоя: линии/точки/фигуры, например `#0f766e`)
    - `type`: `'dxf' | 'dwg'`
    - `file_encoding` (опционально): `'utf8' | 'base64'` (`base64` для бинарного `DWG`)
    - `utm_zone`: number (`1..60`)
    - `utm_hemisphere`: `'N' | 'S'`
    - `opacity`: number (`0..1`)
    - `visible`: boolean
    - `z_index`: number
    - Примечание: входной импорт поддерживает `.dxf` и `.dwg` без конвертации между форматами.
    - Примечание: `DXF` парсится нативно встроенным модулем `src/features/map/dxfOverlay/parseDxf.ts`; `DWG` — нативно через `@mlightcad/libredwg-web` (`src/features/map/dwgOverlay/parseDwg.ts`).
  - `layers`: object (видимость слоев: `track`, `routes`, `markers`, `base_station`, `grid`, `scale_bar`, `basemap`)
  - `left_panel_sections` (опционально): object (состояние секций левой панели)
    - `layers`: boolean
    - `agents`: boolean
    - `rasters`: boolean
    - `vectors`: boolean
    - `objects`: boolean
  - `right_panel_sections` (опционально): object (состояние секций правой панели)
    - `hud`: boolean
    - `status`: boolean
    - `properties`: boolean
  - `panel_layout` (опционально): object (layout боковых панелей карты)
    - `left_width_px`: number (ширина левой панели в пикселях)
    - `right_width_px`: number (ширина правой панели в пикселях)
    - `left_collapsed`: boolean (свернута ли левая панель)
    - `right_collapsed`: boolean (свернута ли правая панель)
  - `coordinates` (опционально): object
    - `precision`: number (кол-во знаков после запятой для lat/lon; default 6)
  - `map_view`: object:
    - `center_lat`: number
    - `center_lon`: number
    - `zoom`: number
  - `measurements` (опционально): object (настройки измерений/подписей)
    - `grid` (опционально): object
      - `mode`: string (`auto` | `manual`)
      - `step_m`: number (только для `manual`)
      - `color`: string (HEX, например `#64748b`)
      - `width_px`: number (толщина линии)
      - `line_style`: string (`solid` | `dashed` | `dotted`)
    - `segment_lengths_mode`: string (`off` | `on-select` | `always`)
  - `styles` (опционально): object (переопределения внешнего вида объектов в рамках миссии)
    - `track`: object (например: `{"color":"#00A3FF","width_px":3,"dash":"none"}`)
    - `route`: object
    - `survey_area`: object (например: `{"stroke_color":"#FF6A00","fill_color":"#FF6A00","fill_opacity":0.15}`)
    - `lane`: object
    - `marker`: object (например: `{"icon":"pin","label_mode":"hover"}`)
    - `base_station`: object (например: `{"icon":"base-station","size_px":30}`)
  - `navigation_sources` (опционально): object
    - `agents`: object (ключ = `agent_uid`, значение = `source_id`)
    - `base_station`: string | null (идентификатор источника геоданных для базовой станции)
  - `base_station` (опционально): object
    - `lat`: number
    - `lon`: number
    - `heading_deg`: number | null
    - `updated_at`: string (ISO-8601 UTC, `Z`)
    - `source_id`: string | null
  - `rwlt_buoys` (опционально): array настроек RWLT-буёв (персист пользовательских настроек буёв, без телеметрической геометрии)
    - `buoy_id`: number (`1..4`)
    - `name`: string (пользовательское имя буя)
    - `marker_color`: string (HEX `#RRGGBB`)
    - `marker_size_px`: number (`1..256`)

Примечания:

- `started_at/ended_at` задаются по системному времени приложения (события start/stop/pause), и не обязаны совпадать со временем первой/последней точки в CSV трека.
- В миссии для каждого агента может быть не более одного «активного» трека (в который пишутся точки). Маппинг `agent_uid -> track_id` хранится в `active_tracks`. Несколько агентов могут записывать треки параллельно.
- Поле `active_track_id` сохраняется для обратной совместимости. При чтении: если `active_tracks` отсутствует, а `active_track_id` задан, он интерпретируется как активный трек первого (primary) агента.
- Поле `agent_id` в треке указывает, какому агенту принадлежит трек. Треки с `agent_id = null` считаются принадлежащими primary-агенту (первому в массиве `ui.divers`).
- Поле `color` в треке фиксирует исторический цвет конкретной сессии записи и не должно массово перекрашиваться при изменении глобального/агентского цвета.
- Поля `ui.navigation_sources` и `ui.base_station` считаются опциональными для совместимости с уже сохраненными миссиями MVP.
- `ui.rwlt_buoys` хранит только пользовательские настройки отображения RWLT-буёв (`name`, `marker_color`, `marker_size_px`); координаты буёв в миссию не сериализуются и обновляются только из live-телеметрии `$PRWLA`.
- `ui.raster_overlays` хранит только метаданные слоя; payload растра хранится отдельным файлом в папке миссии.
- Для импортированных растров источника `tif+tfw` рядом с копией TIFF в папке миссии сохраняется и копия исходного `TFW` (`ui.raster_overlays[].tfw_file`).
- `ui.vector_overlays` хранит метаданные CAD-слоя и пути к файлам в папке миссии:
  - `file` — исходный импортированный CAD-файл (`.dxf` или `.dwg.b64`),
  - `cache_file` — кэш распарсенной WGS84-геометрии (если создан).
- Каталоги хранения MUST быть разделены:
  - растры в `overlays/rasters/`,
  - векторы и их cache в `overlays/vectors/`.
- При открытии миссии для `vector_overlays` применяется `cache-first`:
  - сначала читается `cache_file`,
  - при отсутствии/несовпадении метаданных/ошибке чтения выполняется повторный нативный парсинг `file` и перезапись `cache_file`.
- При успешном чтении `cache_file` отрисовка CAD-слоя выполняется напрямую из кэша без повторного парсинга исходного `DWG`/`DXF`, что снижает задержки при повторном открытии миссии и уменьшает нагрузку на UI.
- Для обратной совместимости, если `cache_file` отсутствует, приложение может вычислить путь к кэшу рядом с `file` (в том же каталоге), что позволяет сразу использовать уже существующий кэш в старых миссиях.
- `ui.left_panel_sections` хранит состояние свернутых/развернутых секций левой панели и используется как в mission, так и в draft.
- `ui.right_panel_sections` хранит состояние свернутых/развернутых секций правой панели (`HUD`, `Статус`, `Свойства объекта`) и используется как в mission, так и в draft.
- `ui.panel_layout` хранит состояние layout боковых панелей (ширина и `collapsed` для left/right) и используется как в mission, так и в draft.

### 2.2.1 Формат `vector-cache` файла

Файл `ui.vector_overlays[].cache_file` содержит JSON с результатом нативного парсинга CAD-геометрии:

- `schema_version`: number (текущая версия формата кэша)
- `source_file`: string (ожидаемое значение `ui.vector_overlays[].file`)
- `source_type`: `'dxf' | 'dwg'`
- `source_encoding`: `'utf8' | 'base64'`
- `utm_zone`: number (`1..60`)
- `utm_hemisphere`: `'N' | 'S'`
- `bounds`: `{ north, south, east, west }` (WGS84)
- `features`: массив геометрий в WGS84 (line/point), пригодный для прямой отрисовки на карте без повторного парсинга исходного CAD-файла.

### 2.3 Пример `mission.json`

```json
{
  "schema_version": 1,
  "mission_id": "2feaaeb6-4de8-4a5b-9d2f-0c56b8b034d0",
  "name": "Dive 1",
  "created_at": "2026-02-03T10:00:00.000Z",
  "updated_at": "2026-02-03T10:05:00.000Z",
  "active_track_id": null,
  "active_tracks": {
    "agent-uid-1": "c4caa66d-c9b2-4cc3-a23a-5f9efb405a1c"
  },
  "tracks": [
    {
      "id": "c4caa66d-c9b2-4cc3-a23a-5f9efb405a1c",
      "agent_id": "agent-uid-1",
      "file": "tracks/agent-uid-1-track-0001.csv",
      "started_at": "2026-02-03T10:00:02.000Z",
      "ended_at": null,
      "note": null
    },
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "agent_id": "agent-uid-2",
      "file": "tracks/agent-uid-2-track-0001.csv",
      "started_at": "2026-02-03T10:01:00.000Z",
      "ended_at": "2026-02-03T10:03:30.000Z",
      "note": null
    }
  ],
  "files": {
    "routes": "routes/routes.geojson",
    "markers": "markers/markers.geojson"
  },
  "ui": {
    "follow_diver": true,
    "panel_layout": {
      "left_width_px": 224,
      "right_width_px": 256,
      "left_collapsed": false,
      "right_collapsed": false
    },
    "layers": {
      "track": true,
      "routes": true,
      "markers": true,
      "base_station": true,
      "grid": false,
      "scale_bar": true,
      "basemap": true
    },
    "coordinates": { "precision": 6 },
    "measurements": {
      "grid": { "mode": "auto", "color": "#64748b", "width_px": 1, "line_style": "dashed" },
      "segment_lengths_mode": "on-select"
    },
    "map_view": { "center_lat": 59.93863, "center_lon": 30.31413, "zoom": 14 },
    "navigation_sources": {
      "agents": {
        "agent-1": "zima2r:beacon:1"
      },
      "base_station": "gnss-udp:main"
    },
    "base_station": {
      "lat": 59.93542,
      "lon": 30.33218,
      "heading_deg": 271.2,
      "updated_at": "2026-02-03T10:04:58.000Z",
      "source_id": "gnss-udp:main"
    }
  }
}
```

## 3. Треки: `tracks/*.csv`

### 3.1 Общие правила

- Кодировка: UTF-8.
- Разделитель: запятая `,` (RFC4180-совместимый CSV).
- Десятичный разделитель в числах: точка `.`.
- Первая строка: заголовки колонок.

### 3.2 Один файл = один трек

- Трек = "сессия записи" (например: до/после паузы, отдельные заплывы).
- Пауза/завершение закрывают текущий трек и ставят `ended_at` в `mission.json`.
- Потеря связи не закрывает трек; внутри трека увеличивается `segment_id`.

Рекомендуемое имя файла: `tracks/<agent_uid>-track-0001.csv`, `tracks/<agent_uid>-track-0002.csv`, ...

Нумерация ведётся per-agent (у каждого агента свой счётчик). Для треков, созданных до введения мультиагентной записи (без `agent_id`), допускается формат `tracks/track-0001.csv`.

### 3.3 Колонки

Обязательные:

- `timestamp`: ISO-8601 UTC с суффиксом `Z`
- `lat`: number (WGS84, десятичные градусы)
- `lon`: number (WGS84, десятичные градусы)
- `segment_id`: integer (начинается с 1; увеличивается при каждом разрыве, например "соединение потеряно -> соединение восстановлено")

Опциональные (если есть):

- `depth_m`: number
- `sog_mps`: number
- `cog_deg`: number (0..360)

Политика заполнения `sog_mps/cog_deg` соответствует runtime-контракту `R-066` (`spec/spec.md`):
- для `Zima2R` базовой станции используются значения `AZMLOC`;
- для GNSS и `AZMREM` значения формируются как over-ground (`SOG/COG`) по последовательным координатам/времени.

Пример строки заголовков:

`timestamp,lat,lon,segment_id,depth_m,sog_mps,cog_deg`

## 4. Объекты планирования и метки: GeoJSON

### 4.1 Общие правила

- Формат: GeoJSON `FeatureCollection`, кодировка UTF-8.
- CRS: WGS84.
- Порядок координат: `[lon, lat]` (стандарт GeoJSON).
- Каждый объект хранится как `Feature`.
- Даже при вводе координат пользователем в альтернативной CRS (например, СК-42/ГСК-2011), в файлы миссии сохраняются только координаты, уже конвертированные в WGS84.

Общие свойства для всех `Feature` (минимум):

- `id`: string (UUID)
- `kind`: string
- `name`: string
- `note`: string | null
- `created_at`: string (ISO-8601 UTC, `Z`)
- `updated_at`: string (ISO-8601 UTC, `Z`)

### 4.2 `routes/routes.geojson`

Содержит `FeatureCollection` с объектами следующих видов:

1) `kind=route` (ручной маршрут)

- `geometry`: `LineString`
- `properties` (опционально): `style` (например `{"color":"#FF6A00","width_px":3}`)

2) `kind=survey_area` (зона обследования)

- `geometry`: `Polygon`
- `properties` (минимум):
  - `lane_angle_deg`: number (0 или 90)
  - `lane_width_m`: number
- `properties.style` (опционально):
  - `color`: string (`#RRGGBB`) — цвет зоны;
  - `lane_color`: string (`#RRGGBB`) — цвет линий галсов для этой зоны.

Правило для `lane_angle_deg` (MVP):

- `0` = вдоль главной оси полигона, `90` = поперек.
- Главная ось полигона определяется как направление наибольшей протяженности (через ориентированный ограничивающий прямоугольник/OBB или эквивалентный простой подход для MVP).

3) `kind=lane` (сгенерированный галс)

- `geometry`: `LineString`
- `properties` (минимум):
  - `parent_area_id`: string (UUID зоны обследования)
  - `lane_index`: integer (1..N)

4) `kind=measure` (измерение расстояния)

- `geometry`: `LineString` из двух точек.
- `properties`:
  - `style` (опционально, например `{"color":"#f97316"}`)
  - `note` используется как пользовательское описание измерения.

### 4.3 `markers/markers.geojson`

Содержит `FeatureCollection` с объектами:

- `kind=marker`
- `geometry`: `Point`
- `properties` (минимум):
  - `description`: string (многострочный текст)

## 5. Версионирование и совместимость

- `schema_version` хранится в `mission.json`.
- Если приложение открывает миссию с более новой `schema_version`, нужно показать понятную ошибку ("требуется обновление приложения") и не пытаться частично интерпретировать данные.

## 6. Защита от параллельного открытия (lock)

Рекомендуемый механизм:

- при открытии миссии создается файл `mission.lock`
- при закрытии миссии файл удаляется
- при обнаружении `mission.lock` при открытии: предупреждение пользователю и отказ от открытия в режиме записи (или предложение открыть read-only, если это требуется)

## 7. Addendum (T-66, 2026-02-28): Durability and Recovery

### 7.1 Дополнительные служебные файлы миссии

- mission.json.bak — резервная копия метаданных миссии, поддерживается рядом с mission.json.
- logs/wal/current.wal — write-ahead snapshot для ускоренного/устойчивого автосохранения.

### 7.2 Порядок записи (checkpoint protocol)

- Запись состояния миссии выполняется в 2 фазы:
  1. staging снапшота в logs/wal/current.wal с flush;
  2. checkpoint в основное хранилище (mission.json.bak -> mission.json -> GeoJSON/CSV), после чего WAL очищается.
- mission.updated_at MUST обновляться при WAL-stage/checkpoint, чтобы можно было выбрать наиболее свежее состояние при recovery.

### 7.3 Порядок чтения (open/recovery)

- При открытии миссии приложение MUST поддерживать fallback:
  - сначала mission.json,
  - затем mission.json.bak, если основной файл отсутствует/пуст/поврежден.
- Если доступен WAL-снапшот, SHOULD выбираться более новое состояние между checkpoint и WAL по mission.updated_at.
- При выборе WAL-состояния приложение SHOULD выполнить self-heal checkpoint (best effort) и восстановить основные файлы миссии.

### 7.4 Lock и некорректное завершение

- mission.lock остается механизмом защиты от параллельной записи.
- Для stale-lock MUST поддерживаться recover-path при открытии, чтобы миссия не оставалась перманентно заблокированной после аварийного завершения.
