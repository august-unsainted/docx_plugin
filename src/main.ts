import { MarkdownView, MenuItem, Notice, Plugin, TFile } from "obsidian";
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
	ImageRun,
	Footer,
	AlignmentType,
	PageNumber,
	convertMillimetersToTwip,
	NumberFormat,
	HorizontalPositionAlign,
	VerticalPositionRelativeFrom,
	HorizontalPositionRelativeFrom,
	VerticalPositionAlign,
} from "docx";
import { get } from "http";

export default class DocxPlugin extends Plugin {
	settings: DocxPluginSettings;
	mainIcon: string = "file-input";
	properties = {
		titlePage: true,
		page: {
			pageNumbers: {
				start: 1,
				formatType: NumberFormat.DECIMAL,
			},
			margin: {
				top: "2cm",
				right: "2cm",
				bottom: "2cm",
				left: "3cm",
			},
		},
	};

	footers = {
		default: new Footer({
			children: [
				new Paragraph({
					alignment: AlignmentType.CENTER,
					children: [
						new TextRun({
							children: ["", PageNumber.CURRENT],
						}),
					],
				}),
			],
		}),
		first: new Footer({
			children: [new Paragraph({ text: "" })],
		}),
	};

	styles = {
		default: {
			document: {
				run: {
					size: "14pt",
					font: "Times New Roman",
				},
				paragraph: {
					alignment: AlignmentType.JUSTIFIED,
					indent: {
						firstLine: convertMillimetersToTwip(12.5),
					},
					spacing: {
						line: 360,
					},
				},
			},
		},
		paragraphStyles: [
			{
				id: "chapter",
				name: "Глава",
				basedOn: "normal",
				quickFormat: true,
				next: "paragraph",
				run: {
					size: "16pt",
				},
				paragraph: {
					outlineLevel: 0,
				},
			},
			{
				id: "paragraph",
				name: "Параграф",
				basedOn: "heading2",
				next: "normal",
				quickFormat: true,
				paragraph: {
					outlineLevel: 1,
					spacing: {
						before: 120,
						after: 120,
					},
				},
			},
			{
				id: "image",
				name: "Рисунок",
				basedOn: "normal",
				next: "normal",
				quickFormat: true,
				paragraph: {
					alignment: AlignmentType.CENTER,
					indent: {
						firstLine: 0,
					},
				},
			},
		],
	};

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
		this.addRibbonIcon(this.mainIcon, "Экспортировать в .docx", () =>
			this.exportFile()
		);

		this.addRibbonIcon("refresh-ccw", "Перезагрузить", () => {
			const pluginId = this.manifest.id;
			new Notice(`Перезагрузка ${pluginId}...`);
			// @ts-ignore
			if (app.plugins.plugins[pluginId]) {
				// @ts-ignore
				app.plugins.disablePlugin(pluginId);
				// @ts-ignore
				setTimeout(() => app.plugins.enablePlugin(pluginId), 100);
			}
			new Notice(`${pluginId} перезагружен!`);
		});

		// Статус бар (правый нижний угол в редакторе)
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Страниц: ...");

		// Команда
		this.addCommand({
			id: "export-docx",
			name: "Экспортировать текущий файл в .docx",
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
		let promises = markdown.split("\n").map(async (line) => {
			let level = 0;
			if (line.startsWith("#")) {
				level = line.startsWith("# ") ? 1 : 2;
			}
			return await this.buildParagraph(line, level);
		});

		const children = await Promise.all(promises);
		let { properties, footers, styles } = this;

		const doc = new Document({
			styles: styles as any,
			sections: [{ properties: properties as any, footers, children }],
		});

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

	async buildParagraph(text: string, level: number): Promise<Paragraph> {
		text = text.trim();
		let data: any = {};

		if (level == 0) {
			let child = null;
			if (text.startsWith("![[") && text.endsWith("]]")) {
				const fileName = text.slice(3, -2);
				try {
					const buffer = await this.app.vault.adapter.readBinary(
						fileName
					);
					let type = fileName.split(".").pop()?.toLowerCase();
					child = new ImageRun({
						data: buffer,
						type: type as any,
						transformation: await this.getImageDimensions(fileName),
					});
					if (child) {
						data["style"] = "image";
					}
				} catch (e) {
					new Notice("Не удалось загрузить изображение " + fileName);
					return new Paragraph("");
				}
			}
			data["children"] = [child || new TextRun({ text })];
		} else {
			data = {
				text: text.replace(/#/g, "").trim(),
				style: level === 1 ? "chapter" : "paragraph",
			};
		}

		return new Paragraph(data);
	}

	async getImageDimensions(
		path: string
	): Promise<{ width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.src = this.app.vault.adapter.getResourcePath(path);
			img.onload = () => {
				let width = 400;
				let scale = width / img.width;
				let height = img.height * scale;
				resolve({ width, height });
			};
			img.onerror = (err) => reject();
		});
	}
}
