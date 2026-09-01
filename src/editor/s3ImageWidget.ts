import { WidgetType } from "@codemirror/view";
import Config from "../config";

/**
 * CodeMirror widget that renders an S3 image inline in the editor (live
 * preview). The image starts with the plugin's neutral placeholder and the
 * real resource URL is applied asynchronously once it has been resolved (from
 * the cache, or by downloading it from the storage).
 *
 * The raw `s3:` URL must never end up in the `src` attribute - the scheme is
 * not registered in the Electron renderer, so the browser (or the plugin's
 * placeholder guard) would replace/reject it.
 */
export default class S3ImageWidget extends WidgetType {
    constructor(
        private readonly rawKey: string,
        private readonly resolver: (rawKey: string) => Promise<string>
    ) {
        super();
    }

    eq(other: S3ImageWidget): boolean {
        return other.rawKey === this.rawKey;
    }

    toDOM(): HTMLElement {
        const image = document.createElement("img");
        image.className = "s3-link-plugin-editor-image";
        image.alt = "";
        // Keep inline images usable in the editor without letting large files
        // blow up the layout (the reading view applies its own styles).
        image.style.maxWidth = "100%";
        image.style.maxHeight = "400px";
        image.style.objectFit = "contain";
        image.style.verticalAlign = "middle";
        image.src = Config.S3_LINK_PLACEHOLDER;

        this.resolver(this.rawKey)
            .then((url) => {
                // The widget may already be detached if the user edited the
                // document while the image was resolving.
                if (url && image.isConnected) {
                    image.src = url;
                }
            })
            .catch(() => {
                // Keep the placeholder; the image cannot be resolved.
            });

        return image;
    }
}
