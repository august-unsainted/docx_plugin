import { EditorView, ViewUpdate } from "@codemirror/view";
import {
	EditorSelection,
	SelectionRange,
	Text,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";

export default EditorView.updateListener.of((update) => {
	update.transactions.forEach((transaction) =>
		handleUpdate(update, transaction)
	);
});

function handleUpdate(update: ViewUpdate, transaction: Transaction) {
	const eventType = transaction.annotation(Transaction.userEvent);
	let isDelete = eventType === "delete.backward";
	if (eventType !== "input.type" && !isDelete) return;

	let doc = transaction.startState.doc,
		from,
		to;
	transaction.changes.iterChanges((fromA, toA, fromB, toB, changeText) => {
		if (
			isDelete &&
			doc.sliceString(fromA, toA) === "«" &&
			findNextSybmol(doc, fromA) === "»"
		) {
			[from, to] = [fromB, toB];
			return;
		}

		if (!isDelete && changeText.toString().includes('"')) {
			[from, to] = [fromB, toB];
		}
	});
	if (!from || !to) return;
	if (isDelete) {
		let newTransaction = {
			changes: {
				from: from,
				to: from + 1,
				insert: "",
			},
		};
		update.view.dispatch(updateState(update, newTransaction));
	} else handleChanges(update, from, to);
}

function handleChanges(update: ViewUpdate, from: number, to: number) {
	let ranges = update.view.state.selection.ranges;
	if (ranges.length === 1 && ranges[0]?.empty) {
		update.view.dispatch(addQuotes(update, from, to));
		return;
	}

	let transactions: Transaction[] = [],
		selections = [];
	for (let range of ranges) {
		let newTransaction = range.empty
			? addQuotes(update, range.from - 1, range.to + 1)
			: wrapQuotes(update, range);
		transactions.push(newTransaction);
		selections.push(
			range.empty
				? EditorSelection.cursor(range.from)
				: EditorSelection.range(range.anchor, range.head)
		);
	}

	update.view.dispatch(...transactions);
	if (selections.length) {
		let newSelections = {
			selection: EditorSelection.create([...selections]),
		};
		update.view.dispatch(updateState(update, newSelections));
	}
}

function updateState(update: ViewUpdate, transaction: TransactionSpec) {
	return update.view.state.update(transaction);
}

function addQuotes(update: ViewUpdate, from: number, to: number): Transaction {
	let transaction = {
		changes: {
			from: from,
			to: to,
			insert: "«»",
		},
		selection: EditorSelection.cursor(from + 1),
	};
	return updateState(update, transaction);
}

function wrapQuotes(update: ViewUpdate, range: SelectionRange) {
	let text = update.view.state.doc.sliceString(range.from, range.to);
	let transaction = {
		changes: {
			from: range.from - 1,
			to: range.to + 1,
			insert: `«${text}»`,
		},
	};
	return updateState(update, transaction);
}

function findNextSybmol(doc: Text, from: number) {
	return doc.sliceString(from + 1, from + 2);
}
