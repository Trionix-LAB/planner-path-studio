# test(gnss-com): GNSS-COM simulator (NMEA 0183 over serial) for local and CI testing

## README (short)
- Назначение: CLI-симулятор GNSS-компаса, отправляет NMEA 0183 строки в последовательный порт (COM/TTY).
- Быстрый запуск (пример): `npm run gnss-com:sim -- --port /tmp/gnss-com`
- По умолчанию симулятор сам поднимает виртуальную serial-пару через `socat`.
- Полезно для проверки: интеграции `gnss-com`, парсинга NMEA, статусов связи и поведения при битых сообщениях.

## Цель
Легкий симулятор GNSS-COM для локальной разработки и CI: генерация корректных и некорректных NMEA сообщений (`GGA`/`RMC`/`HDT`) с управляемой частотой и сценариями playback.

## Область и режимы
- CLI/Node скрипт (`tools/gnss-com-sim`) с параметрами:
  - `--port <path>`
  - `--sim-port <path>`
  - `--baud <rate>`
  - `--rate <hz>`
  - `--mode stream|single|playback`
  - `--message-mode valid|broken|mix`
  - `--replay <path>`
  - `--virtual true|false` (по умолчанию `true`)
  - `--only-valid`, `--only-broken`
  - `--auto true|false` (только для `virtual=false`: выбрать первый доступный физический порт)
  - `--list-ports` (показать доступные порты и выйти)
- Режимы отправки:
  - корректные последовательности NMEA,
  - битые/обрезанные строки,
  - playback из сценария JSON/YAML.

## Формат сценария (пример)
```yaml
- msg: "$GPRMC,123519,A,5956.2500,N,03018.5160,E,1.2,45.0,230394,,*00"
  delay_ms: 500
- msg: "$GPGGA,123520,5956.2504,N,03018.5168,E,1,08,0.9,12.3,M,0.0,M,,*00"
  delay_ms: 500
- msg: "$HEHDT,120.0,T*00"
  delay_ms: 500
```

## Интеграция
- По умолчанию (`--virtual true`) симулятор сам запускает `socat` и создает пару:
  - `appPortPath` — системный путь порта для приложения (используется автодетектом или резолвится по номеру COM-порта);
  - `simulatorPortPath` — порт, в который пишет симулятор.
- Симулятор печатает оба пути в stdout после старта.
- Для автодетекта в приложении симулятор также публикует `appPortPath` в registry-файл `/tmp/planner-gnss-com-sim.json`.
- Для Linux/macOS нужен установленный `socat`.
- Для Windows автосоздание через `socat` не поддерживается; используйте `--virtual false` и заранее созданную пару (например, `com0com`).

## Критерии приёмки
- [ ] CLI отправляет NMEA поток в заданный serial порт.
- [ ] В default-режиме симулятор сам поднимает виртуальную serial-пару и печатает `appPortPath`.
- [ ] Есть режимы valid/broken/playback.
- [ ] Поддержаны примеры сценариев в `docs/` или `tools/`.
- [ ] Возможен `--list-ports` для быстрой диагностики окружения.

## Связь
- Интеграция GNSS-COM: `spec/spec.md` (R-054)
- Интеграция GNSS-UDP (общий NMEA-контекст): `docs/features/gnss-udp-integration.md`
