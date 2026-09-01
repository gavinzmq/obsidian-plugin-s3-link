import { TFile } from "obsidian";
import Config from "./config";
import S3Link from "./model/s3Link";
import S3SignedLink from "./model/s3SignedLink";
import { getCacheFileName, getCacheRelativePath } from "./obsidianHelper";
import { Logger } from "./logger";

export default class Cache {
    private readonly moduleName = "Cache";

    public async init() {
        const isFolderExisting = await this.isCacheFolderPresent();

        if (!isFolderExisting) {
            Logger.info(
                `${this.moduleName}: Creating cache folder for the first time`
            );
            await this.createCacheFolderInBasePath();
        } else {
            Logger.info(
                `${this.moduleName}: S3 cache initialization already done`
            );
        }

        await this.cleanupLegacyCacheIfNeeded();
    }

    /**
     * When the cache schema version changes (e.g. after an upgrade that
     * changes the cache file naming or the localStorage key layout) the whole
     * cache is cleared once.
     */
    private async cleanupLegacyCacheIfNeeded() {
        const currentVersion = window.localStorage.getItem(
            Config.CACHE_SCHEMA_VERSION_KEY
        );

        if (currentVersion !== String(Config.CACHE_SCHEMA_VERSION)) {
            Logger.info(
                `${this.moduleName}: Cache schema changed, clearing cache`
            );
            await this.clearCache();
            window.localStorage.setItem(
                Config.CACHE_SCHEMA_VERSION_KEY,
                String(Config.CACHE_SCHEMA_VERSION)
            );
        }
    }

    /**
     * Checks if the cache folder is present in the root of the vault.
     *
     * @returns true if the cache folder is present, false otherwise
     */
    private async isCacheFolderPresent(): Promise<boolean> {
        try {
            return await app.vault.adapter.exists(Config.CACHE_FOLDER);
        } catch (err) {
            return false;
        }
    }

    /**
     * Creates the cache folder in the root of the vault.
     */
    private async createCacheFolderInBasePath() {
        try {
            await app.vault.createFolder(Config.CACHE_FOLDER);
            Logger.debug(
                `${this.moduleName}: Creating cache folder ${Config.CACHE_FOLDER} in root`
            );
        } catch (error) {
            Logger.error(
                `${this.moduleName}: Error creating cache folder`,
                error
            );
        }
    }

    /**
     * Saves the given object bytes to the cache folder. The file is written
     * through the Obsidian Vault binary API (createBinary / modifyBinary) so
     * it is registered in the vault index and resolvable on desktop and
     * mobile alike. The object bytes are buffered first because the Vault API
     * cannot write streams.
     *
     * @param objectKey the object key
     * @param versionToken the version token
     * @param data the object content
     */
    public async saveFileToCacheFolder(
        objectKey: string,
        versionToken: string,
        data: Uint8Array
    ): Promise<TFile | void> {
        const fileName = await getCacheFileName(objectKey, versionToken);
        const relativePath = `${Config.CACHE_FOLDER}/${fileName}`;

        Logger.info(
            `${this.moduleName}: Saving object to cache folder: ${relativePath}`
        );

        if (await app.vault.adapter.exists(relativePath)) {
            Logger.debug(
                `${this.moduleName}: File already exists in cache, returning existing file`
            );
            return app.vault.getAbstractFileByPath(relativePath) as TFile;
        }

        try {
            await app.vault.createBinary(relativePath, data);
        } catch (error) {
            // createBinary fails when the file was created concurrently; fall
            // back to overwriting the existing file through the vault.
            Logger.debug(
                `${this.moduleName}: createBinary failed, falling back to modifying the existing file`,
                error
            );
            const existingFile = app.vault.getAbstractFileByPath(
                relativePath
            ) as TFile | null;

            if (existingFile) {
                await app.vault.modifyBinary(existingFile, data);
            } else {
                throw error;
            }
        }

        Logger.debug(
            `${this.moduleName}: Saved ${fileName} to cache folder (${data.length} bytes)`
        );

        return app.vault.getAbstractFileByPath(relativePath) as TFile;
    }

    /**
     * Writes a new entry for the given objectKey to localStorage.
     * If one already exists, it will be overwritten.
     *
     * @param sourceId the storage source id
     * @param objectKey
     * @param versionToken
     */
    public writeItemToCache(
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        this.writeLocalStorage(sourceId, objectKey, versionToken);
    }

