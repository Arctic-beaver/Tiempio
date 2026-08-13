# Интеграционные тесты audio lifecycle и performance-ввода

Дата: 2026-08-13

Статус: завершено

Базовая ветка: `fix/sound-chooser-audio-runtime`

## Цель

Автоматически ловить три пользовательские регрессии:

1. Desktop корректно подключает native audio host и владеет им только во время жизни runtime.
2. Физические клавиши A/S/D/F/G/H/J доходят до движка как согласованные `note-on`/`note-off`.
3. Экранные клавиши мышью или touch доходят до того же движка и корректно освобождают pointer capture.

## Этап 1. Детерминированная сквозная проверка

Добавить integration-test, который соединяет без подмены промежуточных слоёв:

`ApplicationRuntimeController → EngineClient → EngineHostSupervisor → framed native-host protocol`.

Native host в этом тесте является управляемым процессным double: он использует настоящий framing,
валидацию протокола, handshake, capabilities и health events, но не зависит от наличия физической
аудиокарты на машине CI.

Проверки lifecycle:

- до `controller.start()` host не создан;
- одновременный или повторный старт создаёт ровно один host;
- handshake использует единый generated capability profile;
- аудио проходит `configure → render plan → metronome state → start` и становится `ready`;
- пока controller активен, host остаётся жив;
- `controller.dispose()` отправляет один graceful `shutdown`;
- повторный dispose идемпотентен;
- после закрытия отсутствуют host, heartbeat/coalesce timers, listeners и pending writes.

Проверки performance-ввода:

- keyboard `keydown` создаёт `note-on` с ожидаемыми layer, pitch и velocity;
- соответствующий `keyup` создаёт `note-off` с тем же audition ID;
- pointer down экранной клавиши создаёт `note-on` и устанавливает pointer capture;
- pointer up создаёт `note-off`, снимает capture и очищает held state;
- команды действительно проходят через EngineClient, supervisor и framed host, а не проверяются на
  изолированном sink.

## Этап 2. Live Windows audio probe

Расширить существующий `check:audio-live`:

- загрузить валидный Bass render plan;
- проиграть одну ноту через keyboard event adapter;
- проиграть вторую ноту через pointer event adapter;
- запросить diagnostics и подтвердить `backendState=ready`, `deviceState=available` и
  `outputSignalObserved=true`;
- в `finally` всегда отпустить ноты, удалить listeners и остановить host;
- подтвердить пустой `resourceSnapshot` после disconnect.

Live probe остаётся отдельной Windows-проверкой: обычный `npm test` не должен зависеть от физического
устройства вывода.

## Риски и edge cases

- Любая ошибка assertions обязана пройти через `finally`, чтобы host и ноты не остались жить.
- Keyboard test использует физический `event.code`, а не символ активной раскладки.
- Pointer test проверяет primary input и точную пару capture/release.
- Тест не должен запускать Electron GUI или создавать второй lifecycle owner.
- Последовательности команд и событий обязаны оставаться монотонными и проходить production validators.
- Проверка lifecycle не должна считать процесс завершённым только по флагу double: дополнительно
  проверяется публичный `resourceSnapshot` supervisor.

## Верификация

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run check:audio-live` на Windows с доступным shared output
- `npm run package:check`

Все ресурсоёмкие команды выполняются последовательно через application-owned lifecycle runner.

## Definition of done

- Три запрошенных сценария представлены отдельными читаемыми integration cases.
- Тесты падают при потере capability, отсутствии `note-on`/`note-off`, лишнем spawn или утечке host.
- Live probe подтверждает не только принятие команд, но и наблюдавшийся выходной сигнал.
- После всех проверок lifecycle audit не находит процессов, lock или quarantine.
- Ветка чистая и слита только в `fix/sound-chooser-audio-runtime`, без merge в `main`.

## Результат

- Добавлен детерминированный integration-test из трёх сценариев в
  `apps/desktop/main/engine/audio-input.integration.test.ts`.
- Lifecycle-сценарий подтверждает один spawn, полный порядок инициализации, живой host на всём
  времени работы controller, один graceful shutdown, идемпотентный dispose и пустой
  `resourceSnapshot`.
- Keyboard- и pointer-сценарии подтверждают парные `note-on`/`note-off`, ожидаемые pitch/layer,
  `preventDefault`, pointer capture/release и очистку held state.
- `check:audio-live` загружает настоящий Bass render plan и независимо воспроизводит две ноты через
  production keyboard/pointer adapters. Между нотами проверяется `activeVoices=0`, для каждой ноты —
  `activeVoices>0`, а итоговый health содержит `outputSignalObserved=true`.
- На Windows проверка успешно открыла shared output `Onboard Speaker`; после завершения lifecycle
  audit не обнаружил процессов, lock или quarantine.
