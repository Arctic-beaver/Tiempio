# Играбельные инструменты, характеры и ударные до фазы 6

## Текущий прогресс

- **Этап A — завершён:** каталог из 27 характеров, общая модель synth/drum, миграции и команды проекта.
- **Этап B — завершён:** пять семейств синтеза и пять процедурных ударных голосов проходят общий native DSP и render plan.
- **Этап C — завершён:** Sound Chooser и Sound Sculpt управляют реальными character/macros и сохраняют композицию прототипа.
- **Этап D — завершён:** Drums содержит реальные шаги, паттерны, плотность, Swing, варианты голосов и немедленное audition.
- **Этап E — завершён:** quality, Rust, Desktop/Web production, CSP, bundle/topology, controlled/live audio и Windows package прошли 12 августа 2026 года. Ручная проверка слышимого результата остаётся за пользователем.

## Статус и границы

Этот план превращает существующие экраны выбора звука, Sound Sculpt и Drums из частично
демонстрационных поверхностей в рабочий Desktop-инструмент. Фаза 6 в задачу не входит: Web
AudioWorklet/WASM, Web persistence и расширение сохранения не реализуются.

Интеграционная ветка — `fix/packaged-audio-startup`. Задача крупная, поэтому каждый этап
реализуется в отдельной последовательной ветке от обновлённой интеграционной ветки, проходит
свои проверки и только затем вливается обратно. Дополнительные worktree, push, PR, merge в
`main` и изменения `.github/workflows` не разрешены.

## Ожидаемый продуктовый результат

- В Sound Chooser работают все пять семейств из прототипа: Bass, Lead, Pad, Pluck и Texture.
- Числа рядом с семействами правдивы: 6/7/5/4/5 реально выбираемых характеров.
- Каждый характер имеет собственные безопасные defaults и заметно отличается по огибающей,
  спектру, ширине и насыщению, но управляется одинаковыми смысловыми осями.
- Четыре оси Sound Chooser — Dark/Bright, Soft/Hard, Clean/Dirty и Short/Long — являются
  доступными `SemanticSlider`, сразу меняют активный патч и слышны при игре/`Hear sound`.
- Sound Sculpt сохраняет композицию прототипа и управляет тремя его осями
  Dark/Bright, Soft/Hard и Clean/Dirty; соседние характеры выбираются без удаления нот.
- Добавленный Drum layer действительно звучит при Play. Работают Kick, Clap, Closed hat,
  Open hat и Perc, ручное включение точек, Straight/Sparse/Driving/Broken, Simple/Busy,
  Swing и выбор варианта каждого ударного голоса.
- Все изменения проходят через один `ProjectSession`, поддерживают Undo/Redo и сразу публикуют
  новый render plan в нативный движок.
- Существующие проекты с Bass/Deep и старым `drums.basic` мигрируют детерминированно и сохраняют
  прежний музыкальный материал.

## Визуальный контракт прототипа

Источники истины:

- `docs/tiempio_ux_prototype.html`;
- `docs/evidence/prototype-visual-reference/light/03-sound-chooser.png`;
- `docs/evidence/prototype-visual-reference/light/05-drums.png`;
- `docs/evidence/prototype-visual-reference/light/07-sound-sculpt.png`;
- соответствующие Dark-снимки и `component-map.md`.

Сохраняются:

- текстовый каталог вместо сетки обложек;
- левая колонка семейств, центральная audition/preset-зона и правая тонкая настройка;
- один coral-акцент, тонкие разделители, типографическая иерархия и существующая нижняя
  клавиатура;
- drum grid с круглыми событиями, голоса слева и контекстная панель справа;
- большая orbit/wave-композиция Sound Sculpt и список соседних характеров;
- существующая плотность, размеры, светлая/тёмная темы, scrollbar и focus treatment.

Новые состояния не создают новый визуальный язык. Для выбора варианта ударного голоса правая
панель временно меняет контекст внутри той же геометрии, а возврат к паттернам не открывает новое
окно. Swing открывается из существующего компактного элемента transport через общий Popover.

## Архитектурные решения

### Модель синтезатора

- Старый `BassInstrumentStateV1` мигрирует в общий versioned `SynthInstrumentStateV2`.
- Семейства: `bass | lead | pad | pluck | texture`.
- Общие semantic macros остаются нормализованными `0..1`:
  `brightness`, `hardness`, `dirt`, `length`, `width`.
