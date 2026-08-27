import Config from "../config";
import { Language } from "../i18n";

const moduleName = "Settings";

export interface StorageSource {
    id: string;
    name: string;
    provider: string;
    endpoint: string;
    bucketName: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    pathStyle: boolean;
    defaultSource: boolean;
    signLinkEnabled: boolean;
}

export interface PluginSettings {
    sources: StorageSource[];
    language: Language;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    sources: [],
    language: "en",
};

/**
 * Creates a new default storage source. Used for the "Add Source" action and
 * to guarantee that at least one source exists.
 */
export function createDefaultSource(): StorageSource {
    return {
        id: generateSourceId(),
        name: "Default",
        provider: Config.PROVIDERS.AWS,
        endpoint: "",
        bucketName: "",
        region: "",
        accessKeyId: "",
        secretAccessKey: "",
        pathStyle: false,
        defaultSource: true,
        signLinkEnabled: true,
    };
}

/**
 * Generates a unique id for a storage source.
 */
export function generateSourceId(): string {
    return `source-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Detects whether the given settings data uses the legacy (v1) single AWS
 * source format (top-level bucketName/region/accessKeyId/... fields).
 */
export function isLegacySettings(data: unknown): boolean {
    return (
        data !== null &&
        typeof data === "object" &&
        (data as Record<string, unknown>).bucketName !== undefined
    );
}

/**
 * Migrates legacy (v1) settings into the new StorageSource based model.
 *
 * @param data the legacy settings object
 */
export function migrateLegacySettings(
    data: Record<string, unknown>
): PluginSettings {
    const source: StorageSource = {
        id: generateSourceId(),
        name: "Default",
        provider: Config.PROVIDERS.AWS,
        endpoint: "",
        bucketName: (data.bucketName as string) || "",
        region: (data.region as string) || "",
        accessKeyId: (data.accessKeyId as string) || "",
        secretAccessKey: (data.secretAccessKey as string) || "",
        pathStyle: false,
        defaultSource: true,
        signLinkEnabled: true,
    };

    return { sources: [source], language: "en" };
}

/**
 * Resolves a raw object key (optionally prefixed with `<sourceName>/`) to the
 * owning storage source and the plain object key. Links without a prefix use
 * the default source.
 *
 * @param settings the plugin settings
 * @param rawKey the raw object key as written in the markdown link
 */
export function resolveSourceKey(
    settings: PluginSettings,
    rawKey: string
): { sourceId: string; objectKey: string } {
    const defaultSource = settings.sources.find(
        (source) => source.defaultSource
    );
    const parts = rawKey.split(Config.SOURCE_SPLITTER);

    if (parts.length > 1) {
        const matchedSource = settings.sources.find(
            (source) => source.name === parts[0]
        );

        if (matchedSource) {
            return {
                sourceId: matchedSource.id,
                objectKey: parts.slice(1).join("/"),
            };
        }
    }

    return {
        sourceId: defaultSource ? defaultSource.id : "",
        objectKey: rawKey,
    };
}

/**
 * Returns the endpoint used for the given source. For known providers the
 * endpoint is composed from the region; for S3-compatible sources the custom
 * endpoint is returned (the AWS SDK uses its default endpoint when empty).
 *
 * @param source the storage source
 */
export function getComposedEndpoint(source: StorageSource): string {
    switch (source.provider) {
        case Config.PROVIDERS.TENCENT_COS:
            return source.region
                ? `https://cos.${source.region}.myqcloud.com`
                : "";
        case Config.PROVIDERS.ALIYUN_OSS:
            return source.region
                ? `https://oss-${source.region}.aliyuncs.com`
                : "";
        default:
            return source.endpoint;
    }
}

/**
 * True for providers whose endpoint is composed automatically and should not
 * be entered by the user (AWS S3, Tencent Cloud COS, Aliyun OSS).
 *
 * @param source the storage source
 */
export function isKnownProvider(source: StorageSource): boolean {
    return (
        source.provider === Config.PROVIDERS.AWS ||
        source.provider === Config.PROVIDERS.TENCENT_COS ||
        source.provider === Config.PROVIDERS.ALIYUN_OSS
    );
}

export function isPluginReadyState(settings: PluginSettings): boolean {
    if (!settings.sources || settings.sources.length === 0) {
        console.info(
            `${moduleName} - Settings is not in valid state, no storage sources configured`
        );

        return false;
    }

    for (const source of settings.sources) {
        if (source.bucketName === "") {
            console.info(
                `${moduleName} - Settings is not in valid state, bucketName is empty for source ${source.name}`
            );

            return false;
        }

        if (
            source.provider === Config.PROVIDERS.TENCENT_COS ||
            source.provider === Config.PROVIDERS.ALIYUN_OSS
        ) {
            if (source.region === "") {
                console.info(
                    `${moduleName} - Settings is not in valid state, region is empty for source ${source.name}`
                );

                return false;
            }
        } else if (source.provider === Config.PROVIDERS.S3_COMPATIBLE) {
            if (source.endpoint === "") {
                console.info(
                    `${moduleName} - Settings is not in valid state, endpoint is empty for source ${source.name}`
                );

                return false;
            }
        }

        if (source.accessKeyId === "" || source.secretAccessKey === "") {
            console.info(
                `${moduleName} - Settings is not in valid state, credentials are missing for source ${source.name}`
            );

            return false;
        }
    }

    return true;
}

