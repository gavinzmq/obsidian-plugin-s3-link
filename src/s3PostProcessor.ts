import { TFile } from "obsidian";
import Cache from "./cache";
import Config from "./config";
import { getCacheFileName, getVaultResourcePath } from "./obsidianHelper";
import { PluginSettings, resolveSourceKey } from "./settings/settings";
import ImageResolver from "./resolver/imageResolver";
import VideoResolver from "./resolver/videoResolver";
import SpanResolver from "./resolver/spanResolver";
import AnchorResolver from "./resolver/anchorResolver";
import S3LinkPlugin from "./main";
import S3Link from "./model/s3Link";
import { StorageClient } from "./network/storageClient";
import { StorageClientFactory } from "./network/storageClientFactory";

export class S3PostProcessor {
    private readonly moduleName = "S3PostProcessor";
    private cache: Cache;
    private imageResolver: ImageResolver;
    private videoResolver: VideoResolver;
    private spanResolver: SpanResolver;
    private anchorResolver: AnchorResolver;
    private pluginSettings: PluginSettings;
    private clients: Map<string, StorageClient> = new Map();

    constructor(plugin: S3LinkPlugin, cache: Cache, settings: PluginSettings) {
        this.cache = cache;
        this.imageResolver = new ImageResolver();
        this.videoResolver = new VideoResolver();
        this.spanResolver = new SpanResolver();
        this.anchorResolver = new AnchorResolver();
        this.pluginSettings = settings;
        this.buildClients(settings);
    }

    /**
     * Builds the storage client map for all configured sources.
     *
     * @param settings PluginSettings containing the storage sources
     */
    private buildClients(settings: PluginSettings) {
        this.clients.clear();

        settings.sources.forEach((source) => {
            try {
                this.clients.set(
                    source.id,
                    StorageClientFactory.create(source)
                );
            } catch (error) {
                console.error(
                    `${this.moduleName} - Failed to create client for source ${source.name}`,
                    error
                );
            }
        });
    }

    /**
     * Callback for the settings tab. Invoked when the settings are changed.
     *
     * @param settings PluginSettings containing the new settings
     */
    public onSettingsChanged(settings: PluginSettings) {
        console.debug("Settings changed, rebuilding storage clients...");
        this.pluginSettings = settings;
        this.buildClients(settings);
    }

    /**
     * Callback for the markdown post processor. Invoked when markdown is rendered.
     * Note: This will only trigger in the preview mode and not in the editor mode.
     * Note: The content is dependent on the context and doesn't necessarily contain the whole markdown file.
     *
     * @param element HTMLElement containing the rendered markdown content
     */
    public async onMarkdownPostProcessor(element: HTMLElement) {
        console.debug(
            `${this.moduleName}::onMarkdownPostProcessor - Processing rendered html content`
        );

        const resolvedS3ImageLinks =
            this.imageResolver.resolveHtmlElement(element);

        const resolvedS3VideoLinks =
            this.videoResolver.resolveHtmlElement(element);

        const resolvedS3SpanLinks =
            this.spanResolver.resolveHtmlElement(element);

        const resolvedS3AnchorLinks =
            this.anchorResolver.resolveHtmlElement(element);

        const resolvedS3Links: Map<string, HTMLElement[]> = new Map([
            ...Array.from(resolvedS3ImageLinks.objectKeys.entries()),
            ...Array.from(resolvedS3VideoLinks.objectKeys.entries()),
            ...Array.from(resolvedS3SpanLinks.objectKeys.entries()),
            ...Array.from(resolvedS3AnchorLinks.objectKeys.entries()),
        ]);

        const resolvedS3SignLinks: Map<string, HTMLElement[]> = new Map([
            ...Array.from(resolvedS3ImageLinks.signObjectKeys.entries()),
            ...Array.from(resolvedS3VideoLinks.signObjectKeys.entries()),
            ...Array.from(resolvedS3SpanLinks.signObjectKeys.entries()),
            ...Array.from(resolvedS3AnchorLinks.signObjectKeys.entries()),
        ]);

        await this.processS3Links(resolvedS3Links);
        await this.processS3SignLinks(resolvedS3SignLinks);
    }

