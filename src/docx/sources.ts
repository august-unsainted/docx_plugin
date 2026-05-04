import { requestUrl } from "obsidian";

export async function formatSource(url: string): Promise<string> {
	try {
		const { text } = await requestUrl(url);
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/html");
		const title = doc.querySelector("title")?.innerText;
		if (!title) return "Заголовок не найден";
		return `${title} [Электронный ресурс]. – Режим доступа: ${url} (дата обращения: ${new Date().toLocaleDateString()}).`;
	} catch (error) {
		console.error("Ошибка при получении страницы:", error);
		return `Заголовок не найден (${url})`;
	}
}