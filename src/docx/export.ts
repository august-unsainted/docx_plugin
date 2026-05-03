import { App, MarkdownView, Notice } from "obsidian";
import { Packer } from "docx";
import { buildDocument } from "./builder";
import { DocxPluginSettings } from "../settings";

export async function exportFile(
	app: App,
	settings: DocxPluginSettings,
	markdownView: MarkdownView
) {
	new Notice("Экспорт файла...");
	let doc = await buildDocument(
		markdownView.editor.getValue(),
		settings,
		app,
		markdownView.file?.path ?? ""
	);

	let fileName = markdownView.file?.basename;
	const filePath = (fileName || "document") + `.${settings.saveFormat}`;
	Packer.toBlob(doc).then(async (blob) => {
		app.vault.adapter.writeBinary(filePath, await blob.arrayBuffer());
		await (app as any).openWithDefaultApp(filePath);
		new Notice(`Документ «${fileName}» создан!`);
	});
}