import { Plus, RotateCcw, X } from 'lucide-react'
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type JSX,
	type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { IconButton, Select, TextButton } from '../../../../design-system/src/index.js'
import { useLocalization, type SupportedLocale } from '../../../../localization/src/index.js'
import {
	commandDefinition,
	commandDefinitions,
	shortcutConflict,
	shortcutsForCommand,
	shortcutsOverlap,
	type CommandId,
	type CommandSettingsGroup,
	type CommandShortcut
} from '../../commands/command-registry.js'
import { isReservedShortcut, shortcutFromEvent } from '../../commands/shortcut-settings.js'
import { usePresentationSettings } from '../../providers/PresentationSettingsContext.js'

const themeValues = Object.freeze(['system', 'light', 'dark'] as const)
const localeValues = Object.freeze(['en', 'ru', 'es'] as const)
const modifierCodes = new Set([
	'AltLeft',
	'AltRight',
	'ControlLeft',
	'ControlRight',
	'MetaLeft',
	'MetaRight',
	'ShiftLeft',
	'ShiftRight'
])

interface CaptureTarget {
	readonly commandId: CommandId
	readonly index: number | null
}

interface PendingConflict extends CaptureTarget {
	readonly conflictId: CommandId
	readonly shortcut: CommandShortcut
}

function currentPlatform(): 'macos' | 'other' {
	return navigator.platform.toLowerCase().includes('mac') ? 'macos' : 'other'
}

function keyLabel(code: string): string {
	if (code.startsWith('Key')) return code.slice(3)
	if (code.startsWith('Digit')) return code.slice(5)
	if (code.startsWith('Arrow')) return code.slice(5)
	if (code === 'Equal') return '+'
	if (code === 'Minus') return '−'
	if (code === 'BracketLeft') return '['
	if (code === 'BracketRight') return ']'
	if (code === 'Backspace') return '⌫'
	if (code === 'Delete') return 'Del'
	if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
	return code
}

function shortcutParts(shortcut: CommandShortcut, platform: 'macos' | 'other'): readonly string[] {
	return [
		...(shortcut.primary === true ? [platform === 'macos' ? '⌘' : 'Ctrl'] : []),
		...(shortcut.alt === true ? [platform === 'macos' ? '⌥' : 'Alt'] : []),
		...(shortcut.shift === true ? [platform === 'macos' ? '⇧' : 'Shift'] : []),
		keyLabel(shortcut.code)
	]
}

const groupKeys = Object.freeze({
	general: 'settings.generalGroup',
	transport: 'settings.transportGroup',
	'note-editing': 'settings.noteEditingGroup'
} as const)

const persistenceKeys = Object.freeze({
	'session-only': 'settings.sessionOnly',
	loading: 'settings.loading',
	saved: 'settings.saved',
	failed: 'settings.failed'
} as const)

export interface SettingsDialogProperties {
	readonly onClose: () => void
	readonly open: boolean
}

