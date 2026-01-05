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
	TableOfContents,
} from "docx";
import formatting from "formatting";
import editorExtension from "editorExtension";

export default class DocxPlugin extends Plugin {
	settings: DocxPluginSettings;
	mainIcon: string = "file-input";

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
			pagesCount.setText(`Страниц: ${pages || 1}`);
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

		this.addSettingTab(new SampleSettingTab(this.app, this));
		this.registerEditorExtension(editorExtension);
	}

	onunload() {}

	async loadSettings() {
		this.settings = {
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as Partial<DocxPluginSettings>),
		};
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
		let doc = await this.buildDocument(markdownView.editor.getValue());

		let fileName = markdownView.file?.basename;
		const filePath = (fileName || "document") + ".doc";
		Packer.toBlob(doc).then(async (blob) => {
			this.app.vault.adapter.writeBinary(
				filePath,
				await blob.arrayBuffer()
			);
			await (this.app as any).openWithDefaultApp(filePath);
			new Notice(`Документ «${fileName}» создан!`);
		});
	}

	async buildDocument(markdown: string): Promise<Document> {
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
			if (codeStyle) return this.buildCode(line);

			line = line.trim().replace("{img}", `(рис. ${pictureNumber + 1})`);

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
				return this.buildNumbering(line.slice(2), -1);
			}

			if (numberedLists[-1]?.length != 0) {
				numberedLists.push([]);
			}

			if (line.startsWith("#")) {
				let isChapter = line.startsWith("# ");
				line = line.replace(/#/g, "").trim();
				let counter;
				if (this.exclusions.includes(line.toLowerCase())) {
					return this.buildHeader(line, true);
				}

				if (isChapter) {
					paragraphNumber = 0;
					counter = ++chapterNumber;
				} else {
					counter = `${chapterNumber}.${++paragraphNumber}`;
				}
				return this.buildHeader(`${counter}. ${line}`, isChapter);
			}

			line = line.replace(/\[(.+)\]\((.+)\)/, (_, p1, p2) => {
				sources.push(this.formatSource(p2));
				return `${p1} [${sources.length}]`;
			});

			if (alignCenter) line = `Рисунок ${++pictureNumber}. ${line}`;
			let paragraph = this.buildText(line, alignCenter, pageBreakBefore);
			alignCenter = this.isImage(line);
			pageBreakBefore = false;
			return paragraph;
		});

		const children = [
			await this.buildText("Оглавление", true, true),
			new TableOfContents("Оглавление", {
				hyperlink: true,
				headingStyleRange: "1-2",
			}),
			...(await Promise.all(promises)),
			...(await this.buildSources(sources)),
		];

		let { properties, footers, styles, features, numbering } = formatting;
		return new Document({
			numbering,
			features,
			styles: styles as any,
			sections: [
				{
					footers,
					properties: properties as any,
					children: children as any,
				},
			],
		});
	}

	async buildText(
		text: string,
		alignCenter: boolean = false,
		pageBreakBefore: boolean = false
	): Promise<Paragraph> {
		let data: any = {pageBreakBefore};
		let image = await this.renderImage(text);
		data.children = [image || new TextRun({ text })];
		data.style = alignCenter || image ? "center" : "standard";
		return new Paragraph(data);
	}

	buildCode(text: string) {
		new Paragraph({ text, style: "code" });
	}

	async buildHeader(text: string, isChapter: boolean) {
		let data = {
			text,
			style: isChapter ? "chapter" : "paragraph",
			pageBreakBefore: isChapter,
		};
		return new Paragraph(data);
	}

	async buildSources(sources: Promise<string>[]): Promise<Paragraph[]> {
		let items = await Promise.all(sources);
		let paragraphs = items.map((item) => this.buildNumbering(item, 0));
		let header = await this.buildHeader("Список литературы", true);
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

	capitalize(text: string): string {
		return text[0]?.toUpperCase() + text.slice(1).toLowerCase();
	}

	isImage(line: string): boolean {
		return line.startsWith("![[") && line.endsWith("]]");
	}
}
