import {
	App,
	FuzzySuggestModal,
	MarkdownView,
	MenuItem,
	Notice,
	Plugin,
	setIcon,
	setTooltip,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	DocxPluginSettings,
	SampleSettingTab,
} from "./settings";
import { exportFile } from "./docx/export";
import { getPageCount } from "./docx/pageCount";
import { switchCase } from "./editor/utils";
import { generate } from "./ai/generator";
import editorExtension from "./editor/editorExtension";

export default class DocxPlugin extends Plugin {
	settings: DocxPluginSettings;
	mainIcon: string = "file-input";

	async onload() {
		await this.loadSettings();

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!file.name.endsWith(".md")) return;
				menu.addItem((item: MenuItem) => {
					item.setTitle("Экспортировать в .doc")
						.setIcon(this.mainIcon)
						.onClick(() => this.handleExport());
				});
			})
		);

		this.addRibbonIcon(this.mainIcon, "Экспортировать в .doc", () =>
			this.handleExport()
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

		const pagesCount = this.addStatusBarItem();
		pagesCount.setText("Страниц: ...");
		const calculatePages = this.addStatusBarItem();
		setIcon(calculatePages, this.mainIcon);
		setTooltip(calculatePages, "Пересчитать количество страниц");
		calculatePages.onclick = async () => {
			const view = this.checkView();
			if (view == null) return;

			pagesCount.setText("Страниц: ⏳");
			new Notice("Подсчёт страниц...");

			// Билдим и сохраняем временный файл
			const { buildDocument } = await import("./docx/builder");
			const { Packer } = await import("docx");
			const doc = await buildDocument(
				view.editor.getValue(),
				this.settings,
				this.app,
				view.file?.path ?? ""
			);
			const tempPath = "_page_count_temp.docx";
			const blob = await Packer.toBlob(doc);
			await this.app.vault.adapter.writeBinary(tempPath, await blob.arrayBuffer());

			// Открываем в Word
			await (this.app as any).openWithDefaultApp(tempPath);

			// Ждём обновления полей, сохраняем, закрываем, читаем
			setTimeout(async () => {
				const vaultPath = (this.app.vault.adapter as any).getBasePath();
				const pages = await getPageCount(tempPath, vaultPath, true);

				if (pages) {
					pagesCount.setText(`Страниц: ${pages}`);
					new Notice(`📄 Страниц: ${pages}`);
				} else {
					pagesCount.setText("Страниц: ??");
					new Notice("Не удалось подсчитать страницы");
				}

				// Удаляем временный файл
				try {
					await this.app.vault.adapter.remove(tempPath);
				} catch {}
			}, 5000);
		};

		this.addCommand({
			id: "export-docx",
			name: "Экспортировать текущий файл в .doc",
			callback: () => this.handleExport(),
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
			hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "enter" }],
		});

		this.addCommand({
			id: "change-register",
			name: "Изменить регистр",
			checkCallback: (checking: boolean) => {
				const editor = this.getEditor(checking);
				if (!editor) return false;
				let text = editor.getSelection();
				if (text.length === 0) return true;
				text = switchCase(text);
				const anchor = editor.getCursor("anchor");
				const head = editor.getCursor("head");
				editor.replaceSelection(text);
				editor.setSelection(anchor, head);
				return true;
			},
			hotkeys: [{ modifiers: ["Shift"], key: "f3" }],
		});

		// AI контекстное меню
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const selection = editor.getSelection();
				if (!selection?.trim()) return;

				menu.addItem((item) => {
					item.setTitle("Сгенерировать работу")
						.setIcon("bot")
						.onClick(() => generate(editor, this.settings, "full"));
				});

				menu.addItem((item) => {
					item.setTitle("Сгенерировать фрагмент")
						.setIcon("pencil-line")
						.onClick(() => generate(editor, this.settings, "partial"));
				});
			})
		);

		// AI команды
		this.addCommand({
			id: "ai-generate-full",
			name: "Сгенерировать работу (AI)",
			editorCallback: (editor) =>
				generate(editor, this.settings, "full"),
		});

		this.addCommand({
			id: "ai-generate-partial",
			name: "Сгенерировать фрагмент (AI)",
			editorCallback: (editor) =>
				generate(editor, this.settings, "partial"),
		});

		this.addCommand({
			id: "switch-ai-provider",
			name: "Сменить провайдера AI",
			hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "p" }],
			callback: () => {
				new ProviderSwitchModal(this.app, this).open();
			},
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

	handleExport() {
		const view = this.checkView();
		if (view == null) return;
		exportFile(this.app, this.settings, view);
	}

	checkView() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) {
			new Notice("Нет открытого Markdown файла");
			return null;
		}
		return view;
	}

	getEditor(checking: boolean) {
		if (checking) return undefined;
		const view = this.checkView();
		if (view == null) return undefined;
		return view.editor;
	}
}

class ProviderSwitchModal extends FuzzySuggestModal<string> {
	plugin: DocxPlugin;

	constructor(app: App, plugin: DocxPlugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Выберите провайдера...");
	}

	getItems(): string[] {
		return this.plugin.settings.aiProviders.map(
			(p, i) => {
				const name = p.name || `Провайдер ${i + 1}`;
				return i === this.plugin.settings.aiActiveProvider
					? `${name} (текущий)`
					: name;
			},
		);
	}

	getItemText(item: string): string {
		return item;
	}

	async onChooseItem(item: string): Promise<void> {
		if (item.includes("(текущий)")) return;
		const cleanName = item.replace(/ \(текущий\)$/, "");
		const index = this.plugin.settings.aiProviders.findIndex(
			(p, i) => (p.name || `Провайдер ${i + 1}`) === cleanName,
		);
		if (index === -1) return;
		this.plugin.settings.aiActiveProvider = index;
		await this.plugin.saveSettings();
		new Notice(`Провайдер: ${cleanName}`);
	}
}