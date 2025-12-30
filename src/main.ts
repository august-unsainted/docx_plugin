import {
	MarkdownView,
	MenuItem,
	Notice,
	Plugin,
	setIcon,
	setTooltip,
	requestUrl,
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
	ImageRun,
	Footer,
	AlignmentType,
	PageNumber,
	convertMillimetersToTwip,
	NumberFormat,
	TableOfContents,
	LevelFormat,
} from "docx";

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
					style: "center",
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
					spacing: {
						line: 360,
					},
				},
			},
		},
		paragraphStyles: [
			{
				id: "standard",
				name: "Стандартный",
				basedOn: "Normal",
				quickFormat: true,
				paragraph: {
					indent: {
						firstLine: convertMillimetersToTwip(12.5),
					},
				},
			},
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
				id: "center",
				name: "По центру",
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

	numbering = {
		config: [
			{
				levels: [
					{
						level: 0,
						format: LevelFormat.DECIMAL,
						text: "%1.",
						alignment: AlignmentType.START,
						style: {
							paragraph: {
								indent: {
									left: convertMillimetersToTwip(12.5),
									hanging: convertMillimetersToTwip(12.5),
								},
							},
						},
					},
				],
				reference: "base-numbering",
			},
		],
	};

	features: {
		updateFields: true;
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
			if (this.app.plugins.plugins[pluginId]) {
				// @ts-ignore
				this.app.plugins.disablePlugin(pluginId);
				// @ts-ignore
				setTimeout(() => this.app.plugins.enablePlugin(pluginId), 100);
			}
			new Notice(`${pluginId} перезагружен!`);
		});

		// Статус бар (правый нижний угол в редакторе)
		const pagesCount = this.addStatusBarItem();
		pagesCount.setText("Страниц: ...");
		const calculatePages = this.addStatusBarItem();
		setIcon(calculatePages, this.mainIcon);
		setTooltip(calculatePages, "Пересчитать количество страниц");
		calculatePages.onclick = () => {
			const view = this.checkView();
			if (view == null) return;
			let pages = Math.round(view.editor.getValue().length / 1000);
			pagesCount.setText(`Страниц: ${pages}`);
		};

		// Команда
		this.addCommand({
			id: "export-docx",
			name: "Экспортировать текущий файл в .docx",
			callback: () => this.exportFile(),
			hotkeys: [{ modifiers: ["Shift"], key: "enter" }],
		});

		this.addCommand({
			id: "page-break",
			name: "Разрыв страницы",
			checkCallback: (checking: boolean) => {
				if (checking) return false;
				const view = this.checkView();
				if (view == null) return false;
				const editor = view.editor;
				const cursor = editor.getCursor();
				editor.replaceRange("\n\n---\n", cursor);
				const newPos = { line: cursor.line + 3, ch: 0 };
				editor.setCursor(newPos);
				return false;
			},
			hotkeys: [{ modifiers: ["Shift"], key: "enter" }],
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
			const view = this.checkView();
			if (view == null) return;
			markdownView = view;
		}

		new Notice("Экспорт файла...");
		console.log();
		this.buildDocxFromMarkdown(
			markdownView.editor.getValue(),
			markdownView.file?.basename
		);
	}

	async buildDocxFromMarkdown(
		markdown: string,
		fileName?: string
	): Promise<void> {
		let pageBreakBefore = false;
		let alignCenter = false;
		let chapterNumber = 0,
			paragraphNumber = 0,
			pictureNumber = 0,
			sources: string[] = [];
		let promises = markdown.split("\n").map(async (line) => {
			line = line.trim().replace("{img}", `(рис. ${pictureNumber + 1})`);
			if (line === "") return;

			if (line === "---") {
				pageBreakBefore = true;
				return;
			}

			let level = 0;
			if (line.startsWith("#")) {
				let isChapter = line.startsWith("# ");
				line = line.replace(/#/g, "").trim();
				let counter;
				if (isChapter) {
					paragraphNumber = 0;
					counter = ++chapterNumber;
					pageBreakBefore = true;
				} else {
					counter = `${chapterNumber}.${++paragraphNumber}`;
				}
				line = `${counter}. ${line}`;
				level = isChapter ? 1 : 2;
			}

			line = line.replace(/\[(.+)\]\((.+)\)/, (_, p1, p2) => {
				sources.push(`${p2}`);
				return `${p1} [${sources.length}]`;
			});

			if (alignCenter) line = `Рисунок ${++pictureNumber}. ${line}`;

			let paragraph = this.buildParagraph(
				line,
				level,
				pageBreakBefore,
				alignCenter
			);
			alignCenter = this.isImage(line);
			pageBreakBefore = false;
			return paragraph;
		});

		const children = [
			new Paragraph({
				style: "center",
				pageBreakBefore: true,
				text: "Оглавление",
			}),
			new TableOfContents("Оглавление", {
				hyperlink: true,
				headingStyleRange: "1-2",
			}),
			...(await Promise.all(promises)),
			...(await this.buildSources(sources)),
		];
		let { properties, footers, styles, features, numbering } = this;

		const doc = new Document({
			numbering: numbering as any,
			styles: styles as any,
			features,
			sections: [
				{
					properties: properties as any,
					footers,
					children: children as any,
				},
			],
		});

		const filePath = (fileName || "document") + ".docx";

		Packer.toBlob(doc).then(async (blob) => {
			this.app.vault.adapter.writeBinary(
				filePath,
				await blob.arrayBuffer()
			);
			await (this.app as any).openWithDefaultApp(filePath);
			new Notice(`Документ «${fileName}» создан!`);
		});
	}

	async buildParagraph(
		text: string,
		level: number,
		pageBreakBefore: boolean,
		alignCenter: boolean
	): Promise<Paragraph> {
		text = text.trim();
		let data: any = {};

		if (level == 0) {
			let child = await this.renderImage(text);
			data["children"] = [child || new TextRun({ text })];
			data.style = "standard";
			if (alignCenter || child) data.style = "center";
		} else {
			data = {
				text,
				style: level === 1 ? "chapter" : "paragraph",
			};
		}

		if (pageBreakBefore) data.pageBreakBefore = true;

		return new Paragraph(data);
	}

	async buildSources(sources: string[]): Promise<Paragraph[]> {
		let paragraphs = sources.map(
			async (text) =>
				new Paragraph({
					text: await this.formatSource(text),
					numbering: {
						reference: "base-numbering",
						level: 0,
					},
				})
		);
		let header = new Paragraph({
			pageBreakBefore: true,
			text: "Список литературы",
			style: "chapter",
		});
		return [header, ...(await Promise.all(paragraphs))];
	}

	async formatSource(url: string): Promise<string> {
		try {
			const { text } = await requestUrl(url);
			const parser = new DOMParser();
			const doc = parser.parseFromString(text, "text/html");
			const title = doc.querySelector("title")?.innerText;
			if (!title) return "Заголовок не найден";
			return `${title} [Электронный ресурс]. – Режим доступа: ${url} (дата обращения: ${new Date().toLocaleDateString()}).`;
		} catch (error) {
			console.error("Ошибка при получении страницы:", error);
			return "Заголовок не найден";
		}
	}

	checkView() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) {
			new Notice("Нет открытого Markdown файла");
			return null;
		}
		return view;
	}

	async renderImage(text: string) {
		if (!this.isImage(text)) return null;
		const fileName = text.slice(3, -2);
		const buffer = await this.app.vault.adapter.readBinary(fileName);

		try {
			let type = fileName.split(".").pop()?.toLowerCase();
			return new ImageRun({
				data: buffer,
				type: type as any,
				transformation: await this.getImageDimensions(fileName),
			});
		} catch (e) {
			new Notice("Не удалось загрузить изображение " + fileName);
			return new Paragraph("");
		}
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

	isImage(line: string): boolean {
		return line.startsWith("![[") && line.endsWith("]]");
	}
}
