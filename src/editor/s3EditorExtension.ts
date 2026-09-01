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
export function extractSchemeKey(match: string): string {
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
 * Obsidian-native sizes are written inside the brackets:
 * `![alt|400](url)` / `![alt|400x300](url)`; the legacy destination form
 * `![](url|400x300)` is also accepted for backwards compatibility.
 *
 * @param match the full matched text
 */
export function extractSize(
    match: string
): { width: number; height: number } | null {
    const parseSegment = (segment: string) => {
        const pipe = segment.indexOf("|");

        if (pipe < 0) {
            return null;
        }

        const sizeMatch = /^\s*(\d+)(?:x(\d+))?/.exec(segment.slice(pipe + 1));

        if (!sizeMatch) {
            return null;
        }

        return {
            width: parseInt(sizeMatch[1], 10),
            height: sizeMatch[2] ? parseInt(sizeMatch[2], 10) : 0,
        };
    };

    if (match.startsWith("![[")) {
        // `![[url|WxH]]`
        return parseSegment(match.slice(3, -2));
    }

    const open = match.indexOf("](");

    if (open < 0) {
        return null;
    }

    // `![alt|WxH](url)` — Obsidian-native size lives in the brackets.
    const bracketSize = parseSegment(match.slice(2, open));

    if (bracketSize) {
        return bracketSize;
    }

    // `![](url|WxH)` — legacy size in the destination.
    return parseSegment(match.slice(open + 2, -1));
}

/**
 * Rewrites a matched image link so it carries an explicit size. For the
 * wiki form the size stays before `]]` (`![[s3:...|400x300]]`); for the
 * markdown form the size is written into the brackets like native Obsidian:
 * `![alt|400x300](s3:...)`. An existing size segment is replaced in place
 * and any alt caption is preserved. Legacy `![](url|WxH)` links are migrated
 * to the Obsidian-native `![alt|WxH](url)` layout.
 *
 * @param matchText the full matched text
 * @param width the new width in pixels
 * @param height the new height in pixels
 */
export function setLinkSize(
    matchText: string,
    width: number,
    height: number
): string {
    const size = `|${Math.round(width)}x${Math.round(height)}`;

    // Splits `url|size|alt` / `url|alt` into the clean url and the remaining
    // (non-size) segments, replacing any leading size segment.
    const splitSegments = (inner: string) => {
        const parts = inner.split("|");
        const url = parts[0];
        let rest = parts.slice(1);

        if (rest.length > 0 && /^\s*\d+(?:x\d+)?\s*$/.test(rest[0])) {
            rest = rest.slice(1);
        }

        return { url, rest };
    };

    if (matchText.startsWith("![[")) {
        // `![[url|alt]]` -> `![[url|WxH|alt]]`
        const { url, rest } = splitSegments(matchText.slice(3, -2));
        const restPart = rest.length > 0 ? `|${rest.join("|")}` : "";

        return `![[${url}${size}${restPart}]]`;
    }

    const open = matchText.indexOf("](");
    const close = matchText.lastIndexOf(")");

    if (open < 0 || close < 0) {
        return matchText;
    }

    const bracket = matchText.slice(2, open); // e.g. `alt`, `alt|200` or ``
    const { url, rest } = splitSegments(matchText.slice(open + 2, close));

    // Keep the alt caption from the brackets, dropping an existing size
    // segment (`![|200]` empty alt / `![alt|200]` alt first), and migrate any
    // alt segments that were stored after the url into the brackets.
    const bracketParts = bracket.split("|");
    let alt: string[];

    if (
        bracketParts.length > 0 &&
        /^\s*\d+(?:x\d+)?\s*$/.test(bracketParts[0])
    ) {
        // `![|200]` — empty alt, size first.
        alt = bracketParts.slice(1);
    } else if (
        bracketParts.length > 1 &&
        /^\s*\d+(?:x\d+)?\s*$/.test(bracketParts[1])
    ) {
        // `![alt|200]` — alt then size.
        alt = [bracketParts[0]].concat(bracketParts.slice(2));
    } else {
        alt = bracketParts;
    }

    alt = alt.concat(rest);
    const altPart = alt.length > 0 ? alt.join("|") : "";

    return `![${altPart}${size}](${url})`;
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
     * (`![[s3:...|WxH]]` / `![alt|WxH](s3:...)` — the Obsidian-native form).
     * The editor maps the current selection across the change automatically,
     * so the cursor stays put and the image stays visible.
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
