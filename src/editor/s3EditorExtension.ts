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
import S3ImageWidget from "./s3ImageWidget";

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

    return inner.trim();
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
            if (matchStart < selTo && matchEnd > selFrom) {
                continue;
            }

            const schemeKey = extractSchemeKey(match[0]);

            Logger.debug(
                `S3EditorPlugin - Decorating s3 image link ${schemeKey}`
            );

            const widget = new S3ImageWidget(schemeKey, (key) =>
                this.resolver.resolve(key)
            );

            builder.add(
                matchStart,
                matchEnd,
                Decoration.replace({ widget, block: false })
            );
        }

        return builder.finish();
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
