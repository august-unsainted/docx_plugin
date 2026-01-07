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

const simpleLevel = (level: number) => ({
	level,
	format: LevelFormat.DECIMAL,
	text: `%${level + 1}.`,
	alignment: AlignmentType.START,
	style: {
		paragraph: {
			indent: {
				firstLine: 0,
				left: convertMillimetersToTwip(level * 12.5),
			},
		},
	},
});

export default {
	properties: {
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
