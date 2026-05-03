import { App, Notice, TFile } from "obsidian";
import { ImageRun, Paragraph } from "docx";
import { isImage, parseImageTag } from "../editor/utils";

export async function renderImage(
	text: string,
	app: App,
	sourcePath: string
): Promise<ImageRun | Paragraph | null> {
	if (!isImage(text)) return null;

	const { fileName, requestedWidth } = parseImageTag(text);

	const file = app.metadataCache.getFirstLinkpathDest(fileName, sourcePath);
	if (!file) {
		new Notice("Не удалось найти изображение " + fileName);
		return new Paragraph("");
	}

	try {
		const buffer = await app.vault.readBinary(file);
		return new ImageRun({
			data: buffer,
			type: file.extension as any,
			transformation: await getImageDimensions(file, app, requestedWidth),
		});
	} catch (e) {
		new Notice("Не удалось загрузить изображение " + fileName);
		return new Paragraph("");
	}
}

function getImageDimensions(
	file: TFile,
	app: App,
	requestedWidth?: number
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.src = app.vault.getResourcePath(file);
		img.onload = () => {
			let width = requestedWidth || 400;
			let scale = width / img.width;
			let height = img.height * scale;
			resolve({ width, height });
		};
		img.onerror = () => reject();
	});
}