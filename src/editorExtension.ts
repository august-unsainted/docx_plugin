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
	if (from && to) handleChanges(update, from, to);
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
		selection: EditorSelection.cursor(from + 1)
	};
	console.log(transaction);
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
	console.log(transaction);
	return updateState(update, transaction);
}
