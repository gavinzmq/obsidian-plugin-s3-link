import Config from "./config";
import { StorageSource } from "./settings/settings";

interface SourceHostRule {
    source: StorageSource;
    hostSuffixes: string[];
}

interface UrlMatch {
    source: StorageSource;
    objectKey: string;
}

const URL_REGEX = /https?:\/\/[^\s)\]}>"'，。]+/g;
const FENCE_REGEX = /```[\s\S]*?(?:```|$)/g;

/**
 * Extracts the hostname from a URL or bare endpoint (adds https:// if missing).
 */
function extractHost(urlOrEndpoint: string): string {
    if (!urlOrEndpoint) {
        return "";
    }

    try {
        return new URL(urlOrEndpoint).hostname;
    } catch (error) {
        try {
            return new URL(`https://${urlOrEndpoint}`).hostname;
        } catch (err) {
            return "";
        }
    }
}

/**
 * Builds the host suffix rules for all configured sources. Known providers
 * (AWS / Tencent COS / Aliyun OSS) use the region based endpoint host, custom
 * S3-compatible sources use the configured endpoint host.
 */
function buildRules(sources: StorageSource[]): SourceHostRule[] {
    const rules: SourceHostRule[] = [];

    for (const source of sources) {
        const hostSuffixes: string[] = [];

        if (source.provider === Config.PROVIDERS.TENCENT_COS) {
            if (source.region) {
                hostSuffixes.push(`cos.${source.region}.myqcloud.com`);
            }
        } else if (source.provider === Config.PROVIDERS.ALIYUN_OSS) {
            if (source.region) {
                hostSuffixes.push(`oss-${source.region}.aliyuncs.com`);
            }
            hostSuffixes.push("oss.aliyuncs.com");
        } else if (source.provider === Config.PROVIDERS.AWS) {
            if (source.region) {
                hostSuffixes.push(`s3.${source.region}.amazonaws.com`);
                hostSuffixes.push(`s3-${source.region}.amazonaws.com`);
            }
            hostSuffixes.push("s3.amazonaws.com");
        } else if (source.provider === Config.PROVIDERS.S3_COMPATIBLE) {
            const host = extractHost(source.endpoint);
            if (host) {
                hostSuffixes.push(host);
            }
        }

        if (hostSuffixes.length > 0) {
            rules.push({ source, hostSuffixes });
        }
    }

    return rules;
}

/**
 * Matches a URL against the configured sources and extracts the object key.
 * Supports both virtual-hosted (`https://<bucket>.<host>/<key>`) and path-style
 * (`https://<host>/<bucket>/<key>`) addressing.
 */
function matchUrl(
    url: string,
    rules: SourceHostRule[]
): UrlMatch | null {
    let hostname = "";
    let pathname = "";

    try {
        const parsed = new URL(url);
        hostname = parsed.hostname;
        pathname = parsed.pathname.replace(/^\/+/, "");
    } catch (error) {
        return null;
    }

    for (const rule of rules) {
        for (const suffix of rule.hostSuffixes) {
            if (hostname === suffix) {
                // path-style: https://host/<bucket>/<key>
                const slash = pathname.indexOf("/");
                const bucket =
                    slash === -1 ? pathname : pathname.substring(0, slash);
                const key =
                    slash === -1 ? "" : pathname.substring(slash + 1);

                if (bucket === rule.source.bucketName && key) {
                    return { source: rule.source, objectKey: key };
                }
            } else if (hostname.endsWith(`.${suffix}`)) {
                // virtual-hosted: https://<bucket>.<host>/<key>
                const bucket = hostname.substring(
                    0,
                    hostname.length - suffix.length - 1
                );
                const key = pathname;

                if (bucket === rule.source.bucketName && key) {
                    return { source: rule.source, objectKey: key };
                }
            }
        }
    }

    return null;
}

/**
 * Converts an object key of the given source into the plugin's s3: link format.
 * The source name prefix is only included for non-default sources.
 */
function toS3Link(source: StorageSource, objectKey: string): string {
    const prefix = source.defaultSource ? "" : `${source.name}/`;

    return `${Config.S3_LINK_PREFIX}${Config.S3_LINK_SPLITTER}${prefix}${objectKey}`;
}

function replaceUrlsInText(
    text: string,
    rules: SourceHostRule[]
): string {
    return text.replace(URL_REGEX, (match) => {
        const trimmed = match.replace(/[.,;:!?]+$/, "");
        const result = matchUrl(trimmed, rules);

        if (result) {
            return toS3Link(result.source, result.objectKey);
        }

        return match;
    });
}

/**
 * Replaces https:// URLs that match the configured storage sources with the
 * plugin's `s3:` link format. Fenced code blocks are left untouched.
 *
 * @param content the markdown content
 * @param sources the configured storage sources
 */
export function replaceRemoteUrls(
    content: string,
    sources: StorageSource[]
): string {
    const rules = buildRules(sources);

    if (rules.length === 0) {
        return content;
    }

    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = FENCE_REGEX.exec(content)) !== null) {
        result += replaceUrlsInText(
            content.slice(lastIndex, match.index),
            rules
        );
        result += match[0];
        lastIndex = match.index + match[0].length;
    }

    result += replaceUrlsInText(content.slice(lastIndex), rules);

    return result;
}
