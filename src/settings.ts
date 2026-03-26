import {App, DropdownComponent, PluginSettingTab, Setting, TextComponent, ToggleComponent} from "obsidian";
import DocxPlugin from "./main";

type SettingKey = keyof DocxPluginSettings;

export interface DocxPluginSettings {
	fontSize: number;
	lineSpacing: number;
	firstLineIndent: number;
	marginTop: number;
	marginBottom: number;
	marginLeft: number;
	marginRight: number;
	chapterFontSize: number;
	chapterBold: boolean;
	chapterAlignment: string;
	chapterIndent: boolean;
	paragraphFontSize: number;
	paragraphBold: boolean;
	paragraphAlignment: string;
	paragraphIndent: boolean;
}

export const DEFAULT_SETTINGS: DocxPluginSettings = {
	fontSize: 14,
	lineSpacing: 1.5,
	firstLineIndent: 1.25,
	marginTop: 20,
	marginBottom: 20,
	marginLeft: 30,
	marginRight: 20,
	chapterFontSize: 16,
	chapterBold: true,
	chapterAlignment: "center",
	chapterIndent: false,
	paragraphFontSize: 14,
	paragraphBold: true,
	paragraphAlignment: "justified",
	paragraphIndent: true,
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: DocxPlugin;

	constructor(app: App, plugin: DocxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private addNumber(containerEl: HTMLElement, name: string, key: SettingKey, desc?: string) {
		new Setting(containerEl).setName(name).setDesc(desc ?? "").addText((t: TextComponent) => t
			.setValue(String(this.plugin.settings[key]))
			.onChange(async (v) => {
				(this.plugin.settings[key] as number) = Number(v) || (DEFAULT_SETTINGS[key] as number);
				await this.plugin.saveSettings();
			}));
	}

	private addStringDropdown(containerEl: HTMLElement, name: string, key: SettingKey, options: Record<string, string>, desc?: string) {
		new Setting(containerEl).setName(name).setDesc(desc ?? "").addDropdown((d: DropdownComponent) => d
			.addOptions(options)
			.setValue(String(this.plugin.settings[key]))
			.onChange(async (v) => {
				(this.plugin.settings[key] as string) = v;
				await this.plugin.saveSettings();
			}));
	}

	private addDropdownSetting(containerEl: HTMLElement, name: string, key: SettingKey, options: Record<string, string>, desc?: string) {
		new Setting(containerEl).setName(name).setDesc(desc ?? "").addDropdown((d: DropdownComponent) => d
			.addOptions(options)
			.setValue(String(this.plugin.settings[key]))
			.onChange(async (v) => {
				(this.plugin.settings[key] as number) = Number(v);
				await this.plugin.saveSettings();
			}));
	}

	private addToggleSetting(containerEl: HTMLElement, name: string, key: SettingKey, desc?: string) {
		new Setting(containerEl).setName(name).setDesc(desc ?? "").addToggle((t: ToggleComponent) => t
			.setValue(this.plugin.settings[key] as boolean)
			.onChange(async (v) => {
				(this.plugin.settings[key] as boolean) = v;
				await this.plugin.saveSettings();
			}));
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// ── Шрифт ──
		containerEl.createEl("h3", {text: "Шрифт"});

		this.addDropdownSetting(containerEl, "Размер шрифта (пт)", "fontSize",
			{"12": "12", "13": "13", "14": "14", "16": "16"}, "Основной размер текста");
		this.addDropdownSetting(containerEl, "Межстрочный интервал", "lineSpacing",
			{"1": "Одинарный", "1.15": "1.15", "1.5": "Полуторный", "2": "Двойной"});
		this.addNumber(containerEl, "Абзацный отступ (мм)", "firstLineIndent", "Красная строка");

		// ── Заголовки глав ──
		containerEl.createEl("h3", {text: "Заголовки глав (#)"});

		this.addDropdownSetting(containerEl, "Размер шрифта (пт)", "chapterFontSize",
			{"14": "14", "16": "16", "18": "18"});
		this.addToggleSetting(containerEl, "Жирное начертание", "chapterBold");
		this.addStringDropdown(containerEl, "Выравнивание", "chapterAlignment",
			{"center": "По центру", "left": "По левому краю", "justified": "По ширине"});
		this.addToggleSetting(containerEl, "Абзацный отступ", "chapterIndent",
			"Красная строка у заголовков глав");

		// ── Заголовки параграфов ──
		containerEl.createEl("h3", {text: "Заголовки параграфов (##)"});

		this.addDropdownSetting(containerEl, "Размер шрифта (пт)", "paragraphFontSize",
			{"14": "14", "16": "16", "18": "18"});
		this.addToggleSetting(containerEl, "Жирное начертание", "paragraphBold");
		this.addStringDropdown(containerEl, "Выравнивание", "paragraphAlignment",
			{"center": "По центру", "left": "По левому краю", "justified": "По ширине"});
		this.addToggleSetting(containerEl, "Абзацный отступ", "paragraphIndent",
			"Красная строка у заголовков параграфов");
	}
}
