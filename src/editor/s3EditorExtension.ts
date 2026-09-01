import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
} from "@codemirror/view";
import { Extension, Prec, RangeSetBuilder } from "@codemirror/state";
import { editorLivePreviewField } from "obsidian";
import { Logger } from "../logger";
import S3LinkPlugin from "../main";
import S3ImageWidget, {
    S3ImageWidgetController,
} from "./s3ImageWidget";

/**
 * Matches markdown image embeds whose destination uses the plugin's custom
 * `s3:` / `s3-sign:` scheme, both the `![](...)` and the `![[...]]`
 * (wiki embed) form.
 */
const S3_IMAGE_LINK_REGEX =
    /!\[[^\]]*\]\(\s*(s3-sign:|s3:)[^\s)]*\s*\)|!\[\[(s3-sign:|s3:)[^\]]*\]\]/g;

/**
 * Extracts the scheme-qualified key from a matched image embed, e.g.
 * `![](s3:images/x.jpeg)` -> `s3:images/x.jpeg` and
 * `![[s3-sign:bucket/foo.png]]` -> `s3-sign:bucket/foo.png`.
 *
 * Any image-size suffix (`|400` / `|400x300`) is stripped so the object key
 * stays clean.
 *
 * @param match the full matched text
 */
function extractSchemeKey(match: string): string {
    let inner: string;

    if (match.startsWith("![[")) {
        inner = match.slice(3, -2);
    } else {
        const open = match.indexOf("](");
        inner = match.slice(open + 2, -1);
    }

    inner = inner.trim();
    const pipe = inner.indexOf("|");

    return pipe >= 0 ? inner.slice(0, pipe) : inner;
}

/**
 * Parses an explicit image size stored in a matched link, e.g.
 * `![[s3:...|400]]` -> `{ width: 400, height: 0 }` and
 * `![[s3:...|400x300]]` -> `{ width: 400, height: 300 }`. Returns null when
 * the link carries no size (height 0 means auto / proportional).
 *
 * @param match the full matched text
 */
function extractSize(
    match: string
): { width: number; height: number } | null {
    let inner: string;

    if (match.startsWith("![[")) {
        inner = match.slice(3, -2);
    } else {
        const open = match.indexOf("](");
        inner = match.slice(open + 2, -1);
    }

    const pipe = inner.indexOf("|");

    if (pipe < 0) {
        return null;
    }

    const sizeMatch = /^\s*(\d+)(?:x(\d+))?/.exec(inner.slice(pipe + 1));

    if (!sizeMatch) {
        return null;
    }

    return {
        width: parseInt(sizeMatch[1], 10),
        height: sizeMatch[2] ? parseInt(sizeMatch[2], 10) : 0,
    };
}

/**
 * Rewrites a matched image link so it carries an explicit size, e.g.
 * `![](s3:images/x.jpeg)` -> `![](s3:images/x.jpeg|400x300)`. An existing
 * size segment is replaced in place (before any `|alt` suffix).
 *
 * @param matchText the full matched text
 * @param width the new width in pixels
 * @param height the new height in pixels
 */
function setLinkSize(matchText: string, width: number, height: number): string {
    const size = `|${Math.round(width)}x${Math.round(height)}`;
    const isWiki = matchText.startsWith("![[");

    let inner: string;
    if (isWiki) {
        inner = matchText.slice(3, -2);
    } else {
        const open = matchText.indexOf("](");
        const close = matchText.lastIndexOf(")");
        inner = matchText.slice(open + 2, close);
    }

    // `url|size|alt` or `url|alt`: replace any leading size segment and keep
    // the remaining segments (e.g. an alt caption) after the new size.
    const parts = inner.split("|");
    const url = parts[0];
    const rest = parts.slice(1);
    let alt: string[] = [];

    if (rest.length > 0 && /^\s*\d+(?:x\d+)?\s*$/.test(rest[0])) {
        alt = rest.slice(1);
    } else {
        alt = rest;
    }

    const altPart = alt.length > 0 ? `|${alt.join("|")}` : "";
    const rebuilt = `${url}${size}${altPart}`;

    if (isWiki) {
        return `![[${rebuilt}]]`;
    }

    return `${matchText.slice(0, matchText.indexOf("](") + 2)}${rebuilt})`;
}

/**
 * Dedupes resolution of s3 object keys. Rebuilding the editor decorations
 * happens on every selection move / keystroke, which would otherwise trigger
 * repeated downloads for the same key. Resolved URLs are memoized and in-flight
 * requests are shared.
 */
class S3EditorLinkResolver {
    private readonly resolved = new Map<string, string>();
    private readonly inflight = new Map<string, Promise<string>>();

    constructor(
        private readonly resolveFn: (rawKey: string) => Promise<string>
    ) {}