    /**
     * Writes a new entry for the given objectKey to localStorage.
     *
     * @param sourceId the storage source id
     * @param objectKey The objectKey to write the S3Link for
     * @param versionToken The versionToken to write to localStorage
     */
    private writeLocalStorage(
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        const s3Link = new S3Link(objectKey, Date.now(), versionToken, sourceId);

        Logger.debug(`${this.moduleName}: writeLocalStorage for ${objectKey}`);

        window.localStorage.setItem(
            `${Config.PLUGIN_NAME}/${sourceId}/${objectKey}`,
            JSON.stringify(s3Link)
        );
    }

    /**
     * Retrieves the S3Link object for the given objectKey from localStorage.
     *
     * @param sourceId the storage source id
     * @param objectKey
     *
     * @returns a S3Link object if the objectKey is present in the cache, null otherwise
     */
    public findItemInCache(
        sourceId: string,
        objectKey: string
    ): S3Link | null {
        Logger.debug(
            `${this.moduleName}::findItemInCache - Looking for ${objectKey} in cache`
        );

        const s3Link: string | null = window.localStorage.getItem(
            `${Config.PLUGIN_NAME}/${sourceId}/${objectKey}`
        );

        if (s3Link) {
            const parsedData = JSON.parse(s3Link);

            Logger.info(
                `${this.moduleName}: Found s3Link in localStorage`,
                parsedData
            );

            return new S3Link(
                parsedData.objectKey,
                parsedData.lastUpdate,
                parsedData.versionToken,
                parsedData.sourceId
            );
        }

        Logger.info(
            `${this.moduleName}: No cached s3Link found for objectKey ${objectKey}`
        );

        return null;
    }

    /**
     * Writes a new entry for the given objectKey to localStorage.
     *
     * @param sourceId the storage source id
     * @param objectKey The objectKey to write the signedUrl for
     * @param signedUrl The signedUrl to write to localStorage
     */
    public writeSignedUrlToLocalStorage(
        sourceId: string,
        objectKey: string,
        signedUrl: string
    ) {
        Logger.debug(
            `${this.moduleName}: writeSignedUrlToLocalStorage for ${objectKey}`
        );

        const s3SignedLink = new S3SignedLink(objectKey, Date.now(), signedUrl);

        window.localStorage.setItem(
            `${Config.PLUGIN_NAME}/${sourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${objectKey}`,
            JSON.stringify(s3SignedLink)
        );
    }

    /**
     * Retrieves the S3SignedLink object for the given objectKey from localStorage.
     *
     * @param sourceId the storage source id
     * @param objectKey The objectKey to find the signedUrl for
     * @returns a S3SignedLink object if the objectKey is present in the cache, null otherwise
     */
    public findSignedUrlInCache(
        sourceId: string,
        objectKey: string
    ): S3SignedLink | null {
        Logger.debug(
            `${this.moduleName}::findSignedUrlInCache - Looking for ${objectKey} in cache`
        );

        const s3SignLink: string | null = window.localStorage.getItem(
            `${Config.PLUGIN_NAME}/${sourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${objectKey}`
        );

        if (s3SignLink) {
            const parsedData = JSON.parse(s3SignLink);

            Logger.info(
                `${this.moduleName}: Found s3SignLink in localStorage`,
                parsedData
            );

            if (this.isS3SignedLinkCacheItemExpired(parsedData.lastUpdate)) {
                Logger.info(
                    `${this.moduleName}: Cache item for ${objectKey} expired, removing from localStorage}`
                );
                window.localStorage.removeItem(
                    `${Config.PLUGIN_NAME}/${sourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${objectKey}`
                );
                return null;
            }

            return new S3SignedLink(
                parsedData.objectKey,
                parsedData.lastUpdate,
                parsedData.signedUrl
            );
        }

        Logger.info(
            `${this.moduleName}: No cached s3SignLink found for objectKey ${objectKey}`
        );

        return null;
    }

    /**
     * Checks if the cache item of a specific s3SignedLink is expired
     *
     * @param lastUpdate The lastUpdate timestamp of the cached item
     *
     * @returns true if the cache item is expired, false otherwise
     */
    private isS3SignedLinkCacheItemExpired(lastUpdate: number): boolean {
        return (
            (Date.now() - lastUpdate) / 1000 >
            Config.S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS
        );
    }

    /**
     * Checks if the cache item of a specific s3Link is expired
     *
     * @param lastUpdate The lastUpdate timestamp of the cached item
     *
     * @returns true if the cache item is expired, false otherwise
     */
    public isS3LinkCacheItemExpired(lastUpdate: number): boolean {
        return (
            (Date.now() - lastUpdate) / 1000 >
            Config.S3_LINK_EXPIRATION_TIME_SECONDS
        );
    }