- Resolved patch является авторитетным и хранит waveform, sub/noise mix, filter, ADSR, drive,
  stereo width, output gain и bounded movement. UI не передаёт в Rust необработанные названия
  пресетов.
- Выбор характера сбрасывает macros на его reviewed defaults; последующие ползунки изменяют
  только выбранный инструмент.

### Каталог первой поставки

Каталог повторяет количество из прототипа и остаётся компактным:

- Bass: Deep, Punchy, Warm, Dirty, Soft, Retro;
- Lead: Glass, Neon, Velvet, Hollow, Razor, Voice, Solar;
- Pad: Soft, Warm, Air, Motion, Dust;
- Pluck: Glass, Wood, Bell, Short;
- Texture: Grain, Mist, Pulse, Dust, Wire.

Имена остаются музыкальными и короткими; описания локализуются EN/RU/ES. Каталог и resolver
живут в project-core, presentation metadata — в application/localization.

### Ударные

- `drums.clean-pulse` хранит полностью resolved процедурный kit, а не ссылки на внешние samples.
- Голоса: Kick, Clap, Closed hat, Open hat, Perc.
- Для каждого голоса сохраняется выбранный вариант и его resolved параметры.
- Drum clip хранит pattern character, density и Swing вместе с событиями. Ручная правка переводит
  character в `custom`, не теряя реальных событий.
- Выбор Straight/Sparse/Driving/Broken или изменение density детерминированно перестраивает
  события через semantic command. Undo возвращает и metadata, и события.
- Swing откладывает только нечётные шестнадцатые в scheduler и не меняет сохранённые номера шагов.

### Engine и protocol

- Protocol/render-plan/patch версии обновляются совместно в JSON schema, TypeScript и Rust.
- Wire plan содержит tagged synth и drum sources, MIDI-note и drum-hit events.
- `EngineKernel` планирует NoteOn/NoteOff/DrumHit по одному sample clock.
- Общий preallocated instrument bank смешивает synth voices и procedural drum one-shots без
  allocation, lock, I/O или сортировки в callback.
- Note audition и preview явно несут `layerId`, чтобы выбранный Lead/Pad/Pluck/Texture никогда не
  играл патчем первого Bass-слоя.
- Drum synthesis: pitch-decaying sine kick, bounded filtered-noise clap/hats и tonal/noise perc.
- Output guard, meter, device recovery, metronome и Shared Audio остаются общими.

## Этап A — доменная модель и каталог

**Ветка:** `feature/instrument-catalog-domain`

### Работа

- добавить общий каталог семейств/характеров и deterministic patch resolver;
- поднять project schema и добавить миграцию текущего Bass/Deep и `drums.basic`;
- обобщить команды `layer.sound.configure`, `layer.character.select`, `layer.macro.commit`;
- добавить drum kit state, voice variants, pattern metadata, density и Swing commands;
- обновить factories, validation, project format, projections и seed project;
- сохранить старые публичные aliases только там, где они нужны для пошаговой совместимости.

### Проверка выхода

- все 27 synth preset IDs имеют ровно один family и валидный resolved patch;
- крайние значения каждой semantic axis дают конечные bounded параметры;
- старый schema-v2 Bass/Deep мигрирует без изменения нот, clips, sections и transport;
- старый drum source мигрирует в Clean Pulse;
- character/macro/pattern/density/voice/swing команды поддерживают no-op, stale revision и Undo/Redo.

## Этап B — общий нативный движок

**Ветка:** `feature/multi-instrument-engine`

### Работа

- обновить schema-generated protocol, render plan и capability contract;
- провести tagged synth/drum plan через TypeScript и Rust validation;
- обобщить synth voice для waveform/noise/movement и сохранить безопасный Bass/Deep результат;
- реализовать procedural drum pool и общий instrument voice bank;
- добавить sample-aligned DrumHit и Swing в scheduler;
- обновить live host, preview/audition layer targeting, offline render и self-test;
- убрать application-фильтр, исключающий drum layers.

### Проверка выхода

- каждый family/preset рендерит конечный несilent сигнал и контрастные метрики;
- пять drum voices дают конечный bounded и различимый сигнал;
- смешанный Bass + Pad + Drums plan проходит TypeScript/Rust parity и offline proof;
- ручная audition использует указанный layer, а неизвестный/non-synth layer отклоняется явно;
- callback allocator gate, ceilings, device recovery и старые Bass tests проходят.

## Этап C — Sound Chooser и Sound Sculpt

**Ветка:** `feature/sound-catalog-sculpt-ui`

### Работа

