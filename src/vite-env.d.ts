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
				stat: (path: string) => Promise<{ mtimeMs: number } | null>;
			};
			settings: {
				readJson: <T>(key: string) => Promise<T | null>;
				writeJson: (key: string, value: unknown) => Promise<void>;
				remove: (key: string) => Promise<void>;
			};
			zima?: {
				start: (config: {
					ipAddress: string;
					dataPort: number;
					commandPort: number;
					useCommandPort: boolean;
					useExternalGnss: boolean;
					latitude: number | null;
					longitude: number | null;
					azimuth: number | null;
				}) => Promise<unknown>;
				stop: () => Promise<unknown>;
				sendCommand: (command: string) => Promise<unknown>;
				status: () => Promise<unknown>;
				onData: (listener: (payload: { message?: string; receivedAt?: number }) => void) => () => void;
				onStatus: (listener: (payload: { status?: string }) => void) => () => void;
				onError: (listener: (payload: { message?: string }) => void) => () => void;
			};
			gnss?: {
				start: (config: {
					ipAddress: string;
					dataPort: number;
				}) => Promise<unknown>;
				stop: () => Promise<unknown>;
				status: () => Promise<unknown>;
				onData: (listener: (payload: { message?: string; receivedAt?: number }) => void) => () => void;
				onStatus: (listener: (payload: { status?: string }) => void) => () => void;
				onError: (listener: (payload: { message?: string }) => void) => () => void;
			};
			gnssCom?: {
				start: (config: {
					autoDetectPort: boolean;
					comPort: string;
					baudRate: number;
				}) => Promise<unknown>;
				stop: () => Promise<unknown>;
				status: () => Promise<unknown>;
				listPorts: () => Promise<Array<{ path?: string } | string>>;
				onData: (listener: (payload: { message?: string; receivedAt?: number; portPath?: string }) => void) => () => void;
				onStatus: (listener: (payload: { status?: string }) => void) => () => void;
				onError: (listener: (payload: { message?: string }) => void) => () => void;
			};
		};
	}
}

export {};
