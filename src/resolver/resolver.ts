export default abstract class Resolver {
    /**
     * objectKeys of items that are supposed to be downloaded from S3
     */
    protected objectKeys = new Map<string, HTMLElement[]>();
    /**
     * objectKeys of items where a signed url is supposed to be generated
     */
    protected signObjectKeys = new Map<string, HTMLElement[]>();

    protected readonly s3LinkLeftPart = 0;
    protected readonly s3LinkRightPart = 1;
    protected abstract targetElement: string;

    public abstract resolveHtmlElement(element: HTMLElement): {
        objectKeys: Map<string, HTMLElement[]>;
        signObjectKeys: Map<string, HTMLElement[]>;
    };

    public abstract findAllObjectKeysInElement(element: HTMLElement): string[];

    /**
     * Strips an image-size suffix (`|400` / `|400x300`) that Obsidian appends
     * to the rendered src as a percent-encoded `%7C` segment (e.g.
     * `s3:images/x.jpeg%7C400x300`). The size is display metadata only and
     * must not be treated as part of the object key. This covers legacy links
     * written as `![](s3:...|WxH)`; for the Obsidian-native form
     * (`![alt|WxH](s3:...)`) Obsidian already strips the size from the src.
     *
     * @param rawKey the raw (possibly percent-encoded) key from the element
     */
    protected stripImageSizeSuffix(rawKey: string): string {
        let key = rawKey;

        try {
            key = decodeURIComponent(rawKey);
        } catch (error) {
            // Keep the raw key when it is not valid percent-encoding.
        }

        return key.replace(/\|\d+(?:x\d+)?$/, "");
    }

    protected addObjectKey(objectKey: string, htmlElement: HTMLElement) {
        if (this.objectKeys.has(objectKey)) {
            this.objectKeys.get(objectKey)?.push(htmlElement);
        } else {
            this.objectKeys.set(objectKey, [htmlElement]);
        }
    }

    protected addSignObjectKey(objectKey: string, htmlElement: HTMLElement) {
        if (this.signObjectKeys.has(objectKey)) {
            this.signObjectKeys.get(objectKey)?.push(htmlElement);
        } else {
            this.signObjectKeys.set(objectKey, [htmlElement]);
        }
    }

    protected clearObjectKeys() {
        this.objectKeys.clear();
    }

    protected clearSignObjectKeys() {
        this.signObjectKeys.clear();
    }
}
