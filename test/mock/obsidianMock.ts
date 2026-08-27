/**
 * Minimal runtime mock for the `obsidian` package (types-only package with an
 * empty "main", which jest cannot resolve). Only the symbols used at runtime
 * by the tested modules are provided.
 */
export class TFile {
    path: string;

    constructor(path: string) {
        this.path = path;
    }
}

export class FileSystemAdapter {}

export class Notice {}

export class Plugin {}

export class PluginSettingTab {}

export class App {}

export class MarkdownView {}

export class WorkspaceLeaf {}

export class Setting {}

export class Platform {}

export function normalizePath(p: string): string {
    return p;
}
