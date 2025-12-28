import {
	App,
	Editor,
	MarkdownView,
	MenuItem,
	Modal,
	Notice,
	Plugin,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	DocxPluginSettings,
	SampleSettingTab,
} from "./settings";
import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	HeadingLevel,
	FileChild,
} from "docx";

export default class DocxPlugin extends Plugin {
	settings: DocxPluginSettings;
	mainIcon: string = "file-input";

	async onload() {
		await this.loadSettings();

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				menu.addItem((item: MenuItem) => {
					item.setTitle("Экспортировать в .docx")
						.setIcon(this.mainIcon)
						.onClick(() => this.exportFile());
				});
			})
		);

		// Боковая панель
		this.addRibbonIcon(
			this.mainIcon,
			"Экспортировать в .docx",
			() => this.exportFile()
		);

		// Статус бар (правый нижний угол в редакторе)
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Страниц: ...");

		// Команда экспорта
		this.addCommand({
			id: "open-modal-complex",
			name: "Open modal (complex)",
			callback: () => this.exportFile(),
		});

		// Настройки
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DocxPluginSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async exportFile(markdownView?: MarkdownView) {
		if (!markdownView) {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view == null) {
				new Notice("Нет открытого Markdown файла");
				return;
			}
			markdownView = view;
		}
		
		new Notice("Экспорт файла...");
		this.buildDocxFromMarkdown(markdownView.editor.getValue());
	}

	async buildDocxFromMarkdown(markdown: string): Promise<void> {
		let children: FileChild[] = [];
		markdown.split("\n").forEach((line) => {
			let level = 0;
			if (line.startsWith("#")) {
				level = line.startsWith("# ") ? 1 : 2;
			}
			children.push(this.buildParagraph(line, level));
		});

		const doc = new Document({ sections: [{ children }] });

		Packer.toBlob(doc).then(async (blob) => {
			const filePath = "exported-document.docx";
			this.app.vault.adapter.writeBinary(
				filePath,
				await blob.arrayBuffer()
			);
			await (this.app as any).openWithDefaultApp(filePath);
			new Notice("Документ .docx создан!");
		});
	}

	buildParagraph(text: string, level: number): Paragraph {
		let data: any = {};

		if (level == 0) {
			data["children"] = [new TextRun({ text: text.trim() })];
		} else {
			let heading =
				level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
			data = {
				text: text.replace(/#/g, "").trim(),
				heading,
			};
		}

		return new Paragraph(data);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
