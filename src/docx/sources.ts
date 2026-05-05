import { requestUrl } from "obsidian";

const sourceCache = new Map<string, string>();

export async function formatSource(url: string): Promise<string> {
	const cached = sourceCache.get(url);
	if (cached) return cached;

	try {
		const { text } = await requestUrl(url);
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/html");
		const title = doc.querySelector("title")?.innerText;
		const result = !title
			? "Заголовок не найден"
			: `${title} [Электронный ресурс]. – Режим доступа: ${url} (дата обращения: ${new Date().toLocaleDateString()}).`;
		sourceCache.set(url, result);
		return result;
	} catch (error) {
		console.error("Ошибка при получении страницы:", error);
		const result = `Заголовок не найден (${url})`;
		sourceCache.set(url, result);
		return result;
	}
}

export function clearSourceCache(): void {
	sourceCache.clear();
}

export function getSourceCache(): Map<string, string> {
	return sourceCache;
}

export function setSourceCache(entries: Record<string, string>): void {
	for (const [k, v] of Object.entries(entries)) {
		sourceCache.set(k, v);
	}
}