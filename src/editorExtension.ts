import { EditorView, ViewUpdate } from "@codemirror/view";
import {
	EditorSelection,
	SelectionRange,
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
	if (eventType !== "input.type") return;
	let from, to;
	transaction.changes.iterChanges((_, __, fromB, toB, changeText) => {
		if (changeText.toString().includes('"')) {
			[from, to] = [fromB, toB];
		}
	});
	if (!from || !to) return;
	let ranges = update.view.state.selection.ranges;
	if (ranges.length === 1 && ranges[0]?.empty) {
		update.view.dispatch(addQuotes(update, from, to));
		return;
	}

	let transactions: Transaction[] = [],
		selectionRanges = [];
	for (let range of ranges) {
		let newTransaction = range.empty
			? addQuotes(update, range.from - 1, range.to)
			: wrapQuotes(update, range);
		transactions.push(newTransaction);

		if (!range.empty) {
			selectionRanges.push(
				EditorSelection.range(range.anchor, range.head)
			);
		}
	}

	update.view.dispatch(...transactions);
	if (selectionRanges.length) {
		let newSelections = {
			selection: EditorSelection.create([...selectionRanges]),
		};
		update.view.dispatch(updateState(update, newSelections));
	}
}

function updateState(update: ViewUpdate, transaction: TransactionSpec) {
	return update.view.state.update(update, transaction);
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
