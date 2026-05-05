import { BorderStyle, Document, Paragraph, TableOfContents } from "docx";
import { buildTable } from "./tables";
import { App } from "obsidian";
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
	app: App,
	sourcePath: string,
): Promise<Document> {
	let pageBreakBefore = false,
		alignCenter = false,
		codeStyle = false,
		chapterNumber = 0,
		paragraphNumber = 0,
		pictureNumber = 0,
		sources: Promise<string>[] = [],
		sourceUrlIndex: Map<string, number> = new Map(),
		numberedLists: string[][] = [[]];

	const lines = markdown.split("\n");
	let tableBuffer: string[] = [];
	let codeBuffer: string[] = [];

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
			if (codeStyle) {
				const paragraphs = buildCodeBlock(codeBuffer);
				codeBuffer = [];
				codeStyle = false;
				return paragraphs;
			}
			codeStyle = true;
			return;
		}
		if (codeStyle) {
			codeBuffer.push(line);
			return;
		}

		if (!line.startsWith("#") && line.match(/^\t*\d+\. .+/)) {
			let item = line.split(". ", 2)[1] || "";
			const nestingLevel = (line.match(/\t/g) || []).length;
			numberedLists.last()?.push(item);
			return buildNumbering(item, numberedLists.length, nestingLevel);
		}

		if (line.startsWith("- ")) {
			return buildNumbering(line.slice(2), -1);
		}

		line = line.trim().replace("{img}", `(${settings.imageShortCaption ? 'рис.' : 'рисунок'} ${pictureNumber + 1})`);

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
			let existingIndex = sourceUrlIndex.get(p2);
			if (existingIndex !== undefined) {
				return `${p1} [${existingIndex + 1}]`;
			}
			sourceUrlIndex.set(p2, sources.length);
			sources.push(formatSource(p2));
			return `${p1} [${sources.length}]`;
		});

		if (settings.linksAtEndOfSentence) {
			line = moveRefsToSentenceEnd(line);
		}

		line = stackRefs(line);

		let currentIsImage = isImage(line);
		if (alignCenter && !currentIsImage) {
			const prefix = settings.imageShortCaption ? 'Рис.' : 'Рисунок';
			const sep = settings.imageCaptionSeparator === 'dash' ? ' \u2013' : '.';
			line = `${prefix} ${++pictureNumber}${sep} ${line}`;
		}
		let paragraph = buildText(
			line,
			alignCenter || currentIsImage,
			pageBreakBefore,
			app,
			sourcePath,
			settings,
		);
		alignCenter = currentIsImage;
		pageBreakBefore = false;
		return paragraph;
	});

	const children = [
		await buildText("Оглавление", true, true, app, sourcePath, settings),
		new TableOfContents("Оглавление", {
			hyperlink: true,
			headingStyleRange: "1-2",
		}),
		...(await Promise.all(promises)).flat().filter(Boolean),
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
	app: App,
	sourcePath: string,
	settings: DocxPluginSettings,
): Promise<Paragraph> {
	let data: any = { pageBreakBefore };
	let image = await renderImage(text, app, sourcePath, settings);
	data.children = image ? [image] : parseInlineFormatting(text);
	data.style = alignCenter || image ? "center" : "standard";
	return new Paragraph(data);
}

function buildCodeBlock(lines: string[]): Paragraph[] {
	const sideBorder = {
		style: BorderStyle.SINGLE,
		size: 1,
		color: "auto",
	};
	const noBorder = {
		style: BorderStyle.NONE,
		size: 0,
		color: "auto",
	};
	const last = lines.length - 1;
	return lines.map((text, i) => {
		const isFirst = i === 0;
		const isLast = i === last;
		return new Paragraph({
			text,
			style: "code",
			border: {
				top: isFirst ? sideBorder : noBorder,
				bottom: isLast ? sideBorder : noBorder,
				left: sideBorder,
				right: sideBorder,
			},
			spacing: isLast ? { after: 160 } : undefined,
		});
	});
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

function moveRefsToSentenceEnd(text: string): string {
	if (!text.includes('[')) return text;
	const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ])/);
	return sentences.map(sentence => {
		const refs: string[] = [];
		const cleaned = sentence.replace(/\s*\[(\d+)\]/g, (_, n) => {
			refs.push(`[${n}]`);
			return '';
		});
		if (refs.length === 0) return sentence;
		const punctMatch = cleaned.match(/^(.*)([.!?][»")\]]?)$/);
		if (punctMatch) {
			return `${punctMatch[1]} ${refs.join(' ')}${punctMatch[2]}`;
		}
		return `${cleaned} ${refs.join(' ')}`;
	}).join(' ').replace(/  +/g, ' ');
}

function stackRefs(text: string): string {
	return text.replace(/\[(\d+)\](\s*\[(\d+)\])+/g, (match) => {
		const nums = [...match.matchAll(/\[(\d+)\]/g)].map(m => m[1]);
		return `[${nums.join(', ')}]`;
	});
}
