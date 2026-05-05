import { App, Notice, TFile } from "obsidian";
import { ImageRun, Paragraph } from "docx";
import { isImage, parseImageTag, parseSizeValue } from "../editor/utils";
import { DocxPluginSettings } from "../settings";

const MM_TO_PX = 3.78;
const A4_WIDTH_MM = 210;

const imageBufferCache = new Map<string, ArrayBuffer>();
const imageDimCache = new Map<string, { width: number; height: number }>();

export function clearImageCache(): void {
	imageBufferCache.clear();
	imageDimCache.clear();
}

export async function renderImage(
	text: string,
	app: App,
	sourcePath: string,
	settings: DocxPluginSettings,
): Promise<ImageRun | Paragraph | null> {
	if (!isImage(text)) return null;

	const { fileName, requestedWidth } = parseImageTag(text);

	const file = app.metadataCache.getFirstLinkpathDest(fileName, sourcePath);
	if (!file) {
		new Notice("Не удалось найти изображение " + fileName);
		return new Paragraph("");
	}

	try {
		const cacheKey = file.path;
		let buffer = imageBufferCache.get(cacheKey);
		if (!buffer) {
			buffer = await app.vault.readBinary(file);
			imageBufferCache.set(cacheKey, buffer);
		}
		return new ImageRun({
			data: buffer,
			type: file.extension as any,
			transformation: await getImageDimensions(file, app, requestedWidth, settings),
		});
	} catch (e) {
		new Notice("Не удалось загрузить изображение " + fileName);
		return new Paragraph("");
	}
}

function getImageDimensions(
	file: TFile,
	app: App,
	requestedWidth: number | undefined,
	settings: DocxPluginSettings,
): Promise<{ width: number; height: number }> {
	const cacheKey = file.path;
	const cached = imageDimCache.get(cacheKey);
	if (cached) {
		const width = resolveWidth(requestedWidth, settings);
		const scale = width / cached.width;
		return Promise.resolve({ width, height: cached.height * scale });
	}

	return new Promise((resolve, reject) => {
		const img = new Image();
		img.src = app.vault.getResourcePath(file);
		img.onload = () => {
			imageDimCache.set(cacheKey, { width: img.width, height: img.height });
			let width = resolveWidth(requestedWidth, settings);
			let scale = width / img.width;
			let height = img.height * scale;
			resolve({ width, height });
		};
		img.onerror = () => reject();
	});
}

function resolveWidth(requestedWidth: number | undefined, settings: DocxPluginSettings): number {
	if (requestedWidth !== undefined) return requestedWidth;

	const parsed = parseSizeValue(settings.defaultImageSize);
	if (!parsed) return 400;

	if ("px" in parsed) return parsed.px;

	const contentWidthMm = A4_WIDTH_MM - settings.marginLeft - settings.marginRight;
	const contentWidthPx = contentWidthMm * MM_TO_PX;
	return contentWidthPx * (parsed.percent / 100);
}
