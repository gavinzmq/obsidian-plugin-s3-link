import { EditorView, WidgetType } from "@codemirror/view";
import Config from "../config";

const MIN_WIDTH = 50;
const MIN_HEIGHT = 50;
const DEFAULT_MAX_HEIGHT = 400;

/**
 * Callbacks the editor plugin provides to a widget: gives the widget its
 * current document range and receives the final size when a drag-resize ends.
 */
export interface S3ImageWidgetController {
    getRange(): { from: number; to: number } | null;
    onResize(width: number, height: number): void;
}

/**
 * CodeMirror widget that renders an S3 image inline in the editor (live
 * preview). The image starts with the plugin's neutral placeholder and the
 * real resource URL is applied asynchronously once it has been resolved (from
 * the cache, or by downloading it from the storage).
 *
 * The raw `s3:` URL must never end up in the `src` attribute - the scheme is
 * not registered in the Electron renderer, so the browser (or the plugin's
 * placeholder guard) would replace/reject it.
 *
 * Interactions:
 * - Single-clicking the image keeps it visible (the cursor is not moved, so
 *   the image never disappears just by clicking it).
 * - Double-clicking places the cursor back on the link so the raw markdown
 *   becomes editable.
 * - Hovering shows a resize handle at the bottom-right corner; dragging it
 *   resizes the image and persists the new size back into the link
 *   (`![[s3:...|WxH]]` / `![alt|WxH](s3:...)`).
 */
export default class S3ImageWidget extends WidgetType {
    constructor(
        private readonly rawKey: string,
        private readonly resolver: (rawKey: string) => Promise<string>,
        private readonly initialSize: { width: number; height: number } | null,
        private readonly controller: S3ImageWidgetController
    ) {
        super();
    }

    eq(other: S3ImageWidget): boolean {
        return other.rawKey === this.rawKey;
    }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement("span");
        container.className = "s3-link-plugin-editor-image-wrap";
        container.style.position = "relative";
        container.style.display = "inline-block";
        container.style.verticalAlign = "middle";

        const image = document.createElement("img");
        image.className = "s3-link-plugin-editor-image";
        image.alt = "";
        image.style.display = "block";
        image.style.cursor = "pointer";
        image.src = Config.S3_LINK_PLACEHOLDER;

        // Render at the size stored in the link (`|W` or `|WxH`); otherwise use
        // a sensible fit (width 100%, capped height).
        if (this.initialSize) {
            image.style.maxWidth = "none";
            image.style.maxHeight = "none";
            image.style.width = `${this.initialSize.width}px`;
            image.style.height = this.initialSize.height
                ? `${this.initialSize.height}px`
                : "auto";
        } else {
            image.style.maxWidth = "100%";
            image.style.maxHeight = `${DEFAULT_MAX_HEIGHT}px`;
            image.style.objectFit = "contain";
        }

        const applySize = (width: number, height: number) => {
            image.style.maxWidth = "none";
            image.style.maxHeight = "none";
            image.style.width = `${width}px`;
            image.style.height = `${height}px`;
        };

        // A single click must keep the image visible: blocking the default
        // mousedown placement stops CodeMirror from moving the cursor into the
        // link, which would remove the widget decoration and make the image
        // disappear. Double-clicking reveals the raw markdown for editing.
        image.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        image.addEventListener("dblclick", (event) => {
            const pos = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
            });

            if (pos !== null) {
                view.dispatch({ selection: { anchor: pos, head: pos } });
            }
        });

        // --- drag-to-resize handle (native Obsidian style) -----------------
        // The committed size is written into the link brackets for the
        // markdown form (`![alt|WxH](url)`), matching how native Obsidian
        // stores image dimensions.
        const handle = document.createElement("div");
        handle.className = "s3-link-plugin-editor-resize-handle";
        handle.style.cssText = [
            "position:absolute",
            "bottom:2px",
            "right:2px",
            "width:16px",
            "height:16px",
            "cursor:nwse-resize",
            "display:none",
            "z-index:1",
        ].join(";");

        const notch = document.createElement("span");
        notch.style.cssText = [
            "position:absolute",
            "right:3px",
            "bottom:3px",
            "width:8px",
            "height:8px",
            "border-right:2px solid rgba(255,255,255,0.9)",
            "border-bottom:2px solid rgba(255,255,255,0.9)",
            "pointer-events:none",
        ].join(";");
        handle.appendChild(notch);

        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            dragging = true;
            handle.style.display = "block";
            startX = event.clientX;
            startY = event.clientY;
            startWidth = image.getBoundingClientRect().width;
            startHeight = image.getBoundingClientRect().height;
            handle.setPointerCapture(event.pointerId);
        });

        handle.addEventListener("pointermove", (event) => {
            if (!dragging) {
                return;
            }
            const width = Math.max(
                MIN_WIDTH,
                Math.round(startWidth + (event.clientX - startX))
            );
            const height = Math.max(
                MIN_HEIGHT,
                Math.round(startHeight + (event.clientY - startY))
            );
            applySize(width, height);
        });

        const finishResize = (event: PointerEvent) => {
            if (!dragging) {
                return;
            }
            dragging = false;
            if (handle.hasPointerCapture(event.pointerId)) {
                handle.releasePointerCapture(event.pointerId);
            }
            const width = Math.round(image.getBoundingClientRect().width);
            const height = Math.round(image.getBoundingClientRect().height);
            this.controller.onResize(width, height);
        };
        handle.addEventListener("pointerup", finishResize);
        handle.addEventListener("pointercancel", () => {
            dragging = false;
        });

        container.appendChild(image);
        container.appendChild(handle);

        container.addEventListener("mouseenter", () => {
            handle.style.display = "block";
        });
        container.addEventListener("mouseleave", () => {
            if (!dragging) {
                handle.style.display = "none";
            }
        });

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

        return container;
    }
}
