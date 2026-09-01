import { bytesToHex, hmacSha256, sha256Hex } from "../platformUtil";

/**
 * Minimal AWS Signature Version 4 (SigV4) implementation built on the Web
 * Crypto API. Replaces the `@aws-sdk/*` signing pipeline so the plugin works
 * in the Obsidian mobile WebView (no Node.js crypto) as well as on desktop.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

/** Options for signing a single request with SigV4 headers. */
export interface SignV4RequestOptions {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Signing service name, defaults to "s3". */
    service?: string;
    /** HTTP method, e.g. "GET" or "HEAD". */
    method: string;
    /** Lowercase host, e.g. "s3.us-east-1.amazonaws.com". */
    host: string;
    /** Already URI-encoded request path starting with "/". */
    path: string;
    /** Optional query parameters (raw values, will be encoded). */
    query?: Record<string, string>;
    /** Additional headers (values as-is; names must be lowercase). */
    headers?: Record<string, string>;
    /** Hex-encoded SHA-256 of the request payload. */
    payloadHash: string;
    date?: Date;
}

/** Options for generating a SigV4 presigned GET URL. */
export interface PresignV4Options {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Signing service name, defaults to "s3". */
    service?: string;
    /** Lowercase host. */
    host: string;
    /** Already URI-encoded request path starting with "/". */
    path: string;
    /** Optional extra query parameters. */
    query?: Record<string, string>;
    /** URL validity in seconds. */
    expiresIn: number;
    date?: Date;
}

/**
 * Percent-encodes a string according to the SigV4 rules: unreserved
 * characters (A-Z a-z 0-9 - _ . ~) are kept, everything else is UTF-8
 * percent-encoded. Slashes are kept when `encodeSlash` is false (path).
 */
export function uriEncode(input: string, encodeSlash: boolean): string {
    let result = "";
    for (const char of input) {
        if (/[A-Za-z0-9\-_.~]/.test(char)) {
            result += char;
        } else if (char === "/" && !encodeSlash) {
            result += "/";
        } else {
            const bytes = new TextEncoder().encode(char);
            for (const byte of bytes) {
                result += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
            }
        }
    }
    return result;
}

/**
 * URI-encodes an S3 object key for use in the request path. Slashes are kept
 * as path separators.
 *
 * @param key the object key
 */
export function encodeS3PathKey(key: string): string {
    return uriEncode(key, false);
}

function toDateStamp(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function toAmzDate(date: Date): string {
    return date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
}

function canonicalizeQuery(query: Record<string, string>): string {
    return Object.keys(query)
        .sort()
        .map(
            (key) =>
                `${uriEncode(key, true)}=${uriEncode(query[key], true)}`
        )
        .join("&");
}

async function deriveSigningKey(
    secretAccessKey: string,
    dateStamp: string,
    region: string,
    service: string
): Promise<Uint8Array> {
    const kDate = await hmacSha256(
        new TextEncoder().encode(`AWS4${secretAccessKey}`),
        dateStamp
    );
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    return hmacSha256(kService, "aws4_request");
}

/**
 * Signs a request with SigV4 and returns the headers to send, including
 * `x-amz-date` and `Authorization`.
 *
 * @param options the signing options
 */
export async function signRequestV4(
    options: SignV4RequestOptions
): Promise<Record<string, string>> {
    const date = options.date ?? new Date();
    const amzDate = toAmzDate(date);
    const dateStamp = toDateStamp(date);
    const service = options.service ?? SERVICE;
    const scope = `${dateStamp}/${options.region}/${service}/aws4_request`;

    const headers: Record<string, string> = {
        host: options.host,
        "x-amz-date": amzDate,
        ...(options.headers ?? {}),
    };

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
        .map((name) => `${name}:${headers[name]}`)
        .join("\n");
    const signedHeaders = signedHeaderNames.join(";");

    const canonicalRequest = [
        options.method,
        options.path,
        canonicalizeQuery(options.query ?? {}),
        `${canonicalHeaders}\n`,
        signedHeaders,
        options.payloadHash,
    ].join("\n");

    const stringToSign = [
        ALGORITHM,
        amzDate,
        scope,
        await sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = await deriveSigningKey(
        options.secretAccessKey,
        dateStamp,
        options.region,
        service
    );
    const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

    return {
        ...headers,
        Authorization:
            `${ALGORITHM} Credential=${options.accessKeyId}/${scope}, ` +
            `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
}

/**
 * Generates a SigV4 presigned GET URL for the given object.
 *
 * @param options the presigning options
 */
export async function presignGetV4(
    options: PresignV4Options
): Promise<string> {
    const date = options.date ?? new Date();
    const amzDate = toAmzDate(date);
    const dateStamp = toDateStamp(date);
    const service = options.service ?? SERVICE;
    const scope = `${dateStamp}/${options.region}/${service}/aws4_request`;

    const query: Record<string, string> = {
        ...(options.query ?? {}),
        "X-Amz-Algorithm": ALGORITHM,
        "X-Amz-Credential": `${options.accessKeyId}/${scope}`,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": String(options.expiresIn),
        "X-Amz-SignedHeaders": "host",
    };

    const canonicalQuery = canonicalizeQuery(query);
    const canonicalRequest = [
        "GET",
        options.path,
        canonicalQuery,
        `host:${options.host}\n`,
        "host",
        "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
        ALGORITHM,
        amzDate,
        scope,
        await sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = await deriveSigningKey(
        options.secretAccessKey,
        dateStamp,
        options.region,
        service
    );
    const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

    return `https://${options.host}${options.path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
