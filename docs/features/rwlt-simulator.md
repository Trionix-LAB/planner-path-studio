# test(rwlt-com): RWLT-COM simulator (uNav sentences over serial) for local and CI testing

## README (short)
- Назначение: CLI-симулятор RWLT, отправляет строки протокола uNav/NMEA в последовательный порт (COM/TTY).
- Быстрый запуск: `npm run rwlt-com:sim`.
- По умолчанию симулятор сам поднимает виртуальную serial-пару через `socat` (Linux/macOS).
- Полезно для проверки: интеграции `rwlt-com`, режимов `pinger/divers`, парсинга `PUWV*`/`PRWLA`, статусов связи и работы автодетекта порта.

## Цель
Легкий симулятор RWLT-COM для локальной разработки и CI: генерация валидных и невалидных RWLT-сообщений через serial-порт с управляемой частотой и playback-сценариями.

## Область и режимы
- CLI/Node скрипт (`tools/rwlt-com-sim.cjs`) с параметрами:
  - `--port <path>`
  - `--sim-port <path>`
  - `--baud <rate>`
  - `--rate <hz>`
  - `--mode stream|single|playback`
  - `--message-mode valid|broken|mix`
  - `--rwlt-mode pinger|divers`
  - `--replay <path>`
  - `--virtual true|false` (по умолчанию `true`)
  - `--only-valid`, `--only-broken`
  - `--auto true|false` (только для `virtual=false`: выбрать первый доступный физический порт)
  - `--list-ports` (показать доступные порты и выйти)
- Поток сообщений:
  - `pinger`: `PUWV5` (база) + `GNGGA/GNRMC` (агент) + периодические `PRWLA` (буи).
  - `divers`: `PUWV5` (база) + `PUWV3` (водолазы) + периодические `PRWLA` (буи).
  - `broken/mix`: частично битые строки и некорректные пакеты для тестов устойчивости.
- Переключение режима:
  - стартовый параметр: `--rwlt-mode pinger|divers`;
  - runtime: симулятор слушает входящую `$PUNV0` и переключает внутренний `rwlt_mode` без рестарта.

## Примеры запуска
```bash
# Пингер (по умолчанию)
npm run rwlt-com:sim -- --rwlt-mode pinger

# Водолазы с явным списком tID
npm run rwlt-com:sim -- --rwlt-mode divers --diver-ids 1,2,3
```

## Формат сценария (пример)
```yaml
- msg: "$PUWV5,59.9342,30.3351,120.0,7.2*63"
  delay_ms: 500
- msg: "$GNGGA,120000.00,5956.0520,N,03020.1060,E,1,08,0.8,-12.3,M,0.0,M,,*4D"
  delay_ms: 500
- msg: "$PRWLA,1,59.9350,30.3340,1.5,12.4,0,3.1,25.0*3A"
  delay_ms: 500
```

## Интеграция
- По умолчанию (`--virtual true`) симулятор поднимает виртуальную serial-пару:
  - `appPortPath` — порт для приложения (`rwlt-com` в настройках оборудования);
  - `simulatorPortPath` — порт, в который пишет симулятор.
- Симулятор печатает оба пути в stdout после старта.
- Для автодетекта в приложении симулятор публикует `appPortPath` в registry-файл `/tmp/planner-rwlt-com-sim.json`.
- Linux/macOS: требуется `socat`.
- Windows: автосоздание через `socat` не поддерживается; использовать `--virtual false` и заранее созданную пару (например, `com0com`).

## Критерии приёмки
- [ ] CLI отправляет RWLT поток в заданный serial-порт.
- [ ] В default-режиме симулятор сам поднимает виртуальную serial-пару и печатает `appPortPath`.
- [ ] Поддержаны режимы `pinger/divers`, `valid/broken/playback`.
- [ ] Есть примеры сценариев в `docs/` или `tools/`.
- [ ] Возможен `--list-ports` для быстрой диагностики окружения.

## Связь
- Требования: `spec/spec.md` (R-069).
- Задача: `tasks/T-105.md`.
