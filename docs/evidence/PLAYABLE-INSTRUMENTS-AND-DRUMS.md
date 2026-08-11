# Приёмка играбельных инструментов и ударных

Дата: 12 августа 2026 года. Интеграционная ветка: `fix/packaged-audio-startup`.

## Границы результата

Эта поставка завершает текущие музыкальные настройки. Desktop получил пять семейств синтеза,
27 характеров, общие semantic macros и пять процедурных ударных голосов. Sound Chooser,
Sound Sculpt и Drums используют один `ProjectSession`, публикуют один версионированный render plan
и не хранят отдельное демонстрационное состояние. Web runtime в эту поставку не входит.

Этапы были реализованы и проверены отдельно:

- `0acb0fd` — каталог, проектная модель, миграции и semantic commands;
- `825d225` — общий synth/drum native engine и wire render plan;
- `d7d9564` — Sound Chooser и Sound Sculpt;
- `25b6ae7` — рабочая Drums workstation и drum audition.

## Автоматические проверки

| Проверка                   | Результат                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run check:quick`      | PASS: 19/19 этапов; 173 TypeScript contract-теста, 88 policy-тестов, Rust format/check/Clippy/tests |
| Rust workspace             | PASS: core 14, drums 1, DSP 15, native-host 18, offline proof 7, protocol 16, synth 3, allocator 1  |
| `npm run build`            | PASS: Desktop typecheck, production build, CSP, budgets, topology и package-content policy          |
| `npm run build:web`        | PASS: Web typecheck, production build, CSP, budget и topology                                       |
| `npm run check:audio`      | PASS: release native host, staging и controlled null-audio self-test                                |
| `npm run check:audio-live` | PASS: Windows shared output, `Onboard Speaker`, 48 kHz, backend `ready`, 0 underruns                |
| `npm run package:check`    | PASS: 11/11 этапов, включая проверку packaged native resources                                      |

Два JSON-fixture протокола были приведены к уже действующему Prettier-контракту; их значения и
семантика не менялись.

## Bundle attribution и новые потолки

Старые потолки были поставлены до каталога инструментов, расширенной проектной модели и Drums.
Текущая module attribution связывает рост renderer с `catalogs.ts`, Sound Chooser, Drums,
Sound Sculpt и runtime controller, а рост Desktop main — с project validation/presets,
render-plan/protocol validation и engine host supervisor. Новых runtime-зависимостей не появилось.

| Класс            | Измерено |          Потолок | Остаток | JS topology                    |
| ---------------- | -------: | ---------------: | ------: | ------------------------------ |
| Desktop main     |   212312 | 229376 (224 KiB) |   17064 | один main entry                |
| Desktop preload  |    56841 |   61440 (60 KiB) |    4599 | один isolated preload entry    |
| Desktop renderer |   603047 | 622592 (608 KiB) |   19545 | 451568 initial, 74600 deferred |
| Web              |   566155 | 585728 (572 KiB) |   19573 | 414559 initial, 74584 deferred |

Новые значения — минимальные округлённые полные потолки с запасом, сопоставимым с предыдущей
приёмкой. Feature surfaces остаются двумя ленивыми группами, Home остаётся eager, native runtime не
попал в Web initial graph.

## Интерактивная проверка Web UI

Production Web artifact был проверен в браузере в Light и Dark при обычном размере и 1024×640:

- Home → New track → Rhythm сразу создаёт редактируемый Straight pattern;
- видны пять реальных голосов и ровно 16 шагов без preview/ghost-событий;
- выбор Open hat → Bright меняет проектную проекцию;
- Driving меняет реальный паттерн, ручной шаг и Undo возвращают точное состояние;
- правая панель переключается между patterns и voice variants в той же геометрии;
- Swing открывается из компактного transport через общий Popover;
- размеры `body`, root и документа совпадают с viewport, document overflow отсутствует;
- предупреждений и ошибок browser console не было.

Web честно оставляет transport и audition без звука: Web AudioWorklet/WASM не входит в эту поставку.

## Windows artifact

- EXE: `artifacts/packages/win-unpacked/Tiempio.exe`;
- размер: 225949696 байт;
- SHA-256: `F69AF286184AE2FCC3595DB5E51A550DE7EF721BFD20D28469BB7C0936A7B843`;
- native host SHA-256: `27EE44A20DF126871F9FC0D5DE1D29DCC94B3E54282E888AF54A0405FE564165`.

Это unpacked artifact: `Tiempio.exe` нужно запускать внутри всей папки `win-unpacked`.

## Что остаётся проверить вручную

- слышимую разницу всех пяти семейств, контрастных character и крайних положений macros;
- Kick/Clap/Closed hat/Open hat/Perc, три варианта каждого голоса, четыре паттерна, density и Swing;
- Play/Stop/loop/mute/solo/gain в смешанном synth + drums проекте;
- подключение, отключение и смену default проводного/Bluetooth output на реальном оборудовании;
- иконку Tiempio в окне, панели задач, Alt+Tab и Проводнике;
- Light/Dark, EN/RU/ES, масштаб Windows 100–200% и физические раскладки клавиатуры.

Подробные шаги находятся в `docs/ТЕСТОВЫЕ-СЦЕНАРИИ.md`.
