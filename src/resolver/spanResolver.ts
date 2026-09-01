import Config from "../config";
import Resolver from "./resolver";
import { Logger } from "../logger";

export default class SpanResolver extends Resolver {
    private readonly moduleName = "SpanResolver";
    targetElement = "span";

    constructor() {
        super();
    }

    /**
     * Resolve all video tags that contain a link to an S3 object in one of the plugins expected format.
     *
     * @param element An HTMLElement containing the rendered markdown content
     *
     * @returns two separate maps for objectKeys and signObjectKeys
     */
    public resolveHtmlElement(element: HTMLElement): {
        objectKeys: Map<string, HTMLElement[]>;
        signObjectKeys: Map<string, HTMLElement[]>;
    } {
        Logger.debug(
            `${this.moduleName}::resolveHtmlElement - Processing rendered html content`
        );

        const spanElements = element.querySelectorAll(
            this.targetElement
        ) as NodeListOf<HTMLSpanElement>;
        this.clearObjectKeys();
        this.clearSignObjectKeys();

        if (spanElements.length == 0) {
            Logger.debug(
                `${this.moduleName} - Rendered markdown content does not contain any span tags, aborting...`
            );

            return {
                objectKeys: this.objectKeys,
                signObjectKeys: this.signObjectKeys,
            };
        }

        spanElements.forEach((spanElement) => {
            // Obsidian renders wiki embeds (`![[s3:...]]`) as internal-embed
            // spans. For resolved embeds the resource is stored in `src`; some
            // Obsidian versions / embed kinds keep the link target in
            // `data-src` only, so both attributes are checked.
            const src =
                spanElement.getAttribute("src") ||
                spanElement.getAttribute("data-src");

            if (src) {
                const parts = src.split(Config.S3_LINK_SPLITTER);

                if (parts[this.s3LinkLeftPart] == Config.S3_LINK_PREFIX) {
                    Logger.debug(
                        `${this.moduleName} - SpanResolver found link:`,
                        src
                    );

                    this.addObjectKey(
                        this.stripImageSizeSuffix(parts[this.s3LinkRightPart]),
                        spanElement
                    );
                } else if (
                    parts[this.s3LinkLeftPart] == Config.S3_SIGNED_LINK_PREFIX
                ) {
                    // Span elements are used by Obsidian to render local files and does not support remote urls
                    Logger.warn(
                        `${this.moduleName} - Signed links are not supported for span elements. Skipping ${src}`
                    );
                }
            }
        });

        return {
            objectKeys: this.objectKeys,
            signObjectKeys: this.signObjectKeys,
        };
    }

    /**
     * Search an html element for all span tags that contain a link to an S3 cached object based on a data attribute.
     * If an element does not contain a data attribute, it is ignored.
     *
     * This method only make sense to be called after the plugin updated the rendered view with links to the local cache.
     *
     * @param element
     *
     * @returns
     */
    public findAllObjectKeysInElement(element: HTMLElement): string[] {
        const objectKeys: string[] = [];
        const spanElements = element.querySelectorAll(
            this.targetElement
        ) as NodeListOf<HTMLSpanElement>;

        spanElements.forEach((spanElement) => {
            const s3Data = spanElement.getAttribute(
                Config.S3_LINK_PLUGIN_DATA_ATTRIBUTE
            );

            if (s3Data) {
                objectKeys.push(s3Data);
            }
        });

        return objectKeys;
    }
}
