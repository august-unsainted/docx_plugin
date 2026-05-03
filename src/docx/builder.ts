import { Document, Paragraph, TableOfContents } from "docx";
import { buildTable } from "./tables";
import { DataAdapter } from "obsidian";
import { DocxPluginSettings } from "../settings";
import getFormatting from "./formatting";
import { renderImage } from "./images";
import { formatSource } from "./sources";
import { isImage } from "../editor/utils";
import { parseInlineFormatting } from "./parser";

const EXCLUSIONS = [
	"введение",
	"заключение",
	"список использованных источников",
	"содержание",
];

export async function buildDocument(
	markdown: string,
	settings: DocxPluginSettings,
	adapter: DataAdapter,
): Promise<Document> {
	let pageBreakBefore = false,
		alignCenter = false,
		codeStyle = false,
		chapterNumber = 0,
		paragraphNumber = 0,
		pictureNumber = 0,
		sources: Promise<string>[] = [],
		numberedLists: string[][] = [[]];

	const lines = markdown.split("\n");
	let tableBuffer: string[] = [];

	let promises = lines.map(async (line, lineIndex) => {
		const isTableLine =
			line.trimStart().startsWith("|") && line.trimEnd().endsWith("|");
		if (isTableLine) {
			tableBuffer.push(line);
			const nextLine = lines[lineIndex + 1];
			const nextIsTable =
				nextLine?.trimStart().startsWith("|") &&
				nextLine?.trimEnd().endsWith("|");
			if (!nextIsTable) {
				const table = buildTable(tableBuffer);
				tableBuffer = [];
				return table;
			}
			return;
		}
		if (line.startsWith("```")) {
			codeStyle = !codeStyle;
			return;
		}
		if (codeStyle) return buildCode(line);

		if (!line.startsWith("#") && line.match(/^\t*\d+\. .+/)) {
			let item = line.split(". ", 2)[1] || "";
			const nestingLevel = (line.match(/\t/g) || []).length;
			numberedLists.last()?.push(item);
			return buildNumbering(item, numberedLists.length, nestingLevel);
		}

		if (line.startsWith("- ")) {
			return buildNumbering(line.slice(2), -1);
		}

		line = line.trim().replace("{img}", `(рис. ${pictureNumber + 1})`);

		if (line === "") return;
		if (line === "---") {
			pageBreakBefore = true;
			return;
		}

		if (numberedLists.last()?.length != 0) {
			numberedLists.push([]);
		}

		if (line.startsWith("#")) {
			let isChapter = line.startsWith("# ");
			line = line.replace(/#/g, "").trim();
			let counter;
			if (EXCLUSIONS.includes(line.toLowerCase())) {
				return buildHeader(line, isChapter);
			}

			line = line.replace(/^\d+(\.\d+)*\.?\s+/, "");

			if (isChapter) {
				paragraphNumber = 0;
				counter = ++chapterNumber;
				pageBreakBefore = false;
			} else {
				paragraphNumber++;
				counter =
					chapterNumber == 0
						? paragraphNumber
						: `${chapterNumber}.${paragraphNumber}`;
			}
			let prefix = isChapter && settings.chapterPrefix ? "Глава " : "";
			let dot = isChapter || settings.paragraphDot ? ". " : " ";
			return buildHeader(`${prefix}${counter}${dot}${line}`, isChapter);
		}

		line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, p1, p2) => {
			sources.push(formatSource(p2));
			return `${p1} [${sources.length}]`;
		});

		let currentIsImage = isImage(line);
		if (alignCenter && !currentIsImage) {
			line = `Рисунок ${++pictureNumber}. ${line}`;
		}
		let paragraph = buildText(
			line,
			alignCenter || currentIsImage,
			pageBreakBefore,
			adapter,
		);
		alignCenter = currentIsImage;
		pageBreakBefore = false;
		return paragraph;
	});

	const children = [
		await buildText("Оглавление", true, true, adapter),
		new TableOfContents("Оглавление", {
			hyperlink: true,
			headingStyleRange: "1-2",
		}),
		...(await Promise.all(promises)),
		...(await buildSources(sources)),
	];

	let { properties, footers, styles, features, numbering } =
		getFormatting(settings);
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

async function buildText(
	text: string,
	alignCenter: boolean,
	pageBreakBefore: boolean,
	adapter: DataAdapter,
): Promise<Paragraph> {
	let data: any = { pageBreakBefore };
	let image = await renderImage(text, adapter);
	data.children = image ? [image] : parseInlineFormatting(text);
	data.style = alignCenter || image ? "center" : "standard";
	return new Paragraph(data);
}

function buildCode(text: string): Paragraph {
	return new Paragraph({ text, style: "code" });
}

function buildHeader(text: string, isChapter: boolean): Paragraph {
	return new Paragraph({
		text,
		style: isChapter ? "chapter" : "paragraph",
		pageBreakBefore: isChapter,
	});
}

async function buildSources(sources: Promise<string>[]): Promise<Paragraph[]> {
	let items = await Promise.all(sources);
	let paragraphs = items.map((item) => buildNumbering(item, 0));
	let header = buildHeader("Список литературы", true);
	return [header, ...paragraphs];
}

function buildNumbering(
	text: string,
	instance: number,
	level: number = 0,
): Paragraph {
	let isBullets = instance < 0;
	let numbering = {
		level,
		reference: isBullets ? "bullet-points" : "base-numbering",
		instance,
	};
	return new Paragraph({
		children: parseInlineFormatting(text),
		numbering,
		style: instance === 0 ? "normal" : "standard",
	});
}
