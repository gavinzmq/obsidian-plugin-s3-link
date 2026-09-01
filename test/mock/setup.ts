import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";

/**
 * Jest setup: the jsdom environment exposes a `crypto` object without the
 * `subtle` API and no global TextEncoder. The plugin code (cache hashing,
 * SigV4 / OSS signing) relies on both, so we install the Node equivalents.
 */
if (typeof globalThis.TextEncoder === "undefined") {
    Object.defineProperty(globalThis, "TextEncoder", {
        value: TextEncoder,
        writable: true,
    });
}

if (!globalThis.crypto || !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, "crypto", {
        value: webcrypto,
        writable: true,
    });
}