export function SettingsDialog({ onClose, open }: SettingsDialogProperties): JSX.Element | null {
	const { t } = useLocalization()
	const settings = usePresentationSettings()
	const panelReference = useRef<HTMLDivElement>(null)
	const restoreFocusReference = useRef<HTMLElement | null>(null)
	const [capture, setCapture] = useState<CaptureTarget | null>(null)
	const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const platform = currentPlatform()
	const groups = useMemo(
		() =>
			(['general', 'transport', 'note-editing'] as const).map((group) => ({
				group,
				commands: commandDefinitions
					.filter((definition) => definition.settingsGroup === group)
					.map(({ id }) => id)
			})),
		[]
	)

	useEffect(() => {
		if (!open) return
		restoreFocusReference.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		const animationFrame = requestAnimationFrame(() =>
			panelReference.current?.querySelector<HTMLElement>('button')?.focus()
		)
		return () => {
			cancelAnimationFrame(animationFrame)
			restoreFocusReference.current?.focus()
		}
	}, [open])

	const close = (): void => {
		setCapture(null)
		setPendingConflict(null)
		setMessage(null)
		onClose()
	}

	const applyShortcut = (target: CaptureTarget, shortcut: CommandShortcut): void => {
		const bindings = [...shortcutsForCommand(target.commandId, settings.shortcutOverrides)]
		if (target.index === null) bindings.push(shortcut)
		else bindings[target.index] = shortcut
		settings.setShortcutBindings(target.commandId, bindings)
		setCapture(null)
		setMessage(null)
	}

	const captureShortcut = (
		event: ReactKeyboardEvent<HTMLButtonElement>,
		target: CaptureTarget
	): void => {
		if (event.code === 'Escape') {
			event.preventDefault()
			setCapture(null)
			setMessage(null)
			return
		}
		if (modifierCodes.has(event.code)) return
		event.preventDefault()
		event.stopPropagation()
		const shortcut = shortcutFromEvent(event, platform)
		if (isReservedShortcut(shortcut, platform)) {
			setMessage(t('settings.reserved'))
			return
		}
		const conflictId = shortcutConflict(
			target.commandId,
			shortcut,
			commandDefinition(target.commandId).scope,
			settings.shortcutOverrides
		)
		if (conflictId !== null) {
			setPendingConflict({ ...target, conflictId, shortcut })
			setMessage(null)
			return
		}
		applyShortcut(target, shortcut)
	}

	const replaceConflict = (): void => {
		if (pendingConflict === null) return
		settings.setShortcutBindings(
			pendingConflict.conflictId,
			shortcutsForCommand(pendingConflict.conflictId, settings.shortcutOverrides).filter(
				(binding) => !shortcutsOverlap(binding, pendingConflict.shortcut)
			)
		)
		applyShortcut(pendingConflict, pendingConflict.shortcut)
		setPendingConflict(null)
	}

	const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
		if (event.key === 'Escape' && capture === null && pendingConflict === null) {
			event.preventDefault()
			close()
			return
		}
		if (event.key !== 'Tab') return
		const focusable = [
			...(panelReference.current?.querySelectorAll<HTMLElement>(
				'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]'
			) ?? [])
		]
		const first = focusable[0]
		const last = focusable.at(-1)
		if (first === undefined || last === undefined) return
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first.focus()
		}
	}

	if (!open) return null
	return (
		<div className="settings-dialog">
			<button
				aria-label={t('common.close')}
				className="settings-dialog__backdrop"
				onClick={close}
				type="button"
			/>
			<div
				aria-label={t('settings.title')}
				aria-modal="true"
				className="settings-dialog__panel"
				onKeyDown={handlePanelKeyDown}
				ref={panelReference}
				role="dialog"
			>
				<header className="settings-dialog__header">
					<div>
						<h1>{t('settings.title')}</h1>
						<span aria-live="polite">
							{t(persistenceKeys[settings.persistenceState])}
						</span>
					</div>
					<IconButton icon={<X />} label={t('common.close')} onClick={close} />
				</header>
				<div className="settings-dialog__content">
					<section className="settings-section">
						<h2>{t('settings.appearance')}</h2>
						<div className="settings-appearance-grid">
							<Select
								label={t('common.theme')}
								onChange={settings.setColorScheme}
								options={themeValues.map((value) => ({
									value,
									label: t(`common.${value}`)
								}))}
								value={settings.colorScheme}
							/>
							<Select<SupportedLocale>
								label={t('common.language')}
								onChange={settings.setLocale}
								options={localeValues.map((value) => ({
									value,
									label:
										value === 'en'
											? 'English'
											: value === 'ru'
												? 'Русский'
												: 'Español'
								}))}
								value={settings.locale}
							/>
						</div>
					</section>
					<section className="settings-section settings-shortcuts">
						<div className="settings-section__heading">
							<div>
								<h2>{t('settings.keyboardShortcuts')}</h2>
								<p>{t('settings.captureHint')}</p>
							</div>
							<TextButton icon={<RotateCcw />} onClick={settings.resetAllShortcuts}>
								{t('settings.resetAll')}
							</TextButton>
						</div>
						{groups.map(({ group, commands }) => (
							<ShortcutGroup
								capture={capture}
								commands={commands}
								group={group}
								key={group}
								onCapture={setCapture}
								onCaptureKeyDown={captureShortcut}
							/>
						))}
						{message === null ? null : (
							<p aria-live="assertive" className="settings-shortcut-message">
								{message}
							</p>
						)}
					</section>
				</div>
				{pendingConflict === null ? null : (
					<div aria-live="assertive" className="settings-conflict">
						<p>
							{t('settings.conflict', {
								command: t(commandDefinition(pendingConflict.conflictId).labelKey)
							})}
						</p>
						<div>
							<TextButton onClick={replaceConflict} tone="accent">
								{t('settings.replace')}
							</TextButton>
							<TextButton
								onClick={() => {
									setPendingConflict(null)
									setCapture(null)
								}}
							>
								{t('settings.cancel')}
							</TextButton>
						</div>
					</div>
				)}
			</div>
		</div>
	)

	function ShortcutGroup({
		capture: activeCapture,
		commands,
		group,
		onCapture,
		onCaptureKeyDown
	}: {
		readonly capture: CaptureTarget | null
		readonly commands: readonly CommandId[]
		readonly group: CommandSettingsGroup
		readonly onCapture: (target: CaptureTarget | null) => void
		readonly onCaptureKeyDown: (
			event: ReactKeyboardEvent<HTMLButtonElement>,
			target: CaptureTarget
		) => void
	}): JSX.Element {
		return (
			<div className="shortcut-group">
				<h3>{t(groupKeys[group])}</h3>
				{commands.map((commandId) => {
					const definition = commandDefinition(commandId)
					const bindings = shortcutsForCommand(commandId, settings.shortcutOverrides)
					return (
						<div className="shortcut-row" key={commandId}>
							<strong>{t(definition.labelKey)}</strong>
							<div className="shortcut-row__bindings">
								{bindings.length === 0 ? (
									<span className="shortcut-empty">
										{t('settings.noBinding')}
									</span>
								) : null}
								{bindings.map((binding, index) => {
									const active =
										activeCapture?.commandId === commandId &&
										activeCapture.index === index
									const target = { commandId, index }
									return (
										<span
											className="shortcut-binding"
											key={`${commandId}-${String(index)}`}
										>
											<button
												aria-label={t('command.shortcut', {
													shortcut: shortcutParts(binding, platform).join(
														' + '
													)
												})}
												className="shortcut-keycap"
												data-capturing={active || undefined}
												onClick={() => onCapture(active ? null : target)}
												onKeyDown={(event) => {
													if (active) onCaptureKeyDown(event, target)
												}}
												type="button"
											>
												{active
													? t('settings.pressKeys')
													: shortcutParts(binding, platform).map(
															(part) => <kbd key={part}>{part}</kbd>
														)}
											</button>
											<button
												aria-label={t('settings.removeBinding')}
												className="shortcut-remove"
												onClick={() =>
													settings.setShortcutBindings(
														commandId,
														bindings.filter(
															(_, bindingIndex) =>
																bindingIndex !== index
														)
													)
												}
												type="button"
											>
												<X aria-hidden="true" />
											</button>
										</span>
									)
								})}
								<button
									aria-label={t('settings.addBinding')}
									className="shortcut-add"
									data-capturing={
										activeCapture?.commandId === commandId &&
										activeCapture.index === null
											? true
											: undefined
									}
									onClick={() => onCapture({ commandId, index: null })}
									onKeyDown={(event) => {
										const target = { commandId, index: null }
										if (
											activeCapture?.commandId === commandId &&
											activeCapture.index === null
										)
											onCaptureKeyDown(event, target)
									}}
									type="button"
								>
									{activeCapture?.commandId === commandId &&
									activeCapture.index === null ? (
										t('settings.pressKeys')
									) : (
										<Plus aria-hidden="true" />
									)}
								</button>
							</div>
							<TextButton onClick={() => settings.resetShortcutBindings(commandId)}>
								{t('settings.reset')}
							</TextButton>
						</div>
					)
				})}
			</div>
		)
	}
}