- сделать категории и все строки характеров доступными и truthful;
- связать заголовок, описание, waveform, `Hear sound`, клавиши и `Use sound` с выбранным layer;
- заменить четыре статические линии на общие `SemanticSlider` с preview/commit semantics;
- не менять утверждённую нижнюю композицию Keys/Scale/Use sound;
- включить соседние характеры Sound Sculpt и три его semantic sliders;
- обновить слой/arrangement/subtitle presentation для реального family/preset;
- локализовать новые описания EN/RU/ES.

### Проверка выхода

- все 27 строк достижимы мышью и клавиатурой, count не врёт;
- category/preset/macro смена освобождает held notes и отменяет preview;
- после engine acknowledgement manual keys и `Hear sound` используют новый патч;
- `Use sound` сразу ведёт в правильный редактор и сохраняет family/preset/performance;
- Sound Sculpt не удаляет и не транспонирует ноты;
- Light/Dark, 100–200% scaling, constrained height и focus states соответствуют прототипу.

## Этап D — рабочие ударные

**Ветка:** `feature/drum-controls-ui`

### Работа

- заменить preview-only drum rows реальными пятью project rows;
- включить Open hat и Perc, manual step editing и truthful active states;
- включить Straight/Sparse/Driving/Broken и `SemanticSlider` Simple/Busy;
- сделать Swing доступным из существующего transport detail без изменения его спокойной формы;
- по клику на голос показывать в правой панели его варианты и немедленное audition;
- вернуть панель к patterns без потери сетки или transport state;
- обновить projections, accessibility labels и EN/RU/ES copy.

### Проверка выхода

- пустой Drum layer получает слышимый editable pattern одним действием;
- ручные точки, pattern, density, Swing и voice variant меняют project и следующий engine plan;
- Play слышит точные шаги, mute/solo/gain и loop продолжают работать;
- быстрые повторные клики, Undo/Redo и переключение layer не оставляют старые hits/voices;
- grid не создаёт лишних декоративных focus targets, а кнопки имеют truthful disabled states.

## Этап E — интеграционная приёмка

**Ветка:** `fix/playable-instruments-acceptance`

### Работа и проверки

- пройти combined TypeScript, Rust, protocol, CSP, bundle и packaged-content gates;
- добавить смешанные regression fixtures и live native audio probe;
- проверить Home → роль → семейство → характер → ползунки → Use sound → Play;
- проверить Add layer → Drums → pattern/density/Swing/voice → Play;
- проверить Sound Sculpt для нескольких семейств и сохранность нот;
- обновить `docs/ТЕСТОВЫЕ-СЦЕНАРИИ.md` и evidence;
- собрать свежий Windows `win-unpacked/Tiempio.exe`.

## Риски и edge cases

- изменение project schema может повредить существующие файлы без отдельной v2→v3 миграции;
- preset ID и family должны валидироваться вместе, иначе UI и DSP будут противоречить друг другу;
- plan publication асинхронен: preview нельзя начинать старым патчем после смены характера;
- audition без явного layer ID ошибочно использует первый synth layer;
- drum hit не имеет NoteOff и должен завершаться только bounded one-shot envelope;
- Open/Closed hat choke нельзя оставлять renderer-timed; он принадлежит realtime bank;
- Swing у loop boundary не должен сдвигать hit за пределы следующей итерации;
- density regeneration не должна создавать duplicate IDs или нестабильный Undo diff;
- ручная правка preset pattern должна честно стать Custom;
- extreme dirt/width/noise и большое число голосов не должны производить NaN или overload;
- UI обязан release-all перед сменой layer/preset/macro, иначе возможны stuck voices;
- Web по-прежнему не имеет аудиодвижка и должен показывать доступный UI без ложного обещания звука.

## Definition of Done

- все видимые настройки Sound Chooser, Sound Sculpt и Drums либо работают, либо не показаны как
  доступные; демонстрационных disabled-строк для заявленного каталога не остаётся;
- пять synth families, 27 characters и пять drum voices проходят реальный Desktop DSP;
- ручная игра, preview и project playback используют выбранный layer/preset;
- старые проекты мигрируют детерминированно, Undo/Redo и note editing не регрессируют;
- UI остаётся визуальным потомком прототипа в Light/Dark и constrained layouts;
- все автоматические и ручные gates пройдены или имеют явно записанное аппаратное ограничение;
- Windows package обновлён, lifecycle lock/quarantine отсутствуют;
- интеграционная ветка чиста и готова к review без merge в `main`, push или PR.
