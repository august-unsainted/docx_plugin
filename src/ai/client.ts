import { Notice } from "obsidian";
import * as http from "http";
import * as https from "https";

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
	onFirstToken?: () => void;
	signal?: AbortSignal;
}

function getResetMinutes(headers: Record<string, string>): number | null {
	const retryAfter = headers["retry-after"];
	if (retryAfter) {
		const sec = Number(retryAfter);
		if (sec > 0) return Math.ceil(sec / 60);
	}

	const ratelimitReset = headers["x-ratelimit-reset"];
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
	headers: Record<string, string>,
	body: string,
): string {
	if (status === 429) {
		const min = getResetMinutes(headers);
		if (min && min > 0) {
			return min > 1
				? `Слишком много запросов. Попробуйте через ~${min} мин.`
				: "Слишком много запросов. Попробуйте через ~1 мин.";
		}
		return "Слишком много запросов. Попробуйте через пару минут.";
	}

	if (status === 401) return "Неверный API ключ. Проверьте ключ в настройках.";
	if (status === 403) return "Доступ запрещён. Проверьте API ключ и права.";
	if (status === 402)
		return "Недостаточно средств на балансе провайдера.";
	if (status === 404)
		return "Модель не найдена. Проверьте название модели в настройках.";
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
	const { url, apiKey, model, systemPrompt, userMessage, onChunk, onReasoning, onFirstToken, signal } =
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
		"HTTP-Referer": "https://obsidian.md",
	};
	const reqBody: Record<string, unknown> = { model, messages, stream: true };
	if (url.includes("openrouter")) reqBody.include_reasoning = true;
	const bodyStr = JSON.stringify(reqBody);

	console.log("[GOSTify] → request", { url, model });

	let firstTokenFired = false;
	let inThinking = false;
	let contentBuffer = "";
	let sseBuffer = "";

	const THINK_START = "\u003Cthink\u003E";
	const THINK_END = "\u003C/think\u003E";

	const fireFirstToken = () => {
		if (!firstTokenFired) {
			firstTokenFired = true;
			onFirstToken?.();
		}
	};

	const processSseLines = (text: string): boolean => {
		const lines = text.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || !trimmed.startsWith("data: ")) continue;
			const data = trimmed.slice(6);
			if (data === "[DONE]") return true;

			try {
				const parsed = JSON.parse(data);
				const delta = parsed.choices?.[0]?.delta;
				if (!delta) continue;

				let reasoning: string = "";
				if (typeof delta.reasoning === "string") {
					reasoning = delta.reasoning;
				} else if (delta.reasoning && typeof delta.reasoning === "object") {
					reasoning = (delta.reasoning as Record<string, unknown>).content as string || "";
				}
				if (typeof delta.reasoning_content === "string") {
					reasoning = delta.reasoning_content;
				}
				if (reasoning && onReasoning) {
					fireFirstToken();
					onReasoning(reasoning);
				}

				if (delta.content) {
					fireFirstToken();
					contentBuffer += delta.content;

					while (contentBuffer.length > 0) {
						if (inThinking) {
							const endIdx = contentBuffer.indexOf(THINK_END);
							if (endIdx !== -1) {
								const thinkingPart = contentBuffer.slice(0, endIdx);
								if (thinkingPart && onReasoning) onReasoning(thinkingPart);
								contentBuffer = contentBuffer.slice(endIdx + THINK_END.length);
								inThinking = false;
							} else {
								if (contentBuffer && onReasoning) onReasoning(contentBuffer);
								contentBuffer = "";
								break;
							}
						} else {
							const startIdx = contentBuffer.indexOf(THINK_START);
							if (startIdx !== -1) {
								const before = contentBuffer.slice(0, startIdx);
								if (before) onChunk(before);
								const afterTag = contentBuffer.slice(startIdx + THINK_START.length);
								const endIdx = afterTag.indexOf(THINK_END);
								if (endIdx !== -1) {
									const thinkingPart = afterTag.slice(0, endIdx);
									if (thinkingPart && onReasoning) onReasoning(thinkingPart);
									contentBuffer = afterTag.slice(endIdx + THINK_END.length);
								} else {
									inThinking = true;
									if (afterTag && onReasoning) onReasoning(afterTag);
									contentBuffer = "";
									break;
								}
							} else {
								const tail = contentBuffer.slice(-THINK_START.length);
								if (tail.length < contentBuffer.length && THINK_START.startsWith(tail)) {
									onChunk(contentBuffer.slice(0, contentBuffer.length - tail.length));
									contentBuffer = tail;
								} else {
									onChunk(contentBuffer);
									contentBuffer = "";
								}
								break;
							}
						}
					}
				}
			} catch {
			}
		}
		return false;
	};

	const flushContent = () => {
		if (contentBuffer) {
			if (inThinking && onReasoning) onReasoning(contentBuffer);
			else onChunk(contentBuffer);
			contentBuffer = "";
		}
	};

	await new Promise<void>((resolve, reject) => {
		const parsedUrl = new URL(url);
		const mod = parsedUrl.protocol === "https:" ? https : http;

		const req = mod.request(
			{
				hostname: parsedUrl.hostname,
				port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
				path: parsedUrl.pathname + parsedUrl.search,
				method: "POST",
				headers: { ...reqHeaders, "Content-Length": Buffer.byteLength(bodyStr) },
			},
			(res) => {
				const respHeaders: Record<string, string> = {};
				for (const [k, v] of Object.entries(res.headers)) {
					if (typeof v === "string") respHeaders[k] = v;
					else if (Array.isArray(v)) respHeaders[k] = v.join(", ");
				}

				if ((res.statusCode ?? 0) >= 400) {
					const chunks: Buffer[] = [];
					res.on("data", (c: Buffer) => chunks.push(c));
					res.on("end", () => {
						const errorText = Buffer.concat(chunks).toString("utf-8");
						console.log("[GOSTify] ← error body", { status: res.statusCode, body: errorText });
						const notice = formatApiError(res.statusCode ?? 0, respHeaders, errorText);
						new Notice(notice, 8000);
						reject(new Error(notice));
					});
					return;
				}

				let done = false;

				const finish = () => {
					if (done) return;
					done = true;
					if (sseBuffer.trim()) processSseLines(sseBuffer);
					flushContent();
					signal?.removeEventListener("abort", abortHandler);
					resolve();
				};

				const abortHandler = () => {
					if (!done) {
						done = true;
						res.destroy();
						reject(new DOMException("The user aborted a request.", "AbortError"));
					}
				};
				signal?.addEventListener("abort", abortHandler, { once: true });

				let lastDataTime = Date.now();
				const stallChecker = setInterval(() => {
					if (done) {
						clearInterval(stallChecker);
						return;
					}
					const elapsed = Math.round((Date.now() - lastDataTime) / 1000);
					if (elapsed > 30) {
						clearInterval(stallChecker);
						finish();
					}
				}, 5000);

				res.on("data", (chunk: Buffer) => {
					if (done) return;
					lastDataTime = Date.now();
					sseBuffer += chunk.toString("utf-8");
					const lines = sseBuffer.split("\n");
					sseBuffer = lines.pop() || "";

					if (processSseLines(lines.join("\n"))) {
						clearInterval(stallChecker);
						finish();
						return;
					}
				});

				res.on("end", () => {
					clearInterval(stallChecker);
					finish();
				});

				res.on("close", () => {
					clearInterval(stallChecker);
					finish();
				});

				res.on("error", (err: Error) => {
					clearInterval(stallChecker);
					if (!done) {
						done = true;
						signal?.removeEventListener("abort", abortHandler);
						reject(err);
					}
				});
			},
		);

		req.on("error", (err) => {
			if (signal?.aborted) {
				reject(new DOMException("The user aborted a request.", "AbortError"));
				return;
			}
			const msg = "Не удалось подключиться к серверу. Проверьте URL и интернет-соединение.";
			new Notice(msg, 8000);
			reject(new Error(msg));
		});

		if (signal) {
			if (signal.aborted) {
				req.destroy();
				reject(new DOMException("The user aborted a request.", "AbortError"));
				return;
			}
			signal.addEventListener("abort", () => {
				req.destroy();
			}, { once: true });
		}

		req.write(bodyStr);
		req.end();
	});
}