    resolve(rawKey: string): Promise<string> {
        const cached = this.resolved.get(rawKey);

        if (cached !== undefined) {
            return Promise.resolve(cached);
        }

        let pending = this.inflight.get(rawKey);

        if (!pending) {
            pending = this.resolveFn(rawKey)
                .then((url) => {
                    if (url) {
                        this.resolved.set(rawKey, url);
                    }

                    return url;
                })
                .finally(() => {
                    this.inflight.delete(rawKey);
                });
            this.inflight.set(rawKey, pending);
        }

        return pending;
    }
}

/**
 * CodeMirror 6 ViewPlugin that replaces `![](s3:...)` / `![[s3:...]]` embeds
 * in the editor with an inline image widget, so Live Preview shows the images
 * instead of nothing. It deliberately applies ONLY in Live Preview: in source
 * mode the raw links must stay as plain text. The raw markdown stays editable:
 * when the cursor is inside a link the widget is not applied.
 */
class S3EditorPlugin {
    decorations: DecorationSet;
    private readonly resolver: S3EditorLinkResolver;

    constructor(
        view: EditorView,
        getPostProcessor: () => S3LinkPlugin["s3PostProcessor"]
    ) {
        this.resolver = new S3EditorLinkResolver((rawKey) =>
            getPostProcessor().resolveLinkResourceUrl(rawKey)
        );
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged
        ) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    private buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();

        // Only render images in Live Preview. In source mode the markdown
        // links must stay visible as plain text (no image widgets).
        if (!view.state.field(editorLivePreviewField, false)) {
            return builder.finish();
        }

        const text = view.state.doc.toString();
        const selection = view.state.selection.main;
        const selFrom = Math.min(selection.from, selection.to);
        const selTo = Math.max(selection.from, selection.to);

        S3_IMAGE_LINK_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = S3_IMAGE_LINK_REGEX.exec(text)) !== null) {
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            // Keep the raw markdown editable while the cursor is on the link.
            // The check is boundary-inclusive: clicking a rendered image places
            // the cursor at the range edge (from/to), which must also reveal
            // the markdown for editing (native Obsidian behavior).
            if (matchStart <= selTo && matchEnd >= selFrom) {
                continue;
            }

            const schemeKey = extractSchemeKey(match[0]);
            const initialSize = extractSize(match[0]);

            Logger.debug(
                `S3EditorPlugin - Decorating s3 image link ${schemeKey}`
            );

            // The controller closes over the match range: the document cannot
            // change while a drag is in progress, so from/to stay valid when
            // the resize is committed.
            const controller: S3ImageWidgetController = {
                getRange: () => ({ from: matchStart, to: matchEnd }),
                onResize: (width: number, height: number) =>
                    this.commitResize(view, matchStart, matchEnd, width, height),
            };
            const widget = new S3ImageWidget(
                schemeKey,
                (key) => this.resolver.resolve(key),
                initialSize,
                controller
            );

            builder.add(
                matchStart,
                matchEnd,
                Decoration.replace({ widget, block: false })
            );
        }

        return builder.finish();
    }

    /**
     * Persists the new size of a resized image back into the markdown link
     * (`![[s3:...|WxH]]` / `![](s3:...|WxH)`). The editor maps the current
     * selection across the change automatically, so the cursor stays put and
     * the image stays visible.
     *
     * @param view the editor view
     * @param from the start of the link range
     * @param to the end of the link range
     * @param width the new width in pixels
     * @param height the new height in pixels
     */
    private commitResize(
        view: EditorView,
        from: number,
        to: number,
        width: number,
        height: number
    ) {
        const text = view.state.doc.sliceString(from, to);
        const newText = setLinkSize(text, width, height);

        if (newText === text) {
            return;
        }

        view.dispatch({
            changes: { from, to, insert: newText },
        });
    }
}

/**
 * Creates the CodeMirror extension that renders s3: images in the editor.
 * The post processor is resolved lazily so the extension can be registered
 * before/independent of the post processor instance and picks up rebuilt
 * settings automatically.
 *
 * @param getPostProcessor returns the current S3PostProcessor instance
 *
 * @returns a CodeMirror 6 Extension
 */
export function s3EditorExtension(
    getPostProcessor: () => S3LinkPlugin["s3PostProcessor"]
): Extension {
    // Highest precedence so our widget wins over Obsidian's built-in image
    // widget (which renders `![](s3:...)` as a broken/invisible image in Live
    // Preview because the `s3:` scheme is not loadable).
    return Prec.highest(
        ViewPlugin.fromClass(
            class extends S3EditorPlugin {
                constructor(view: EditorView) {
                    super(view, getPostProcessor);
                }
            },
            {
                decorations: (plugin: S3EditorPlugin) => plugin.decorations,
            }
        )
    );
}
