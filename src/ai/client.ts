import { Notice } from "obsidian";

interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

interface ClientOptions {
	url: string;
	apiKey: string;
	model: string;
	systemPrompt: string;
	userMessage: string;
	onChunk: (text: string) => void;
	onReasoning?: (text: string) => void;
	signal?: AbortSignal;
}

function getResetMinutes(headers: Headers): number | null {
	const retryAfter = headers.get("retry-after");
	if (retryAfter) {
		const sec = Number(retryAfter);
		if (sec > 0) return Math.ceil(sec / 60);
	}

	const ratelimitReset = headers.get("x-ratelimit-reset");
	if (ratelimitReset) {
		const val = Number(ratelimitReset);
		if (val > 1e9) {
			const sec = val - Math.floor(Date.now() / 1000);
			return sec > 0 ? Math.ceil(sec / 60) : null;
		}
		if (val > 0) return Math.ceil(val / 60);
	}

	return null;
}

function formatApiError(
	status: number,
	headers: Headers,
	body: string,
): string {
	if (status === 429) {
		const min = getResetMinutes(headers);
		if (min && min > 0) {
			return min > 1
				? `Превышен лимит запросов. Попробуйте через ~${min} мин.`
				: "Превышен лимит запросов. Попробуйте через ~1 мин.";
		}
		return "Слишком много запросов. Попробуйте через пару минут или измените запрос.";
	}

	if (status === 401) return "Неверный API ключ. Проверьте ключ в настройках.";
	if (status === 403) return "Доступ запрещён. Проверьте API ключ и права.";
	if (status === 402 || status === 402)
		return "Недостаточно средств на балансе провайдера.";
	if (status === 404)
		return `Модель не найдена. Проверьте название модели в настройках.`;
	if (status === 413)
		return "Запрос слишком длинный. Уменьшите объём текста.";
	if (status === 500 || status === 502 || status === 503)
		return "Сервер провайдера временно недоступен. Попробуйте позже.";
	if (status === 504)
		return "Время ожидания ответа истекло. Попробуйте ещё раз.";

	try {
		const parsed = JSON.parse(body);
		const msg =
			parsed?.error?.message ||
			parsed?.message ||
			parsed?.msg ||
			"";
		if (msg) return `Ошибка API (${status}): ${msg}`;
	} catch {
	}

	return `Ошибка API: код ${status}`;
}

export async function streamCompletion(options: ClientOptions): Promise<void> {
	const { url, apiKey, model, systemPrompt, userMessage, onChunk, signal } =
		options;

	if (!apiKey) {
		new Notice("Укажите API ключ в настройках плагина");
		throw new Error("API key missing");
	}

	if (!url) {
		new Notice("Укажите URL API в настройках плагина");
		throw new Error("API URL missing");
	}

	const messages: Message[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: userMessage },
	];

	const reqHeaders: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
	};
	const reqBody = { model, messages, stream: true };

	console.log("[GOSTify] → request", { url, model, headers: reqHeaders, body: reqBody });

	const response = await fetch(url, {
		method: "POST",
		headers: reqHeaders,
		body: JSON.stringify(reqBody),
		signal,
	});

	const respHeaders: Record<string, string> = {};
	response.headers.forEach((v, k) => { respHeaders[k] = v; });

	if (!response.ok) {
		const errorText = await response.text();
		console.log("[GOSTify] ← error", { status: response.status, headers: respHeaders, body: errorText });
		const notice = formatApiError(response.status, response.headers, errorText);
		new Notice(notice, 8000);
		throw new Error(notice);
	}

	console.log("[GOSTify] ← response", { status: response.status, headers: respHeaders });

	const reader = response.body?.getReader();
	if (!reader) throw new Error("No response body");

	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || !trimmed.startsWith("data: ")) continue;
			const data = trimmed.slice(6);
			if (data === "[DONE]") return;

			try {
				const parsed = JSON.parse(data);
				const delta = parsed.choices?.[0]?.delta;
				if (delta?.reasoning && options.onReasoning) {
					options.onReasoning(delta.reasoning);
				}
				if (delta?.content) onChunk(delta.content);
			} catch {
			}
		}
	}
}
