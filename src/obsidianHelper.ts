import { FileSystemAdapter, TFile } from "obsidian";
import Config from "./config";
import S3Link from "./model/s3Link";
import {
    getFileExtension,
    isMobile,
    joinVaultPath,
    sha1Hex,
} from "./platformUtil";
import { Logger } from "./logger";

/**
 * Computes the file name used in the cache folder for a given object key and
 * version token. The token is hashed (sha1) to keep file names filesystem-safe
 * for arbitrary tokens (S3 VersionId, COS/OSS ETag, ...). Uses the Web Crypto
 * API so it works on desktop and mobile alike.
 *
 * @param objectKey the object key
 * @param versionToken the version token
 */
export async function getCacheFileName(
    objectKey: string,
    versionToken: string
): Promise<string> {
    const fileExtension = getFileExtension(objectKey);
    const hash = await sha1Hex(versionToken);

    return `${hash}${fileExtension}`;
}

/**
 * Returns the vault-relative path of the cached file for the given object key
 * and version token (e.g. `s3_cache/<sha1>.ext`).
 *
 * @param objectKey the object key
 * @param versionToken the version token
 */
export async function getCacheRelativePath(
    objectKey: string,
    versionToken: string
): Promise<string> {
    return joinVaultPath(
        Config.CACHE_FOLDER,
        await getCacheFileName(objectKey, versionToken)
    );
}

export async function getVaultResourcePath(arg: S3Link): Promise<string>;

export async function getVaultResourcePath(arg: TFile): Promise<string>;

export async function getVaultResourcePath(
    arg: S3Link | TFile
): Promise<string>;

export async function getVaultResourcePath(
    arg: S3Link | TFile
): Promise<string> {
    let loadedFile: TFile | null = null;

    if (arg instanceof S3Link) {
        const filePath = await getCacheRelativePath(
            arg.objectKey,
            arg.versionToken
        );

        loadedFile = await getAbstractFileWithRetry(filePath);

        if (loadedFile == null) {
            // Files written through the raw adapter (or not yet picked up by
            // the vault index) are checked directly on the adapter. The
            // desktop FileSystemAdapter can also serve a resource path for a
            // path that is not (yet) indexed.
            const adapter = app.vault.adapter;

            if (await adapter.exists(filePath)) {
                // Prefer Obsidian's own resource path (app://local/...) so the
                // image is served by Obsidian like any other vault file. This
                // works on desktop and mobile.
                try {
                    const resourcePath = adapter.getResourcePath(filePath);

                    if (resourcePath) {
                        Logger.debug(
                            `Resolved cached file via adapter resource path: ${resourcePath}`
                        );
                        return resourcePath;
                    }
                } catch (error) {
                    Logger.warn(
                        `Failed to resolve adapter resource path for ${filePath}`,
                        error
                    );
                }

                if (!isMobile()) {
                    // Desktop only: fall back to a file:// URL that the
                    // renderer can always load directly from disk.
                    try {
                        const fileUrl = (adapter as FileSystemAdapter).getFilePath(
                            filePath
                        );
                        Logger.debug(
                            `Resolved cached file via file URL: ${fileUrl}`
                        );
                        return fileUrl;
                    } catch (error) {
                        Logger.warn(
                            `Failed to resolve file URL for ${filePath}`,
                            error
                        );
                    }
                }
            }

            throw new Error(`Could not load file '${filePath}'`);
        }
    } else if (arg instanceof TFile) {
        loadedFile = <TFile>arg;
    } else {
        throw new Error("Invalid argument");
    }

    const resourcePath = app.vault.getResourcePath(loadedFile);
    Logger.debug(
        `Resolved cached file via vault resource path: ${resourcePath}`
    );
    return resourcePath;
}

/**
 * Returns a direct file:// URL for a cached object (desktop only). On mobile
 * there is no file:// scheme, so the vault resource path is returned instead.
 * This bypasses Obsidian's resource server entirely, so it can be used as a
 * fallback when the vault cannot serve a cache file.
 *
 * @param objectKey the object key
 * @param versionToken the version token
 *
 * @returns the URL of the cached file
 */
export async function getCacheFileUrl(
    objectKey: string,
    versionToken: string
): Promise<string> {
    const filePath = await getCacheRelativePath(objectKey, versionToken);

    if (!isMobile()) {
        try {
            return (app.vault.adapter as FileSystemAdapter).getFilePath(
                filePath
            );
        } catch (error) {
            Logger.warn(
                `Failed to resolve file URL for ${filePath}`,
                error
            );
        }
    }

    // Mobile (or fallback): resolve through the vault resource path.
    const file = await getAbstractFileWithRetry(filePath);
    return file ? app.vault.getResourcePath(file) : "";
}

/**
 * When files are not written with writeBinary, they are not immediately available. WriteBinary
 * is not being used to support writing files as streams. This is necessary for large files.
 * The function will retry multiple times to load the file and if it cannot it returns null. Usually
 * the file is available after 1-2 retries.
 *
 * @param path the path of the file to load
 * @param retries the number of retries
 * @param interval the interval between retries in milliseconds
 *
 * @returns a TFile or null if the file could not be loaded
 */
async function getAbstractFileWithRetry(
    path: string,
    retries = 10,
    interval = 100
): Promise<TFile | null> {
    for (let i = 0; i < retries; i++) {
        const file = app.vault.getAbstractFileByPath(path);

        if (file) {
            return file as TFile;
        }

        await new Promise((res) => setTimeout(res, interval));
    }

    return null;
}

