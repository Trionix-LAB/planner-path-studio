/// <reference types="vite/client" />

declare global {
	interface Window {
		electronAPI?: {
			pickDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>;
			fileStore: {
				exists: (path: string) => Promise<boolean>;
				readText: (path: string) => Promise<string | null>;
				writeText: (path: string, content: string) => Promise<void>;
				remove: (path: string) => Promise<void>;
				list: (prefix: string) => Promise<string[]>;
			};
			settings: {
				readJson: <T>(key: string) => Promise<T | null>;
				writeJson: (key: string, value: unknown) => Promise<void>;
				remove: (key: string) => Promise<void>;
			};
		};
	}
}

export {};
