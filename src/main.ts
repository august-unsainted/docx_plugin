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
import { EditorView, ViewUpdate } from "@codemirror/view";
import {
	EditorSelection,
	SelectionRange,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";

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
				id: "code",
				name: "Код",
				basedOn: "normal",
				next: "normal",
				quickFormat: true,
				paragraph: {
					indent: {
						firstLine: 0,
					},
					spacing: {
						line: 240,
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
				reference: "base-numbering",
				levels: [
					{
						level: 0,
						format: LevelFormat.DECIMAL,
						text: "%1.",
						alignment: AlignmentType.START,
					},
				],
			},
			{
				reference: "bullet-points",
				levels: [
					{
						level: 0,
						format: LevelFormat.BULLET,
						text: "\u00B7",
						alignment: AlignmentType.START,
						style: {
							run: {
								font: "Symbol",
							},
						},
					},
				],
			},
		],
	};

	features: {
		updateFields: true;
	};

	exclusions = [
		"введение",
		"заключение",
		"список использованных источников",
		"содержание",
	];

	async onload() {
		await this.loadSettings();

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!file.name.endsWith(".md")) return;
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
		});

		this.addCommand({
			id: "page-break",
			name: "Разрыв страницы",
			checkCallback: (checking: boolean) => {
				const editor = this.getEditor(checking);
				if (!editor) return false;
				const cursor = editor.getCursor();
				editor.replaceRange("\n\n---\n", cursor);
				const newPos = { line: cursor.line + 3, ch: 0 };
				editor.setCursor(newPos);
				return true;
			},
			hotkeys: [{ modifiers: ["Shift"], key: "enter" }],
		});

		this.addCommand({
			id: "change-register",
			name: "Изменить регистр",
			checkCallback: (checking: boolean) => {
				const editor = this.getEditor(checking);
				if (!editor) return false;
				let text = editor.getSelection();
				if (text.length === 0) return true;
				text = this.switchCase(text);
				editor.replaceSelection(text);
				editor.setSelection(
					editor.getCursor("anchor"),
					editor.getCursor("head")
				);
				return true;
			},
			hotkeys: [{ modifiers: ["Shift"], key: "f3" }],
		});

		// Настройки
		this.addSettingTab(new SampleSettingTab(this.app, this));
		this.registerEditorExtension(
			EditorView.updateListener.of((update) => {
				update.transactions.forEach((transaction) => {
					const eventType = transaction.annotation(
						Transaction.userEvent
					);
					if (eventType !== "input.type") return;
					let changeInfo;
					transaction.changes.iterChanges(
						(_fromA, _toA, from, to, change) => {
							if (change.toString().includes('"'))
								changeInfo = [from, to, change];
						}
					);
					if (changeInfo) this.handleUpdate(update, changeInfo);
				});
			})
		);
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
		this.buildDocxFromMarkdown(
			markdownView.editor.getValue(),
			markdownView.file?.basename
		);
	}

	async buildDocxFromMarkdown(
		markdown: string,
		fileName?: string
	): Promise<void> {
		let pageBreakBefore = false,
			alignCenter = false,
			codeStyle = false,
			chapterNumber = 0,
			paragraphNumber = 0,
			pictureNumber = 0,
			sources: Promise<string>[] = [],
			numberedLists: string[][] = [[]];
		let promises = markdown.split("\n").map(async (line) => {
			if (line.startsWith("```")) {
				codeStyle = !codeStyle;
				return;
			}

			if (!codeStyle) {
				line = line
					.trim()
					.replace("{img}", `(рис. ${pictureNumber + 1})`);
			}

			if (line === "") return;
			if (line === "---") {
				pageBreakBefore = true;
				return;
			}

			if (line.match(/\d+?\. .+/)) {
				line = line.split(". ", 2)[1] || "";
				numberedLists[-1]?.push(line);
				return this.buildNumbering(line, numberedLists.length);
			}

			if (line.startsWith("- ")) {
				line = line.replace("- ", "");
				return this.buildNumbering(line, -1);
			}

			if (numberedLists[-1]?.length != 0) {
				numberedLists.push([]);
			}

			let level = 0;
			if (line.startsWith("#")) {
				let isChapter = line.startsWith("# ");
				line = line.replace(/#/g, "").trim();
				let counter;
				if (this.exclusions.includes(line.toLowerCase())) {
					pageBreakBefore = true;
					level = 1;
				} else {
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
			}

			line = line.replace(/\[(.+)\]\((.+)\)/, (_, p1, p2) => {
				sources.push(this.formatSource(p2));
				return `${p1} [${sources.length}]`;
			});

			if (alignCenter) line = `Рисунок ${++pictureNumber}. ${line}`;

			let paragraph = this.buildParagraph(
				line,
				level,
				pageBreakBefore,
				alignCenter,
				codeStyle
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
		level: number = 0,
		pageBreakBefore: boolean = false,
		alignCenter: boolean = false,
		codeStyle: boolean = false
	): Promise<Paragraph> {
		if (!codeStyle) text = text.trim();
		let data: any = {};

		if (level == 0) {
			let child = await this.renderImage(text);
			data.children = [child || new TextRun({ text })];
			data.style = alignCenter || child ? "center" : "standard";
		} else {
			data = {
				text,
				style: level === 1 ? "chapter" : "paragraph",
			};
		}

		if (codeStyle) data.style = "code";
		if (pageBreakBefore) data.pageBreakBefore = true;

		return new Paragraph(data);
	}

	handleUpdate(
		update: ViewUpdate,
		params: [fromB: number, toB: number, inserted: Text]
	) {
		let [from, to, change] = params;
		if (!change.toString().includes('"')) return;
		let ranges = update.view.state.selection.ranges;
		if (ranges.length === 1 && ranges[0]?.empty) {
			update.view.dispatch(this.getCursorTransaction(update, from, to));
			return;
		}
		let transactions: Transaction[] = [];
		let selectionRanges = [];
		for (let range of ranges) {
			if (range.from > range.to) return;
			if (range.empty) {
				transactions.push(this.getCursorTransaction(update, range.from - 1, range.to));
				continue;
			}
			transactions.push(this.getRangeTransaction(update, range));
			selectionRanges.push(
				range.head === range.from
					? EditorSelection.range(range.to, range.from)
					: EditorSelection.range(range.from, range.to)
			);
		}
		update.view.dispatch(...transactions);
		if (selectionRanges.length > 0) {
			update.view.dispatch(
				this.getTransaction(update, {
					selection: EditorSelection.create([...selectionRanges]),
				})
			);
		}
	}

	async buildSources(sources: Promise<string>[]): Promise<Paragraph[]> {
		let items = await Promise.all(sources);
		let paragraphs = items.map((item) => this.buildNumbering(item, 0));
		let header = await this.buildParagraph("Список литературы", 1, true);
		return [header, ...paragraphs];
	}

	buildNumbering(text: string, instance: number): Paragraph {
		let isBullets = instance < 0;
		let numbering = {
			level: 0,
			reference: isBullets ? "bullet-points" : "base-numbering",
			instance,
		};

		return new Paragraph({
			text,
			numbering,
			style: instance === 0 ? "normal" : "standard",
		});
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

	getEditor(checking: boolean) {
		if (checking) return undefined;
		const view = this.checkView();
		if (view == null) return undefined;
		return view.editor;
	}

	switchCase(text: string): string {
		switch (text) {
			case text.toUpperCase():
				return text.toLowerCase();
			case this.capitalize(text):
				return text.toUpperCase();
			default:
				return this.capitalize(text);
		}
	}

	getTransaction(
		update: ViewUpdate,
		updateData: TransactionSpec
	): Transaction {
		return update.view.state.update(updateData);
	}

	getCursorTransaction(
		update: ViewUpdate,
		from: number,
		to: number
	): Transaction {
		let updateData = {
			changes: {
				from: from,
				to: to,
				insert: "«»",
			},
			selection: EditorSelection.cursor(from + 1),
		};
		return this.getTransaction(update, updateData);
	}

	getRangeTransaction(update: ViewUpdate, range: SelectionRange) {
		let text = update.view.state.doc.sliceString(range.from, range.to);
		let transaction = {
			changes: {
				from: range.from - 1,
				to: range.to + 1,
				insert: `«${text}»`,
			},
		};
		return this.getTransaction(update, transaction);
	}

	capitalize(text: string): string {
		return text[0]?.toUpperCase() + text.slice(1).toLowerCase();
	}

	isImage(line: string): boolean {
		return line.startsWith("![[") && line.endsWith("]]");
	}
}