    /**
     * Work through all resolved S3 links and process them
     *  - If the link is already cached, update the HTML elements with the new resource path
     *  - If the link is not cached, load the file from the storage and update the HTML elements
     *
     * @param resolvedS3Links A map of all resolved S3 links and the corresponding HTML elements
     */
    private async processS3Links(resolvedS3Links: Map<string, HTMLElement[]>) {
        for (const [rawKey, htmlElements] of resolvedS3Links) {
            const { sourceId, objectKey } = resolveSourceKey(
                this.pluginSettings,
                rawKey
            );
            const client = this.clients.get(sourceId);

            if (!client) {
                console.warn(
                    `${this.moduleName} - No client for source ${sourceId}, skipping ${rawKey}`
                );
                continue;
            }

            console.debug(
                `${this.moduleName} - Processing S3 link ${rawKey}`
            );

            const cachedS3Link = this.cache.findItemInCache(sourceId, objectKey);

            try {
                if (
                    cachedS3Link != null &&
                    this.cache.isS3LinkCacheItemExpired(cachedS3Link.lastUpdate)
                ) {
                    console.debug(
                        `${this.moduleName} - Cache for ${objectKey} expired`
                    );

                    const versionToken = await this.getNewestVersionToken(
                        client,
                        objectKey,
                        cachedS3Link
                    );

                    if (versionToken == null) {
                        console.error(
                            `${this.moduleName} - Failed to retrieve versionToken for objectKey ${objectKey}`
                        );

                        return;
                    }

                    if (versionToken !== cachedS3Link.versionToken) {
                        console.log(
                            `${this.moduleName} - New versionToken ${versionToken} for objectKey ${objectKey}`
                        );

                        const loadedFile = await this.loadS3Item(
                            client,
                            sourceId,
                            objectKey,
                            versionToken
                        );

                        // only mark the item as cached after the file was saved successfully
                        this.cache.writeItemToCache(
                            sourceId,
                            objectKey,
                            versionToken
                        );

                        await this.updateLinkReferences(
                            htmlElements,
                            loadedFile,
                            rawKey,
                            sourceId,
                            objectKey,
                            versionToken
                        );

                        return;
                    }
                }

                if (cachedS3Link != null) {
                    // The cache entry is still valid, but make sure the file is
                    // actually present in the cache folder. A missing file (e.g.
                    // a failed download or a cleared cache folder) would leave
                    // the image broken while localStorage still claims the item
                    // is cached.
                    if (this.cache.isFileInCacheFolder(cachedS3Link)) {
                        console.debug(
                            `${this.moduleName} - Cache not expired`
                        );
                        // update last checked timestamp
                        this.cache.writeItemToCache(
                            sourceId,
                            objectKey,
                            cachedS3Link.versionToken
                        );
                        await this.updateLinkReferences(
                            htmlElements,
                            cachedS3Link,
                            rawKey,
                            sourceId,
                            objectKey,
                            cachedS3Link.versionToken
                        );

                        continue;
                    }

                    console.warn(
                        `${this.moduleName} - Cached file for ${objectKey} is missing from the cache folder, re-downloading`
                    );
                    this.cache.removeItemFromCache(sourceId, objectKey);
                }

                // The item is not cached yet, or the cached file is gone:
                // download it and only mark it as cached once the file has
                // been saved successfully.
                const versionToken = await this.initNewS3Item(
                    client,
                    objectKey
                );
                const loadedFile = await this.loadS3Item(
                    client,
                    sourceId,
                    objectKey,
                    versionToken
                );

                this.cache.writeItemToCache(
                    sourceId,
                    objectKey,
                    versionToken
                );

                await this.updateLinkReferences(
                    htmlElements,
                    loadedFile,
                    rawKey,
                    sourceId,
                    objectKey,
                    versionToken
                );
            } catch (error) {
                console.error(
                    `${this.moduleName} - Error processing S3 link ${rawKey} ignoring link`,
                    error
                );
            }
        }
    }

