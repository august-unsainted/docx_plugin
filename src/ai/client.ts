import { Notice } from "obsidian";

type Provider = "openrouter" | "groq";

const PROVIDERS: Record<Provider, { url: string; headers: (key: string) => Record<string, string> }> = {
	openrouter: {
		url: "https://openrouter.ai/api/v1/chat/completions",
		headers: (key) => ({
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
			"HTTP-Referer": "https://obsidian.md",
		}),
	},
	groq: {
		url: "https://api.groq.com/openai/v1/chat/completions",
		headers: (key) => ({
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		}),
	},
};

interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

interface ClientOptions {
	apiKey: string;
	model: string;
	provider: Provider;
	systemPrompt: string;
	userMessage: string;
	onChunk: (text: string) => void;
	onReasoning?: (text: string) => void;
	signal?: AbortSignal;
}

export async function streamCompletion(options: ClientOptions): Promise<void> {
	const { apiKey, model, systemPrompt, userMessage, onChunk, signal } =
		options;

	if (!apiKey) {
		new Notice("Укажите API ключ OpenRouter в настройках плагина");
		throw new Error("API key missing");
	}

	const messages: Message[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: userMessage },
	];

	const providerConfig = PROVIDERS[options.provider];
	const response = await fetch(providerConfig.url, {
		method: "POST",
		headers: providerConfig.headers(apiKey),
		body: JSON.stringify({
			model,
			messages,
			stream: true,
		}),
		signal,
	});

	if (!response.ok) {
		const errorText = await response.text();
		new Notice(`Ошибка API: ${response.status}`);
		throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
	}

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
				// пропускаем невалидные строки
			}
		}
	}
}