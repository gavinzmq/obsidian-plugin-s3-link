import { FileSystemAdapter, TFile } from "obsidian";
import Config from "./config";
import S3Link from "./model/s3Link";
import S3SignedLink from "./model/s3SignedLink";
import * as path from "path";
import * as fs from "fs";
import { Readable } from "stream";
import { createWriteStream } from "fs";
import { getCacheFileName } from "./obsidianHelper";

export default class Cache {
    private readonly moduleName = "Cache";
    private openStreams: fs.WriteStream[] = [];

    public async init() {
        const isFolderExisting = await this.isCacheFolderPresent();

        if (!isFolderExisting) {
            console.info(
                `${this.moduleName}: Creating cache folder for the first time`
            );
            this.createCacheFolderInBasePath();
        } else {
            console.info(
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
            console.info(
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
            await fs.promises.access(this.getCachePath(), fs.constants.F_OK);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Creates the cache folder in the root of the vault.
     */
    private createCacheFolderInBasePath() {
        app.vault
            .createFolder(Config.CACHE_FOLDER)
            .then(() => {
                console.debug(
                    `${this.moduleName}: Creating cache folder ${Config.CACHE_FOLDER} in root`
                );
            })
            .catch((error) => {
                console.error(
                    `${this.moduleName}: Error creating cache folder`,
                    error
                );
            });
    }

    public async saveFileToCacheFolder(
        objectKey: string,
        versionToken: string,
        stream: Readable
    ): Promise<TFile | void> {
        const fileName = getCacheFileName(objectKey, versionToken);
        const objectPath = `${this.getCachePath()}\\${fileName}`;

        console.info(
            `${this.moduleName}: Saving object to cache folder: ${objectPath}`
        );

        if (await app.vault.adapter.exists(objectPath)) {
            console.debug(
                `${this.moduleName}: File already exists in cache, returning existing file`
            );
            return app.vault.getAbstractFileByPath(objectPath) as TFile;
        }

        return new Promise((resolve, reject) => {
            const writeStream = createWriteStream(objectPath);

            this.addOpenStream(writeStream);

            writeStream.on("finish", async () => {
                this.removeOpenStream(writeStream);

                // Raw fs writes are not tracked by the vault index, so verify
                // the file landed on disk, log its size and the leading bytes.
                // The header identifies the real content (e.g. "ffd8ff..." for
                // a JPEG) and reveals whether a download returned an error page
                // instead of the actual object.
                const stat = await fs.promises
                    .stat(objectPath)
                    .catch(() => null);

                let header = "";
                if (stat && stat.size > 0) {
                    const handle = await fs.promises
                        .open(objectPath, "r")
                        .catch(() => null);

                    if (handle) {
                        const buffer = Buffer.alloc(16);
                        await handle
                            .read(buffer, 0, 16, 0)
                            .catch(() => null);
                        await handle.close().catch(() => null);
                        header = buffer
                            .subarray(0, Math.min(stat.size, 16))
                            .toString("hex");
                    }
                }

                console.debug(
                    `${this.moduleName}: Saved ${fileName} to cache folder (${
                        stat ? stat.size : 0
                    } bytes, header: ${header || "n/a"})`
                );

                resolve();
            });
            writeStream.on("error", () => {
                this.removeOpenStream(writeStream);
                reject();
            });
            stream.on("error", () => {
                this.removeOpenStream(writeStream);
                reject();
            });
            stream.pipe(writeStream);
        });
    }

    private addOpenStream(stream: fs.WriteStream) {
        this.openStreams.push(stream);
    }

    private removeOpenStream(stream: fs.WriteStream) {
        this.openStreams = this.openStreams.filter((s) => s !== stream);
    }

    public async closeAllOpenStreams() {
        console.debug(
            `${this.moduleName}: Closing all open streams: ${this.openStreams.length}`
        );

        this.openStreams.forEach((stream) => {
            stream.destroy();
        });

        this.openStreams = [];
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

        console.debug(`${this.moduleName}: writeLocalStorage for ${objectKey}`);

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
        console.debug(
            `${this.moduleName}::findItemInCache - Looking for ${objectKey} in cache`
        );

        const s3Link: string | null = window.localStorage.getItem(
            `${Config.PLUGIN_NAME}/${sourceId}/${objectKey}`
        );

        if (s3Link) {
            const parsedData = JSON.parse(s3Link);

            console.info(
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

        console.info(
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
        console.debug(
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
        console.debug(
            `${this.moduleName}::findSignedUrlInCache - Looking for ${objectKey} in cache`
        );

        const s3SignLink: string | null = window.localStorage.getItem(
            `${Config.PLUGIN_NAME}/${sourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${objectKey}`
        );

        if (s3SignLink) {
            const parsedData = JSON.parse(s3SignLink);

            console.info(
                `${this.moduleName}: Found s3SignLink in localStorage`,
                parsedData
            );

            if (this.isS3SignedLinkCacheItemExpired(parsedData.lastUpdate)) {
                console.info(
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

        console.info(
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
    public isFileInCacheFolder(s3Link: S3Link): boolean {
        const fileName = getCacheFileName(
            s3Link.objectKey,
            s3Link.versionToken
        );
        const filePath = `${this.getCachePath()}\\${fileName}`;

        try {
            // treat empty files as missing so they get re-downloaded
            return fs.statSync(filePath).size > 0;
        } catch {
            return false;
        }
    }

    /**
     * Retrieves the path to the cache folder
     *
     * @returns the path to the cache folder
     */
    public getCachePath(): string {
        const basePath = (app.vault.adapter as FileSystemAdapter).getBasePath();
        const cachePath = `${basePath}\\${Config.CACHE_FOLDER}`;

        console.debug(`${this.moduleName}: Cachepath ${cachePath}`);

        return cachePath;
    }

    /**
     * Clears all files from the cache folder and all items from localStorage that are related to the plugin.
     */
    public async clearCache() {
        this.clearCacheFolder();
        this.clearLocalStorage();
    }

    /**
     * Clears all files from the cache folder.
     */
    private async clearCacheFolder() {
        console.debug(
            `${this.moduleName}::clearCacheFolder - Clearing cache folder`
        );

        const cachePath = this.getCachePath();

        if (!fs.existsSync(cachePath)) {
            console.error(
                `${this.moduleName}: Cache folder does not exist, aborting...`
            );
            return;
        }

        const files = fs.readdirSync(cachePath);

        for (const file of files) {
            const filePath = path.join(cachePath, file);
            const stat = await fs.promises.stat(filePath);

            if (stat.isFile()) {
                await fs.promises.unlink(filePath);
                console.debug(
                    `${this.moduleName}: Deleted file: ${filePath} from cache folder`
                );
            }
        }
    }

    /**
     * Clears all items from localStorage that are related to the plugin.
     */
    private clearLocalStorage() {
        console.debug(
            `${this.moduleName}::clearLocalStorage - Clearing localStorage`
        );

        const localStorageItems = Object.keys(window.localStorage);

        localStorageItems.forEach((key) => {
            if (key.startsWith(Config.PLUGIN_NAME)) {
                localStorage.removeItem(key);

                console.debug(
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
    public removeItemFromCache(sourceId: string, objectKey: string) {
        this.removeItemFromCacheFolder(sourceId, objectKey);
        this.removeItemFromLocalStorage(sourceId, objectKey);
    }

    /**
     * Removes a specific objectKey from the cache folder
     *
     * @param sourceId the storage source id
     * @param objectKey
     * @returns
     */
    private removeItemFromCacheFolder(sourceId: string, objectKey: string) {
        console.debug(
            `${this.moduleName}::removeItemFromCacheFolder - Removing ${objectKey} from cache folder`
        );

        const s3Link = this.findItemInCache(sourceId, objectKey);

        if (!s3Link) {
            console.debug(
                `${this.moduleName}: No cached s3Link found for objectKey ${objectKey}. Nothing to remove from cache folder`
            );
            return;
        }

        const fileName = getCacheFileName(objectKey, s3Link.versionToken);
        const filePath = `${this.getCachePath()}\\${fileName}`;

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.debug(
                `${this.moduleName}: Deleted file ${fileName} from cache folder`
            );
        } else {
            console.debug(
                `${this.moduleName}: No file found for ${fileName} - nothing to delete`
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
        console.debug(
            `${this.moduleName}::removeItemFromLocalStorage - Removing ${objectKey} from localStorage`
        );

        const normalKey = `${Config.PLUGIN_NAME}/${sourceId}/${objectKey}`;
        const signedKey = `${Config.PLUGIN_NAME}/${sourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${objectKey}`;

        window.localStorage.removeItem(normalKey);
        window.localStorage.removeItem(signedKey);

        console.debug(
            `${this.moduleName}: Removed item with key: ${normalKey} and ${signedKey}`
        );
    }
}

