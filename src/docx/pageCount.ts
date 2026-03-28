import { Platform, Notice } from "obsidian";
import { exec } from "child_process";
import * as path from "path";

export async function getPageCount(
	filePath: string,
	vaultPath: string,
	closeAfter: boolean = true
): Promise<number | null> {
	const fullPath = path.join(vaultPath, filePath);

	await saveAndCloseInWord(fullPath, closeAfter);
	await sleep(1500);

	try {
		const buffer = require("fs").readFileSync(fullPath);
		const JSZip = (await import("jszip")).default;
		const zip = await JSZip.loadAsync(buffer);
		const appXml = await zip.file("docProps/app.xml")?.async("string");
		if (!appXml) return null;

		const match = appXml.match(/<Pages>(\d+)<\/Pages>/);
		return match ? parseInt(match[1]) : null;
	} catch (e) {
		console.error("Ошибка чтения страниц:", e);
		return null;
	}
}

function saveAndCloseInWord(fullPath: string, shouldClose: boolean = true): Promise<void> {
	return new Promise((resolve) => {
		let cmd: string;

		if (Platform.isWin) {
			const escaped = fullPath.replace(/'/g, "''");
			const closeCmd = shouldClose ? " $d.Close();" : "";
			cmd = `powershell -Command "try { $w = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application'); foreach($d in $w.Documents) { if($d.FullName -eq '${escaped}') { $d.Content.InsertAfter(' '); $d.Save(); Start-Sleep -Seconds 1; $d.Content.Characters($d.Content.Characters.Count).Delete(); $d.Save(); Start-Sleep -Seconds 1;${closeCmd} break } } } catch {}"`;
		} else if (Platform.isMacOS) {
			const closeCmd = shouldClose ? '\nclose document 1' : '';
			cmd = `osascript -e 'tell application "Microsoft Word"
				set r to end of text object of active document
				insert text " " at r
				save active document
				delay 1
				delete last character of text object of active document
				save active document
				delay 1${closeCmd}
			end tell'`;
		} else {
			resolve();
			return;
		}

		exec(cmd, (error) => {
			if (error) console.error("Word save/close error:", error);
			resolve();
		});
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}