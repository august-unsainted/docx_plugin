import {
	App,
	DropdownComponent,
	PluginSettingTab,
	Setting,
	TextComponent,
	ToggleComponent,
} from "obsidian";
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
	aiProvider: string;
	openrouterApiKey: string;
	openrouterModel: string;
	groqApiKey: string;
	groqModel: string;
	aiSystemPromptFull: string;
	aiSystemPromptPartial: string;
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
	paragraphIndent: false,
	aiProvider: "openrouter",
	openrouterApiKey: "",
	openrouterModel: "z-ai/glm-4.5-air:free",
	groqApiKey: "",
	groqModel: "qwen/qwen3-32b",
	aiSystemPromptFull: "",
	aiSystemPromptPartial: "",
};

export class SampleSettingTab extends PluginSettingTab {
	plugin: DocxPlugin;

	constructor(app: App, plugin: DocxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private addNumber(
		containerEl: HTMLElement,
		name: string,
		key: SettingKey,
		desc?: string,
	) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc ?? "")
			.addText((t: TextComponent) =>
				t
					.setValue(String(this.plugin.settings[key]))
					.onChange(async (v) => {
						(this.plugin.settings[key] as number) =
							Number(v) || (DEFAULT_SETTINGS[key] as number);
						await this.plugin.saveSettings();
					}),
			);
	}

	private addStringDropdown(
		containerEl: HTMLElement,
		name: string,
		key: SettingKey,
		options: Record<string, string>,
		desc?: string,
	) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc ?? "")
			.addDropdown((d: DropdownComponent) =>
				d
					.addOptions(options)
					.setValue(String(this.plugin.settings[key]))
					.onChange(async (v) => {
						(this.plugin.settings[key] as string) = v;
						await this.plugin.saveSettings();
					}),
			);
	}

	private addDropdownSetting(
		containerEl: HTMLElement,
		name: string,
		key: SettingKey,
		options: Record<string, string>,
		desc?: string,
	) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc ?? "")
			.addDropdown((d: DropdownComponent) =>
				d
					.addOptions(options)
					.setValue(String(this.plugin.settings[key]))
					.onChange(async (v) => {
						(this.plugin.settings[key] as number) = Number(v);
						await this.plugin.saveSettings();
					}),
			);
	}

	private addToggleSetting(
		containerEl: HTMLElement,
		name: string,
		key: SettingKey,
		desc?: string,
	) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc ?? "")
			.addToggle((t: ToggleComponent) =>
				t
					.setValue(this.plugin.settings[key] as boolean)
					.onChange(async (v) => {
						(this.plugin.settings[key] as boolean) = v;
						await this.plugin.saveSettings();
					}),
			);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// ── Шрифт ──
		containerEl.createEl("h3", { text: "Шрифт" });

		this.addDropdownSetting(
			containerEl,
			"Размер шрифта (пт)",
			"fontSize",
			{ "12": "12", "13": "13", "14": "14", "16": "16" },
			"Основной размер текста",
		);
		this.addDropdownSetting(
			containerEl,
			"Межстрочный интервал",
			"lineSpacing",
			{
				"1": "Одинарный",
				"1.15": "1.15",
				"1.5": "Полуторный",
				"2": "Двойной",
			},
		);
		this.addNumber(
			containerEl,
			"Абзацный отступ (мм)",
			"firstLineIndent",
			"Красная строка",
		);

		// ── Заголовки глав ──
		containerEl.createEl("h3", { text: "Заголовки глав (#)" });

		this.addDropdownSetting(
			containerEl,
			"Размер шрифта (пт)",
			"chapterFontSize",
			{ "14": "14", "16": "16", "18": "18" },
		);
		this.addToggleSetting(containerEl, "Жирное начертание", "chapterBold");
		this.addStringDropdown(
			containerEl,
			"Выравнивание",
			"chapterAlignment",
			{
				center: "По центру",
				left: "По левому краю",
				justified: "По ширине",
			},
		);
		this.addToggleSetting(
			containerEl,
			"Абзацный отступ",
			"chapterIndent",
			"Красная строка у заголовков глав",
		);

		// ── Заголовки параграфов ──
		containerEl.createEl("h3", { text: "Заголовки параграфов (##)" });

		this.addDropdownSetting(
			containerEl,
			"Размер шрифта (пт)",
			"paragraphFontSize",
			{ "14": "14", "16": "16", "18": "18" },
		);
		this.addToggleSetting(
			containerEl,
			"Жирное начертание",
			"paragraphBold",
		);
		this.addStringDropdown(
			containerEl,
			"Выравнивание",
			"paragraphAlignment",
			{
				center: "По центру",
				left: "По левому краю",
				justified: "По ширине",
			},
		);
		this.addToggleSetting(
			containerEl,
			"Абзацный отступ",
			"paragraphIndent",
			"Красная строка у заголовков параграфов",
		);

		// ── ИИ-генерация ──
		containerEl.createEl("h3", { text: "ИИ генерация" });

		new Setting(containerEl)
			.setName("Промт полной генерации работы")
			.setDesc("Оставьте пустым для промта по умолчанию")
			.addTextArea((t) => {
				t.inputEl.rows = 5;
				t.inputEl.style.width = "100%";
				t.setValue(this.plugin.settings.aiSystemPromptFull).onChange(
					async (v) => {
						this.plugin.settings.aiSystemPromptFull = v;
						await this.plugin.saveSettings();
					},
				);
			});

		new Setting(containerEl)
			.setName("Промт генерации выделенного фрагмента")
			.setDesc("Оставьте пустым для промта по умолчанию")
			.addTextArea((t) => {
				t.inputEl.rows = 5;
				t.inputEl.style.width = "100%";
				t.setValue(this.plugin.settings.aiSystemPromptPartial).onChange(
					async (v) => {
						this.plugin.settings.aiSystemPromptPartial = v;
						await this.plugin.saveSettings();
					},
				);
			});

		this.addStringDropdown(containerEl, "Провайдер", "aiProvider", {
			openrouter: "OpenRouter",
			groq: "Groq",
		});

		// ── OpenRouter ──
		containerEl.createEl("h4", { text: "OpenRouter" });

		new Setting(containerEl)
			.setName("API ключ")
			.setDesc("Получить на openrouter.ai/keys")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(this.plugin.settings.openrouterApiKey)
					.setPlaceholder("sk-or-...")
					.onChange(async (v) => {
						this.plugin.settings.openrouterApiKey = v;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Модель").addText((t) =>
			t
				.setValue(this.plugin.settings.openrouterModel)
				.setPlaceholder(DEFAULT_SETTINGS.openrouterModel)
				.onChange(async (v) => {
					this.plugin.settings.openrouterModel = v;
					await this.plugin.saveSettings();
				}),
		);

		// ── Groq ──
		containerEl.createEl("h4", { text: "Groq (только с VPN)" });

		new Setting(containerEl)
			.setName("API ключ")
			.setDesc("Получить на console.groq.com/keys")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(this.plugin.settings.groqApiKey)
					.setPlaceholder("gsk_...")
					.onChange(async (v) => {
						this.plugin.settings.groqApiKey = v;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Модель").addText((t) =>
			t
				.setValue(this.plugin.settings.groqModel)
				.setPlaceholder(DEFAULT_SETTINGS.groqModel)
				.onChange(async (v) => {
					this.plugin.settings.groqModel = v;
					await this.plugin.saveSettings();
				}),
		);
	}
}