    /**
     * Work through all resolved S3 signLinks and process them
     *  - If the link is already cached, update the HTML elements with the new resource path(signed url)
     *  - If the link is not cached, get a signed URL from the storage and update the HTML elements
     *
     * @param resolvedS3SignLinks A map of all resolved S3 signLinks and the corresponding HTML elements
     */
    private async processS3SignLinks(
        resolvedS3SignLinks: Map<string, HTMLElement[]>
    ) {
        for (const [rawKey, htmlElements] of resolvedS3SignLinks) {
            const { sourceId, objectKey } = resolveSourceKey(
                this.pluginSettings,
                rawKey
            );
            const client = this.clients.get(sourceId);

            if (!client) {
                console.warn(
                    `${this.moduleName} - No client for source ${sourceId}, skipping ${rawKey}`
                );
                continue;
            }

            console.debug(
                `${this.moduleName} - Processing S3 signLink ${rawKey}`
            );

            const cachedS3SignLink = this.cache.findSignedUrlInCache(
                sourceId,
                objectKey
            );

            if (cachedS3SignLink != null) {
                this.updateSignLinkReferences(
                    htmlElements,
                    rawKey,
                    cachedS3SignLink.signedUrl
                );
            } else {
                try {
                    const signedUrl = await this.getS3SignedUrl(
                        client,
                        sourceId,
                        objectKey
                    );
                    if (signedUrl != null) {
                        this.updateSignLinkReferences(
                            htmlElements,
                            rawKey,
                            signedUrl
                        );
                    }
                } catch (error) {
                    console.error(
                        `${this.moduleName} - Error processing S3 signLink ${rawKey} ignoring link`,
                        error
                    );
                }
            }
        }
    }

    /**
     * Update the HTML elements with the new resource path
     *
     * @param htmlElements A list of HTML elements that need to be updated
     * @param resource The cached resource (S3Link or TFile)
     * @param rawKey The raw object key as authored in the link (may include source prefix)
     * @param sourceId The storage source id
     * @param objectKey The resolved object key
     * @param versionToken The version token
     */
    private async updateLinkReferences(
        htmlElements: HTMLElement[],
        resource: S3Link | TFile,
        rawKey: string,
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        console.debug(
            `${this.moduleName}::updateLinkReferences - Updating link references`
        );

        // Await each src update so Obsidian does not finalize the render (and
        // discard our element reference) before the resource path is set.
        for (const htmlElement of htmlElements) {
            if (htmlElement instanceof HTMLImageElement) {
                htmlElement.src = await this.getResourcePath(
                    resource,
                    sourceId,
                    objectKey
                );
            } else if (htmlElement instanceof HTMLVideoElement) {
                htmlElement.autoplay = false;
                htmlElement.src = await this.getResourcePath(
                    resource,
                    sourceId,
                    objectKey
                );
            } else if (htmlElement instanceof HTMLSpanElement) {
                htmlElement.setAttribute(
                    "src",
                    getCacheFileName(objectKey, versionToken)
                );
            } else if (htmlElement instanceof HTMLAnchorElement) {
                htmlElement.href = `${Config.OBSIDIAN_APP_LINK_PREFIX}${getCacheFileName(
                    objectKey,
                    versionToken
                )}`;
            }

            htmlElement.setAttribute(
                Config.S3_LINK_PLUGIN_DATA_ATTRIBUTE,
                rawKey
            );
        }
    }

    /**
     * Note: It seems like having await getVaultResourcePath(resource) in the updateLinkReferences method
     * causes span elements to not load properly. It is important that the resourcePath is only retrieved
     * for elements that actually need it.
     *
     * @param resource
     * @param sourceId
     * @param objectKey
     * @returns
     */
    private async getResourcePath(
        resource: S3Link | TFile,
        sourceId: string,
        objectKey: string
    ) {
        let resourcePath = "";

        try {
            resourcePath = await getVaultResourcePath(resource);
        } catch (error) {
            // Never delete the cache entry here: the file may exist on disk but
            // just not be resolvable yet. Deleting it would remove a perfectly
            // valid cached file and force a needless re-download loop. Stale
            // entries are cleaned up by processS3Links when the file is
            // actually missing.
            console.warn(
                `${this.moduleName} - Failed to resolve resource path for ${objectKey}`,
                error
            );
        }

        return resourcePath;
    }

