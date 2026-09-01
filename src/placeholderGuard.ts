import Config from "./config";

/**
 * Checks whether a raw `src` value uses the unregistered `s3:` / `s3-sign:`
 * scheme (the `s3:` protocol is not registered in the Electron renderer, so
 * the browser fails with `net::ERR_UNKNOWN_URL_SCHEME` when it tries to load
 * it).
 *
 * @param src the raw src attribute value
 */
export function isS3SchemeSrc(src: string): boolean {
    return (
        src.startsWith(
            `${Config.S3_LINK_PREFIX}${Config.S3_LINK_SPLITTER}`
        ) ||
        src.startsWith(
            `${Config.S3_SIGNED_LINK_PREFIX}${Config.S3_LINK_SPLITTER}`
        )
    );
}

/**
 * Neutralizes a media element whose `src` points to an unregistered s3: scheme:
 * images get a transparent placeholder, videos lose their `src`. The real
 * resource is set again by the post processor once it is available.
 *
 * @param target the element to check
 *
 * @returns true if the element was modified
 */
export function neutralizeS3Src(target: HTMLElement): boolean {
    const src = target.getAttribute("src");

    if (!src || !isS3SchemeSrc(src)) {
        return false;
    }

    if (target instanceof HTMLImageElement) {
        target.setAttribute("src", Config.S3_LINK_PLACEHOLDER);
        return true;
    }

    if (target instanceof HTMLVideoElement) {
        target.removeAttribute("src");
        return true;
    }

    return false;
}

/**
 * Observes the whole document and neutralizes any media `src` that is set to an
 * unregistered `s3:` / `s3-sign:` scheme. Obsidian (or other plugins / the
 * live-preview pipeline) can re-apply the raw s3: URL to media elements outside
 * of the post processor's synchronous replacement. Because the MutationObserver
 * callback runs before the browser actually loads the resource, this prevents
 * `net::ERR_UNKNOWN_URL_SCHEME`.
 *
 * @returns the observer (call `disconnect()` on unload)
 */
export function startPlaceholderGuard(): MutationObserver {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === "attributes") {
                neutralizeS3Src(mutation.target as HTMLElement);
            }
        }
    });

    observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
    });

    return observer;
}