    /**
     * Checks whether the file belonging to the given cached S3Link is actually
     * present in the cache folder. A localStorage entry can be stale when a
     * previous download failed or when the cache folder was cleared, so the
     * cache entry alone is not sufficient proof that the file is available.
     *
     * @param s3Link the cached S3Link
     *
     * @returns true if the file exists in the cache folder, false otherwise
     */
    public async isFileInCacheFolder(s3Link: S3Link): Promise<boolean> {
        const filePath = await getCacheRelativePath(
            s3Link.objectKey,
            s3Link.versionToken
        );

        const file = app.vault.getAbstractFileByPath(filePath) as TFile | null;

        if (file) {
            // treat empty files as missing so they get re-downloaded
            return file.stat.size > 0;
        }

        try {
            return await app.vault.adapter.exists(filePath);
        } catch {
            return false;
        }
    }

    /**
     * Clears all files from the cache folder and all items from localStorage that are related to the plugin.
     */
    public async clearCache() {
        await this.clearCacheFolder();
        this.clearLocalStorage();
    }

    /**
     * Clears all files from the cache folder.
     */
    private async clearCacheFolder() {
        Logger.debug(
            `${this.moduleName}::clearCacheFolder - Clearing cache folder`
        );

        try {
            const listing = await app.vault.adapter.list(Config.CACHE_FOLDER);

            for (const filePath of listing.files) {
                await app.vault.adapter.remove(filePath);
                Logger.debug(
                    `${this.moduleName}: Deleted file: ${filePath} from cache folder`
                );
            }
        } catch (error) {
            Logger.error(
                `${this.moduleName}: Cache folder does not exist, aborting...`,
                error
            );
        }
    }

    /**
     * Clears all items from localStorage that are related to the plugin.
     */
    private clearLocalStorage() {
        Logger.debug(
            `${this.moduleName}::clearLocalStorage - Clearing localStorage`
        );

        const localStorageItems = Object.keys(window.localStorage);

        localStorageItems.forEach((key) => {
            if (key.startsWith(Config.PLUGIN_NAME)) {
                localStorage.removeItem(key);

                Logger.debug(
                    `${this.moduleName}: Removed item with key: ${key}`
                );
            }
        });
    }

    /**
     * Removing a specific objectKey from both localStorage and the cache folder.
     * It is important to remove the file from the cache folder first, because the localStorage contains the
     * necessary information to find the file in the cache folder.
     *
     * @param sourceId the storage source id
     * @param objectKey
     */
    public async removeItemFromCache(
        sourceId: string,
        objectKey: string
    ): Promise<void> {
        await this.removeItemFromCacheFolder(sourceId, objectKey);
        this.removeItemFromLocalStorage(sourceId, objectKey);
    }

    /**
     * Removes a specific objectKey from the cache folder
     *
     * @param sourceId the storage source id
     * @param objectKey
     * @returns
     */
    private async removeItemFromCacheFolder(
        sourceId: string,
        objectKey: string
    ) {
        Logger.debug(
            `${this.moduleName}::removeItemFromCacheFolder - Removing ${objectKey} from cache folder`
        );

        const s3Link = this.findItemInCache(sourceId, objectKey);

        if (!s3Link) {
            Logger.debug(
                `${this.moduleName}: No cached s3Link found for objectKey ${objectKey}. Nothing to remove from cache folder`
            );
            return;
        }

        const filePath = await getCacheRelativePath(
            objectKey,
            s3Link.versionToken
        );

        if (await app.vault.adapter.exists(filePath)) {
            await app.vault.adapter.remove(filePath);
            Logger.debug(
                `${this.moduleName}: Deleted file ${filePath} from cache folder`
            );
        } else {
            Logger.debug(
                `${this.moduleName}: No file found for ${filePath} - nothing to delete`
            );
        }
    }

    /**
     * Removes a specific objectKey from localStorage (both normal and signed links)
     *
     * @param sourceId the storage source id
     * @param objectKey
     */
    private removeItemFromLocalStorage(sourceId: string, objectKey: string) {
        Logger.debug(
            `${this.moduleName}::removeItemFromLocalStorage - Removing ${objectKey} from localStorage`
        );

        const normalKey = `${Config.PLUGIN_NAME}/${sourceId}/${objectKey}`;
        const signedKey = `${Config.PLUGIN_NAME}/${sourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${objectKey}`;

        window.localStorage.removeItem(normalKey);
        window.localStorage.removeItem(signedKey);

        Logger.debug(
            `${this.moduleName}: Removed item with key: ${normalKey} and ${signedKey}`
        );
    }
}

