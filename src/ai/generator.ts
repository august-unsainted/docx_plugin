import { Editor, Notice } from "obsidian";
import { DocxPluginSettings } from "../settings";
import { streamCompletion } from "./client";
import { buildFullPrompt, buildPartialPrompt, getSystemPrompt } from "./prompts";

export type GenerateMode = "full" | "partial";

export async function generate(
	editor: Editor,
	settings: DocxPluginSettings,
	mode: GenerateMode
): Promise<void> {
	const selected = editor.getSelection();
	if (!selected.trim()) {
		new Notice("Выделите текст: тему работы или задание для генерации");
		return;
	}

	const userPrompt = mode === "full"
		? settings.aiSystemPromptFull
		: settings.aiSystemPromptPartial;
	const systemPrompt = getSystemPrompt(mode, userPrompt);

	const userMessage =
		mode === "full"
			? buildFullPrompt(selected)
			: buildPartialPrompt(editor.getValue(), selected);

	// Запоминаем позицию для вставки
	const anchor = editor.getCursor("anchor");
	const head = editor.getCursor("head");
	const from =
		anchor.line < head.line ||
		(anchor.line === head.line && anchor.ch <= head.ch)
			? anchor
			: head;

	// Удаляем выделенный текст (промт)
	editor.replaceSelection("");
	let insertPos = editor.posToOffset(from);

	const startTime = Date.now();
	const elapsed = () => Math.round((Date.now() - startTime) / 1000);
	const abortController = new AbortController();
	const notice = new Notice("🤖 Ожидание... (нажмите чтобы остановить)", 0);
	notice.noticeEl.style.cursor = "pointer";
	notice.noticeEl.addEventListener("click", () => abortController.abort());
	const timerInterval = setInterval(() => {
		const phase = contentStarted ? "Генерация" : reasoningStarted ? "Думает" : "Ожидание";
		notice.setMessage(`🤖 ${phase}... ${elapsed()} сек (нажмите чтобы остановить)`);
	}, 1000);
	let buffer = "";
	let flushTimer: ReturnType<typeof setTimeout> | null = null;
	let reasoningStarted = false;
	let reasoningInsertPos = insertPos;
	let reasoningLineStarted = false;

	const flush = () => {
		if (!buffer) return;
		const text = buffer;
		buffer = "";

		const pos = editor.offsetToPos(insertPos);
		editor.replaceRange(text, pos);
		insertPos += text.length;
		editor.setCursor(editor.offsetToPos(insertPos));
		editor.scrollIntoView({from: editor.offsetToPos(insertPos), to: editor.offsetToPos(insertPos)}, true);
	};

	const flushReasoning = () => {
		if (!reasoningBuffer) return;
		const raw = reasoningBuffer;
		reasoningBuffer = "";

		let formatted = "";
		for (const ch of raw) {
			if (!reasoningLineStarted) {
				formatted += "> ";
				reasoningLineStarted = true;
			}
			formatted += ch;
			if (ch === "\n") {
				reasoningLineStarted = false;
			}
		}

		const pos = editor.offsetToPos(reasoningInsertPos);
		editor.replaceRange(formatted, pos);
		reasoningInsertPos += formatted.length;
		insertPos = reasoningInsertPos;
		editor.setCursor(editor.offsetToPos(insertPos));
		editor.scrollIntoView({from: editor.offsetToPos(insertPos), to: editor.offsetToPos(insertPos)}, true);
	};

	const removeReasoning = () => {
		if (!reasoningStarted) return;
		const reasoningText = editor.getRange(
			editor.offsetToPos(editor.posToOffset(from)),
			editor.offsetToPos(insertPos)
		);
		// Удаляем всё, что было написано как reasoning
		editor.replaceRange(
			"",
			editor.offsetToPos(editor.posToOffset(from)),
			editor.offsetToPos(insertPos)
		);
		insertPos = editor.posToOffset(from);
		reasoningInsertPos = insertPos;
	};

	let reasoningBuffer = "";
	let reasoningFlushTimer: ReturnType<typeof setTimeout> | null = null;
	let contentStarted = false;

	const scheduleReasoningFlush = () => {
		if (reasoningFlushTimer) return;
		reasoningFlushTimer = setTimeout(() => {
			reasoningFlushTimer = null;
			flushReasoning();
		}, 100);
	};

	const scheduleFlush = () => {
		if (flushTimer) return;
		flushTimer = setTimeout(() => {
			flushTimer = null;
			flush();
		}, 100);
	};

	try {
		const provider = settings.aiProviders[settings.aiActiveProvider];
		if (!provider) {
			new Notice("Добавьте провайдер в настройках плагина");
			return;
		}

		await streamCompletion({
			url: provider.url,
			apiKey: provider.apiKey,
			model: provider.model,
			systemPrompt,
			userMessage,
			signal: abortController.signal,
			onReasoning: (chunk: string) => {
				reasoningStarted = true;
				reasoningBuffer += chunk;
				scheduleReasoningFlush();
			},
			onChunk: (chunk: string) => {
				if (reasoningStarted && !contentStarted) {
					// Первый chunk контента — убираем reasoning
					contentStarted = true;
					if (reasoningFlushTimer) {
						clearTimeout(reasoningFlushTimer);
						reasoningFlushTimer = null;
					}
					reasoningBuffer = "";
					removeReasoning();
				}
				buffer += chunk;
				scheduleFlush();
			},
		});

		// Финальные flush'и
		if (reasoningFlushTimer) {
			clearTimeout(reasoningFlushTimer);
			reasoningFlushTimer = null;
		}
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		if (reasoningStarted && !contentStarted) {
			removeReasoning();
		}
		flush();

		clearInterval(timerInterval);
		notice.hide();
		new Notice(`✅ Генерация завершена за ${elapsed()} сек`);
	} catch (e: any) {
		clearInterval(timerInterval);
		if (flushTimer) clearTimeout(flushTimer);
		flush();
		notice.hide();

		if (e.name === "AbortError") {
			new Notice("Генерация остановлена");
		} else {
			new Notice(`Ошибка генерации: ${e.message}`);
			console.error("AI generation error:", e);
		}
	}
}