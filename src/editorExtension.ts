import { EditorView, ViewUpdate } from "@codemirror/view";
import { EditorSelection, SelectionRange, Text, Transaction } from "@codemirror/state";

const OPEN = "«";
const CLOSE = "»";

export default EditorView.updateListener.of((update) => {
	for (const tr of update.transactions) {
		const event = tr.annotation(Transaction.userEvent);
		if (event === "input.type") handleInput(update, tr);
		else if (event === "delete.backward") handleDelete(update, tr);
	}
});

function charAt(doc: Text, pos: number): string {
	return doc.sliceString(pos, pos + 1);
}

function hasUnclosedQuote(doc: Text, pos: number): boolean {
	const line = doc.lineAt(pos);
	const before = doc.sliceString(line.from, pos);
	let depth = 0;
	for (const ch of before) {
		if (ch === OPEN) depth++;
		else if (ch === CLOSE) depth--;
	}
	return depth > 0;
}

function findInsertedQuote(tr: Transaction): { from: number; to: number } | null {
	let result: { from: number; to: number } | null = null;
	tr.changes.iterChanges((_, __, fromB, toB, inserted) => {
		if (inserted.toString().includes('"')) {
			result = { from: fromB, to: toB };
		}
	});
	return result;
}

function handleInput(update: ViewUpdate, tr: Transaction) {
	const pos = findInsertedQuote(tr);
	if (!pos) return;

	const { state } = update.view;
	const doc = state.doc;
	const ranges = state.selection.ranges;

	// Obsidian обернул выделение(я) в "..." → заменяем на «...»
	const wrapped = ranges.filter(r =>
		!r.empty &&
		charAt(doc, r.from - 1) === '"' &&
		charAt(doc, r.to) === '"'
	);

	if (wrapped.length > 0) {
		const changes = wrapped.map(r => ({
			from: r.from - 1,
			to: r.to + 1,
			insert: `${OPEN}${doc.sliceString(r.from, r.to)}${CLOSE}`,
		}));
		// «» и "" — по 1 символу, длина не меняется → позиции стабильны
		const selections = wrapped.map(r =>
			EditorSelection.range(r.anchor, r.head)
		);
		update.view.dispatch(state.update({
			changes,
			selection: EditorSelection.create(selections),
		}));
		return;
	}

	// Обычная вставка (без выделения)
	const { from, to } = pos;
	const charAfter = charAt(doc, to);

	// Перепрыгнуть через »
	if (charAfter === CLOSE) {
		update.view.dispatch(state.update({
			changes: { from, to, insert: "" },
			selection: EditorSelection.cursor(from + 1),
		}));
		return;
	}

	let insert: string;
	if (hasUnclosedQuote(doc, from)) {
		insert = CLOSE;
	} else {
		const pair = !charAfter || /\s/.test(charAfter);
		insert = pair ? OPEN + CLOSE : OPEN;
	}

	update.view.dispatch(state.update({
		changes: { from, to, insert },
		selection: EditorSelection.cursor(from + 1),
	}));
}

function handleDelete(update: ViewUpdate, tr: Transaction) {
	const oldDoc = tr.startState.doc;
	let deletePos: number | null = null;

	tr.changes.iterChanges((fromA, toA, fromB) => {
		if (oldDoc.sliceString(fromA, toA) === OPEN &&
			charAt(oldDoc, toA) === CLOSE) {
			deletePos = fromB;
		}
	});

	if (deletePos == null) return;

	update.view.dispatch(update.view.state.update({
		changes: { from: deletePos, to: deletePos + 1, insert: "" },
	}));
}