    private updateSignLinkReferences(
        htmlElements: HTMLElement[],
        rawKey: string,
        signedUrl: string
    ) {
        console.debug(
            `${this.moduleName}::updateSignLinkReferences - Updating sign link references`
        );

        htmlElements.forEach(async (htmlElement) => {
            if (htmlElement instanceof HTMLImageElement) {
                htmlElement.src = signedUrl;
            } else if (htmlElement instanceof HTMLVideoElement) {
                htmlElement.autoplay = false;
                htmlElement.src = signedUrl;
            } else if (htmlElement instanceof HTMLSpanElement) {
                // not supported
                console.warn(
                    `${this.moduleName}: Span elements are not supported for signed urls`
                );

                return;
            } else if (htmlElement instanceof HTMLAnchorElement) {
                htmlElement.href = signedUrl;
            }

            htmlElement.setAttribute(
                Config.S3_LINK_PLUGIN_DATA_ATTRIBUTE,
                rawKey
            );
        });
    }

    /**
     * Retrieves the newest version token for the given objectKey from the
     * remote storage. The item is deliberately not written to the cache here:
     * it is only added to the cache after the file has been downloaded
     * successfully (see processS3Links). Writing the cache entry first would
     * leave an orphaned entry behind when the download fails.
     *
     * @param client the storage client
     * @param objectKey the object key
     *
     * @returns the version token
     */
    private async initNewS3Item(
        client: StorageClient,
        objectKey: string
    ): Promise<string> {
        const versionToken = await client.getVersionToken(objectKey);

        if (versionToken) {
            return versionToken;
        }

        throw new Error(
            `Failed to retrieve versionToken for objectKey ${objectKey}`
        );
    }

    /**
     * Load the file from the remote storage and save it to the cache folder
     *
     * @param client the storage client
     * @param sourceId the storage source id
     * @param objectKey
     * @param versionToken
     * @returns
     */
    private async loadS3Item(
        client: StorageClient,
        sourceId: string,
        objectKey: string,
        versionToken: string
    ): Promise<TFile | S3Link> {
        const stream = await client.getObject(objectKey, versionToken);
        const savedFile = await this.cache.saveFileToCacheFolder(
            objectKey,
            versionToken,
            stream
        );

        if (savedFile instanceof TFile) {
            // if the instance is a tfile it means that the file was already cached and was loaded from the cache
            return savedFile as TFile;
        } else {
            // if the instance is a s3link it means that the file was not cached and was loaded from remote storage
            return new S3Link(objectKey, Date.now(), versionToken, sourceId);
        }
    }

    /**
     * Get a signed URL from the remote storage for the given objectKey and write it to the cache
     *
     * @param client the storage client
     * @param sourceId the storage source id
     * @param objectKey
     *
     * @returns
     */
    private async getS3SignedUrl(
        client: StorageClient,
        sourceId: string,
        objectKey: string
    ): Promise<string | null> {
        const versionToken = await client.getVersionToken(objectKey);

        if (versionToken == null) {
            console.debug(
                `${this.moduleName} - Error retrieving versionToken for objectKey ${objectKey}`
            );
            return null;
        }
        const signedUrl = await client.getSignedUrl(objectKey);
        this.cache.writeSignedUrlToLocalStorage(
            sourceId,
            objectKey,
            signedUrl
        );

        return signedUrl;
    }

    /**
     * Retrieves the newest versionToken for the given objectKey from the remote storage.
     * If the versionToken is the same as the one in the cache, the cached token is returned.
     *
     * @param client the storage client
     * @param objectKey
     * @param s3Link
     *
     * @returns
     */
    private async getNewestVersionToken(
        client: StorageClient,
        objectKey: string,
        s3Link: S3Link
    ): Promise<string | null> {
        const versionToken = await client.getVersionToken(objectKey);

        if (versionToken && versionToken === s3Link.versionToken) {
            console.debug(
                `${this.moduleName} - Item ${objectKey} is still the latest version ${versionToken}`
            );

            return s3Link.versionToken;
        } else {
            return versionToken ?? null;
        }
    }
}
