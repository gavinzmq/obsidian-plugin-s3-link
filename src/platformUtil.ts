import { Platform } from "obsidian";

/**
 * Platform helpers that remove the dependency on Node.js built-ins
 * (`fs`, `path`, `stream`, `crypto`) so the plugin also runs in the Obsidian
 * mobile app (Capacitor WebView) where Node is not available.
 *
 * Desktop (Electron renderer) and mobile both provide the Web Crypto API,
 * TextEncoder, fetch and the Obsidian Vault adapter abstraction, so these
 * helpers work on both platforms.
 */

/**
 * True when the plugin runs in Obsidian Mobile. The mobile adapter does not
 * provide `getBasePath()` / `getFilePath()` (no `file://` URLs), so the code
 * must use the Vault resource path instead.
 */
export function isMobile(): boolean {
    return typeof Platform !== "undefined" && Platform.isMobile === true;
}

/**
 * Computes the hex-encoded SHA-1 digest of the given input using the Web
 * Crypto API. Used to derive cache file names from the version token.
 *
 * @param input the string or bytes to hash
 */
export async function sha1Hex(input: string | Uint8Array): Promise<string> {
    const data =
        typeof input === "string" ? new TextEncoder().encode(input) : input;
    const digest = await crypto.subtle.digest("SHA-1", data);
    return bytesToHex(new Uint8Array(digest));
}

/**
 * Computes the hex-encoded SHA-256 digest of the given input using the Web
 * Crypto API. Used by AWS SigV4 and Aliyun OSS request signing.
 *
 * @param input the string or bytes to hash
 */
export async function sha256Hex(
    input: string | Uint8Array
): Promise<string> {
    const data =
        typeof input === "string" ? new TextEncoder().encode(input) : input;
    const digest = await crypto.subtle.digest("SHA-256", data);
    return bytesToHex(new Uint8Array(digest));
}

/**
 * Computes an HMAC-SHA256 signature over the given data using the Web Crypto
 * API. Used by AWS SigV4 request signing.
 *
 * @param key the raw HMAC key bytes
 * @param data the data to sign
 */
export async function hmacSha256(
    key: Uint8Array,
    data: string
): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(data)
    );
    return new Uint8Array(signature);
}

/**
 * Computes an HMAC-SHA1 signature over the given data using the Web Crypto
 * API. Used by Aliyun OSS request signing.
 *
 * @param key the raw HMAC key bytes
 * @param data the data to sign
 */
export async function hmacSha1(
    key: Uint8Array,
    data: string
): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(data)
    );
    return new Uint8Array(signature);
}

/**
 * Converts bytes to a lowercase hex string (replacement for
 * `Buffer.toString("hex")`).
 *
 * @param bytes the bytes to convert
 */
export function bytesToHex(bytes: Uint8Array): string {
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
}

/**
 * Converts bytes to a Base64 string (replacement for
 * `Buffer.toString("base64")`). Used for OSS request signatures.
 *
 * @param bytes the bytes to convert
 */
export function bytesToBase64(bytes: Uint8Array): string {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";

    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;

        result += chars[b0 >> 2];
        result += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
        result +=
            i + 1 < bytes.length ? chars[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
        result += i + 2 < bytes.length ? chars[b2 & 0x3f] : "=";
    }

    return result;
}

/**
 * Returns the file extension (including the leading dot) of a path, or an
 * empty string when the path has no extension. Replacement for
 * `path.extname`.
 *
 * @param path the file path or object key
 */
export function getFileExtension(path: string): string {
    const lastSlash = Math.max(
        path.lastIndexOf("/"),
        path.lastIndexOf("\\")
    );
    const lastDot = path.lastIndexOf(".");

    if (lastDot <= lastSlash) {
        return "";
    }

    return path.substring(lastDot);
}

/**
 * Joins vault-relative path segments with "/". Replacement for `path.join`
 * on vault paths.
 *
 * @param segments the path segments
 */
export function joinVaultPath(...segments: string[]): string {
    return segments
        .filter((segment) => segment && segment.length > 0)
        .map((segment, index) =>
            index === 0
                ? segment
                : segment.replace(/^\/+/, "").replace(/\/+$/, "")
        )
        .join("/");
}

/**
 * Collects an async iterable of bytes (e.g. a Node Readable or a browser
 * ReadableStream) into a single Uint8Array. The mobile Vault API writes
 * binary files as a whole buffer instead of a stream, so the content has to
 * be buffered before it can be persisted.
 *
 * @param stream the byte stream to collect
 */
export async function streamToUint8Array(
    stream: AsyncIterable<Uint8Array>
): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    for await (const chunk of stream) {
        const bytes =
            chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        chunks.push(bytes);
        totalLength += bytes.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}
