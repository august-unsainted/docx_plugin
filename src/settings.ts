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

export interface AiProviderConfig {
	name: string;
	url: string;
	apiKey: string;
	model: string;
}

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
	chapterPrefix: boolean;
	paragraphDot: boolean;
	chapterAllCaps: boolean;
	saveFormat: string;
	defaultImageSize: string;
	linksAtEndOfSentence: boolean;
	aiProviders: AiProviderConfig[];
	aiActiveProvider: number;
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
	chapterPrefix: false,
	paragraphDot: true,
	chapterAllCaps: false,
	saveFormat: "doc",
	defaultImageSize: "80%",
	linksAtEndOfSentence: false,
	aiProviders: [
		{ name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", apiKey: "", model: "z-ai/glm-4.5-air:free" },
		{ name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", apiKey: "", model: "qwen/qwen3-32b" },
	],
	aiActiveProvider: 0,
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
			"Абзацный отступ (см)",
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
		this.addToggleSetting(
			containerEl,
			"Слово «глава» перед номером",
			"chapterPrefix",
			"«Глава 1. Название» вместо «1. Название»",
		);
		this.addToggleSetting(
			containerEl,
			"Заглавные буквы",
			"chapterAllCaps",
			"Буквы выглядят заглавными, но в оглавлении отображаются нормально",
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
		this.addToggleSetting(
			containerEl,
			"Точка после номера",
			"paragraphDot",
			"«1.1. Название» или «1.1 Название»",
		);

		// ── Экспорт ──
		containerEl.createEl("h3", { text: "Экспорт" });

		this.addStringDropdown(
			containerEl,
			"Формат файла",
			"saveFormat",
			{
				doc: ".doc",
				docx: ".docx",
			},
			"Расширение сохраняемого файла",
		);

		new Setting(containerEl)
			.setName("Размер картинок по умолчанию")
			.setDesc("Число в пикселях (напр. 400) или процент от ширины страницы (напр. 80%)")
			.addText((t) =>
				t
					.setValue(this.plugin.settings.defaultImageSize)
					.onChange(async (v) => {
						this.plugin.settings.defaultImageSize = v;
						await this.plugin.saveSettings();
					}),
			);

		this.addToggleSetting(
			containerEl,
			"Ссылки в конце предложения",
			"linksAtEndOfSentence",
			"Переносить [N] в конец предложения перед знаком препинания",
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

		new Setting(containerEl)
			.setName("Активный провайдер")
			.addDropdown((d) => {
				for (let i = 0; i < this.plugin.settings.aiProviders.length; i++) {
					const p = this.plugin.settings.aiProviders[i]!;
					d.addOption(String(i), p.name || `Провайдер ${i + 1}`);
				}
				d.setValue(String(this.plugin.settings.aiActiveProvider))
					.onChange(async (v) => {
						this.plugin.settings.aiActiveProvider = Number(v);
						await this.plugin.saveSettings();
					});
			});

		this.plugin.settings.aiProviders.forEach((provider, index) => {
			const providerEl = containerEl.createDiv();
			const headingEl = providerEl.createEl("h4", { text: provider.name || `Провайдер ${index + 1}` });

			new Setting(providerEl)
				.setName("Название")
				.addText((t) =>
					t.setValue(provider.name).onChange(async (v) => {
						this.plugin.settings.aiProviders[index]!.name = v;
						headingEl.textContent = v || `Провайдер ${index + 1}`;
						await this.plugin.saveSettings();
					}),
				);

			new Setting(providerEl)
				.setName("URL API")
				.setDesc("Адрес chat/completions эндпоинта")
				.addText((t) =>
					t.setValue(provider.url)
						.setPlaceholder("https://api.example.com/v1/chat/completions")
						.onChange(async (v) => {
							this.plugin.settings.aiProviders[index]!.url = v;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(providerEl)
				.setName("API ключ")
				.addText((t) => {
					t.inputEl.type = "password";
					t.setValue(provider.apiKey).onChange(async (v) => {
						this.plugin.settings.aiProviders[index]!.apiKey = v;
						await this.plugin.saveSettings();
					});
				});

			new Setting(providerEl)
				.setName("Модель")
				.addText((t) =>
					t.setValue(provider.model).onChange(async (v) => {
						this.plugin.settings.aiProviders[index]!.model = v;
						await this.plugin.saveSettings();
					}),
				);

			new Setting(providerEl)
				.setName("Удалить провайдер")
				.addButton((b) =>
					b.setButtonText("Удалить").onClick(async () => {
						this.plugin.settings.aiProviders.splice(index, 1);
						if (this.plugin.settings.aiActiveProvider >= this.plugin.settings.aiProviders.length) {
							this.plugin.settings.aiActiveProvider = 0;
						}
						await this.plugin.saveSettings();
						this.display();
					}),
				);
		});

		new Setting(containerEl)
			.setName("Добавить провайдер")
			.addButton((b) =>
				b.setButtonText("+ Добавить").onClick(async () => {
					this.plugin.settings.aiProviders.push({
						name: "",
						url: "",
						apiKey: "",
						model: "",
					});
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}
}
