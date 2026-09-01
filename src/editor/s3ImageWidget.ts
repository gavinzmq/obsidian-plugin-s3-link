import { EditorView, WidgetType } from "@codemirror/view";
import Config from "../config";

const MIN_WIDTH = 50;
const MIN_HEIGHT = 50;
const DEFAULT_MAX_HEIGHT = 400;

// Lucide icons matching native Obsidian's image hover actions: an expand
// (zoom) button and a pen (edit) button.
const ZOOM_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';
const EDIT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';

/**
 * Creates a small icon button used for the hover actions (zoom / edit).
 * The mousedown is blocked so clicking the button never moves the cursor into
 * the link (which would make the image disappear before the action runs).
 */
function createActionButton(
    svg: string,
    title: string,
    onClick: () => void
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.style.cssText = [
        "width:20px",
        "height:20px",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "border:none",
        "border-radius:4px",
        "padding:0",
        "background:rgba(0,0,0,0.5)",
        "color:#fff",
        "cursor:pointer",
        "box-shadow:0 1px 3px rgba(0,0,0,0.4)",
        "transition:background 0.15s ease",
    ].join(";");
    button.innerHTML = svg;

    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(0,0,0,0.75)";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "rgba(0,0,0,0.5)";
    });

    button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });

    return button;
}

/**
 * Callbacks the editor plugin provides to a widget: gives the widget its
 * current document range and receives the final size when a drag-resize ends.
 */
export interface S3ImageWidgetController {
    getRange(): { from: number; to: number } | null;
    onResize(width: number, height: number): void;
}

/**
 * Opens a full-size overlay preview of an image. Clicking anywhere on the
 * overlay (or pressing Escape) closes it. Shared by the inline image widget
 * (hover Zoom action) and the clickable plain wiki-link widget.
 *
 * @param src the image URL to display
 */
export function showImageZoom(src: string) {
    const overlay = document.createElement("div");
    overlay.className = "s3-link-plugin-editor-zoom-overlay";
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:1000",
        "background:rgba(0,0,0,0.65)",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "cursor:zoom-out",
    ].join(";");

    const zoomImg = document.createElement("img");
    zoomImg.style.cssText = [
        "max-width:90vw",
        "max-height:90vh",
        "object-fit:contain",
        "border-radius:4px",
        "box-shadow:0 4px 32px rgba(0,0,0,0.5)",
    ].join(";");
    zoomImg.src = src;
    overlay.appendChild(zoomImg);

    const close = () => overlay.remove();
    overlay.addEventListener("click", close);
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            close();
        }
    });

    document.body.appendChild(overlay);
    overlay.tabIndex = -1;
    overlay.focus();
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
 * Interactions (mirroring native Obsidian):
 * - Single-clicking the image keeps it visible (the cursor is not moved, so
 *   the image never disappears just by clicking it).
 * - Hovering shows action buttons at the top-right corner:
 *   - Zoom: opens a full-size overlay preview of the image.
 *   - Edit: moves the cursor into the link so the raw markdown becomes
 *     editable (the image is replaced by the markdown source).
 * - Hovering also shows a resize handle at the bottom-right corner; dragging
 *   it resizes the image and persists the new size back into the link
 *   (`![[s3:...|WxH]]` / `![alt|WxH](s3:...)`).
 */
export default class S3ImageWidget extends WidgetType {
    /**
     * The resolved resource URL, stored once the async resolver returns so the
     * zoom overlay can show the real image even before it finished painting.
     */
    private resolvedUrl = "";

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
        // disappear. Editing is triggered explicitly via the edit button.
        image.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
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

        // --- hover action buttons (top-right, native Obsidian style) ------
        const actions = document.createElement("div");
        actions.className = "s3-link-plugin-editor-image-actions";
        actions.style.cssText = [
            "position:absolute",
            "top:4px",
            "right:4px",
            "display:none",
            "gap:4px",
            "z-index:2",
        ].join(";");

        const zoomBtn = createActionButton(ZOOM_ICON_SVG, "放大", () => {
            showImageZoom(this.resolvedUrl || image.src);
        });

        // --- self-contained link editor -----------------------------------
        // Obsidian keeps image embeds rendered even when the caret enters the
        // link (no public API flips it to editable source), so trying to
        // reveal the markdown via a synthetic selection never works and ends
        // up showing a broken placeholder. Instead the "edit" action opens a
        // textarea below the image pre-filled with the full markdown link;
        // Enter / blur commits it back into the document, Escape cancels. The
        // image stays visible the whole time and no placeholder appears.
        const editor = document.createElement("textarea");
        editor.className = "s3-link-plugin-editor-link-edit";
        editor.style.cssText = [
            "display:none",
            "width:100%",
            "min-width:320px",
            "box-sizing:border-box",
            "margin-top:6px",
            "padding:6px 8px",
            "font-family:var(--font-monospace)",
            "font-size:12px",
            "line-height:1.5",
            "color:var(--text-normal)",
            "background:var(--background-secondary)",
            "border:1px solid var(--background-modifier-border)",
            "border-radius:4px",
            "resize:vertical",
            "z-index:3",
        ].join(";");

        let editing = false;

        const endEdit = (commit: boolean) => {
            if (!editing) {
                return;
            }

            editing = false;
            editor.style.display = "none";
            container.style.display = "inline-block";

            if (commit) {
                const range = this.controller.getRange();

                if (range) {
                    const current = view.state.doc.sliceString(
                        range.from,
                        range.to
                    );
                    const next = editor.value;

                    if (next !== current) {
                        view.dispatch({
                            changes: {
                                from: range.from,
                                to: range.to,
                                insert: next,
                            },
                        });
                    }
                }
            }

            actions.style.display = "flex";
            handle.style.display = "block";
        };

        const startEdit = () => {
            const range = this.controller.getRange();

            if (!range) {
                return;
            }

            editing = true;
            editor.value = view.state.doc.sliceString(range.from, range.to);
            actions.style.display = "none";
            handle.style.display = "none";
            container.style.display = "inline-flex";
            container.style.flexDirection = "column";
            editor.style.display = "block";
            editor.focus();
            editor.select();
        };

        editor.addEventListener("mousedown", (event) => {
            // Keep the caret inside the textarea; don't let CodeMirror move it
            // into the link (which would drop the widget mid-edit).
            event.stopPropagation();
        });
        editor.addEventListener("keydown", (event) => {
            event.stopPropagation();

            if (event.key === "Enter") {
                event.preventDefault();
                endEdit(true);
            } else if (event.key === "Escape") {
                event.preventDefault();
                endEdit(false);
            }
        });
        editor.addEventListener("blur", () => {
            endEdit(true);
        });

        const editBtn = createActionButton(EDIT_ICON_SVG, "编辑", () => {
            startEdit();
        });
        actions.appendChild(zoomBtn);
        actions.appendChild(editBtn);

        container.appendChild(image);
        container.appendChild(editor);
        container.appendChild(actions);
        container.appendChild(handle);

        container.addEventListener("mouseenter", () => {
            actions.style.display = "flex";
            handle.style.display = "block";
        });
        container.addEventListener("mouseleave", () => {
            if (!dragging) {
                actions.style.display = "none";
                handle.style.display = "none";
            }
        });

        this.resolver(this.rawKey)
            .then((url) => {
                // The widget may already be detached if the user edited the
                // document while the image was resolving.
                if (url) {
                    this.resolvedUrl = url;

                    if (image.isConnected) {
                        image.src = url;
                    }
                }
            })
            .catch(() => {
                // Keep the placeholder; the image cannot be resolved.
            });

        return container;
    }
}
