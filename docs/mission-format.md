Формат миссии (MVP)

Документ описывает структуру папки миссии, формат `mission.json`, внутренние форматы треков и объектов планирования.

## 1. Структура папки миссии

Рекомендуемая структура:

- `mission.json` - метаданные миссии, список треков, ссылки на файлы объектов, UI-настройки.
- `tracks/` - треки (CSV).
- `routes/` - маршруты, зоны обследования и галсы (GeoJSON).
- `markers/` - точки-маркеры (GeoJSON).
- `exports/` - опционально: результаты экспорта (GPX/KML/CSV).
- `logs/` - опционально: файлы логов/телеметрии, если принято хранить вместе с миссией.

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
- `active_track_id`: string | null
- `tracks`: array объектов:
  - `id`: string (UUID)
  - `file`: string (относительный путь, например `tracks/track-0001.csv`)
  - `started_at`: string (системное время начала записи, UTC, `Z`)
  - `ended_at`: string | null (системное время окончания записи, UTC, `Z`)
  - `note`: string | null
- `files`: object:
  - `routes`: string (например `routes/routes.geojson`)
  - `markers`: string (например `markers/markers.geojson`)
- `ui` (опционально, но рекомендуется сохранять):
  - `follow_diver`: boolean
  - `layers`: object (видимость слоев: `track`, `routes`, `markers`, `grid`, `scale_bar`)
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

Примечания:

- `started_at/ended_at` задаются по системному времени приложения (события start/stop/pause), и не обязаны совпадать со временем первой/последней точки в CSV трека.
- В миссии в каждый момент времени может быть не более одного "активного" трека (в который пишутся точки). Его id хранится в `active_track_id` (или `null`, если запись на паузе).

### 2.3 Пример `mission.json`

```json
{
  "schema_version": 1,
  "mission_id": "2feaaeb6-4de8-4a5b-9d2f-0c56b8b034d0",
  "name": "Dive 1",
  "created_at": "2026-02-03T10:00:00.000Z",
  "updated_at": "2026-02-03T10:05:00.000Z",
  "active_track_id": "c4caa66d-c9b2-4cc3-a23a-5f9efb405a1c",
  "tracks": [
    {
      "id": "c4caa66d-c9b2-4cc3-a23a-5f9efb405a1c",
      "file": "tracks/track-0001.csv",
      "started_at": "2026-02-03T10:00:02.000Z",
      "ended_at": null,
      "note": null
    }
  ],
  "files": {
    "routes": "routes/routes.geojson",
    "markers": "markers/markers.geojson"
  },
  "ui": {
    "follow_diver": true,
    "layers": { "track": true, "routes": true, "markers": true, "grid": false, "scale_bar": true },
    "coordinates": { "precision": 6 },
    "measurements": {
      "grid": { "mode": "auto", "color": "#64748b", "width_px": 1, "line_style": "dashed" },
      "segment_lengths_mode": "on-select"
    },
    "map_view": { "center_lat": 59.93863, "center_lon": 30.31413, "zoom": 14 }
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

Рекомендуемое имя файла: `tracks/track-0001.csv`, `tracks/track-0002.csv`, ...

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

Пример строки заголовков:

`timestamp,lat,lon,segment_id,depth_m,sog_mps,cog_deg`

## 4. Объекты планирования и метки: GeoJSON

### 4.1 Общие правила

- Формат: GeoJSON `FeatureCollection`, кодировка UTF-8.
- CRS: WGS84.
- Порядок координат: `[lon, lat]` (стандарт GeoJSON).
- Каждый объект хранится как `Feature`.

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

Правило для `lane_angle_deg` (MVP):

- `0` = вдоль главной оси полигона, `90` = поперек.
- Главная ось полигона определяется как направление наибольшей протяженности (через ориентированный ограничивающий прямоугольник/OBB или эквивалентный простой подход для MVP).

3) `kind=lane` (сгенерированный галс)

- `geometry`: `LineString`
- `properties` (минимум):
  - `parent_area_id`: string (UUID зоны обследования)
  - `lane_index`: integer (1..N)

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
