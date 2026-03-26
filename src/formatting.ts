import {
	AlignmentType,
	convertMillimetersToTwip,
	Footer,
	LevelFormat,
	NumberFormat,
	PageNumber,
	Paragraph,
	TextRun,
} from "docx";
import { DocxPluginSettings } from "./settings";

const ALIGNMENT_MAP: Record<string, AlignmentType> = {
	center: AlignmentType.CENTER,
	left: AlignmentType.START,
	justified: AlignmentType.JUSTIFIED,
};

export default function getFormatting(settings: DocxPluginSettings) {
	let firstLineIndent = settings.firstLineIndent * 10;
	const simpleLevel = (level: number) => ({
		level,
		format: LevelFormat.DECIMAL,
		text: `%${level + 1}.`,
		alignment: AlignmentType.START,
		style: {
			paragraph: {
				indent: {
					firstLine: 0,
					left: convertMillimetersToTwip(level * firstLineIndent),
				},
			},
		},
	});

	return {
		properties: {
			titlePage: true,
			page: {
				pageNumbers: {
					start: 1,
					formatType: NumberFormat.DECIMAL,
				},
				margin: {
					top: convertMillimetersToTwip(settings.marginTop),
					right: convertMillimetersToTwip(settings.marginRight),
					bottom: convertMillimetersToTwip(settings.marginBottom),
					left: convertMillimetersToTwip(settings.marginLeft),
				},
			},
		},

		footers: {
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
		},

		styles: {
			default: {
				document: {
					run: {
						size: `${settings.fontSize * 2}`,
						font: "Times New Roman",
					},
					paragraph: {
						alignment: AlignmentType.JUSTIFIED,
						spacing: {
							line: Math.round(settings.lineSpacing * 240),
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
							firstLine:
								convertMillimetersToTwip(firstLineIndent),
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
					size: `${settings.chapterFontSize * 2}`,
					bold: settings.chapterBold,
				},
				paragraph: {
					outlineLevel: 0,
					alignment: ALIGNMENT_MAP[settings.chapterAlignment],
					indent: {
						firstLine: settings.chapterIndent
							? convertMillimetersToTwip(firstLineIndent)
							: 0,
					},
				},
			},
			{
				id: "paragraph",
				name: "Параграф",
				basedOn: "heading2",
				next: "normal",
				quickFormat: true,
				run: {
					size: `${settings.paragraphFontSize * 2}`,
					bold: settings.paragraphBold,
				},
				paragraph: {
					outlineLevel: 1,
					alignment: ALIGNMENT_MAP[settings.paragraphAlignment],
					indent: {
						firstLine: settings.paragraphIndent
							? convertMillimetersToTwip(firstLineIndent)
							: 0,
					},
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
		},

		numbering: {
			config: [
				{
					reference: "base-numbering",
					levels: [simpleLevel(0), simpleLevel(1), simpleLevel(2)],
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
		},

		features: {
			updateFields: true,
		},
	};
}
