import { bytesToBase64, hmacSha1 } from "../platformUtil";

/**
 * Minimal Aliyun (Alibaba Cloud) OSS request signing built on the Web Crypto
 * API. Replaces the Node-based `ali-oss` SDK so the plugin also runs in the
 * Obsidian mobile WebView.
 *
 * Signature format:
 *   Authorization: OSS <AccessKeyId>:<Base64(HMAC-SHA1(secret, stringToSign))>
 */

/** Options for signing a single OSS request. */
export interface SignOssRequestOptions {
    accessKeyId: string;
    accessKeySecret: string;
    method: string;
    /** Canonicalized resource, e.g. "/bucket/objectKey". */
    resource: string;
    /** Origin for presigned URLs, e.g. "https://oss-cn-hangzhou.aliyuncs.com". */
    baseUrl?: string;
    /** Request headers (lowercase keys), may include date / x-oss-*. */
    headers?: Record<string, string>;
    /** Date header value used in the string-to-sign. Defaults to now (UTC). */
    date?: string;
}

/**
 * Builds the OSS string-to-sign.
 *
 * @param method the HTTP verb
 * @param headers lowercase request headers (only x-oss-* are canonicalized)
 * @param resource the canonicalized resource
 * @param date the Date header value or the numeric Expires value (presigned)
 */
export function buildOssStringToSign(
    method: string,
    headers: Record<string, string>,
    resource: string,
    date: string
): string {
    const contentMd5 = headers["content-md5"] ?? "";
    const contentType = headers["content-type"] ?? "";

    const canonicalHeaders = Object.keys(headers)
        .filter((key) => key.startsWith("x-oss-"))
        .sort()
        .map((key) => `${key}:${headers[key]}\n`)
        .join("");

    return [method, contentMd5, contentType, date, canonicalHeaders + resource].join(
        "\n"
    );
}

/**
 * Computes the OSS Authorization header value for a request together with the
 * Date header that was used for signing (the request must send the same Date).
 *
 * @param options the signing options
 */
export async function signOssRequest(
    options: SignOssRequestOptions
): Promise<{ authorization: string; date: string }> {
    const date = options.date ?? new Date().toUTCString();
    const stringToSign = buildOssStringToSign(
        options.method,
        options.headers ?? {},
        options.resource,
        date
    );
    const signature = bytesToBase64(
        await hmacSha1(
            new TextEncoder().encode(options.accessKeySecret),
            stringToSign
        )
    );

    return {
        authorization: `OSS ${options.accessKeyId}:${signature}`,
        date,
    };
}

/**
 * Generates an OSS presigned GET URL.
 *
 * @param options the signing options
 * @param expiresInSeconds URL validity in seconds
 */
export async function signOssUrl(
    options: SignOssRequestOptions,
    expiresInSeconds: number
): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const stringToSign = buildOssStringToSign(
        options.method,
        {},
        options.resource,
        String(expires)
    );
    const signature = bytesToBase64(
        await hmacSha1(
            new TextEncoder().encode(options.accessKeySecret),
            stringToSign
        )
    );

    return (
        `${options.baseUrl}${options.resource}` +
        `?OSSAccessKeyId=${encodeURIComponent(options.accessKeyId)}` +
        `&Expires=${expires}` +
        `&Signature=${encodeURIComponent(signature)}`
    );
}
