import { DataAdapter, Notice } from "obsidian";
import { ImageRun, Paragraph } from "docx";
import { isImage, parseImageTag } from "../editor/utils";

export async function renderImage(
	text: string,
	adapter: DataAdapter
): Promise<ImageRun | Paragraph | null> {
	if (!isImage(text)) return null;

	const { fileName, requestedWidth } = parseImageTag(text);
	const buffer = await adapter.readBinary(fileName);

	try {
		let type = fileName.split(".").pop()?.toLowerCase();
		return new ImageRun({
			data: buffer,
			type: type as any,
			transformation: await getImageDimensions(fileName, adapter, requestedWidth),
		});
	} catch (e) {
		new Notice("Не удалось загрузить изображение " + fileName);
		return new Paragraph("");
	}
}

function getImageDimensions(
	path: string,
	adapter: DataAdapter,
	requestedWidth?: number
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.src = adapter.getResourcePath(path);
		img.onload = () => {
			let width = requestedWidth || 400;
			let scale = width / img.width;
			let height = img.height * scale;
			resolve({ width, height });
		};
		img.onerror = () => reject();
	});
}