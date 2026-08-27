import { FileSystemAdapter, TFile } from "obsidian";
import Config from "./config";
import S3Link from "./model/s3Link";
import * as path from "path";
import * as fs from "fs";
import { createHash } from "crypto";

/**
 * Computes the file name used in the cache folder for a given object key and
 * version token. The token is hashed (sha1) to keep file names filesystem-safe
 * for arbitrary tokens (S3 VersionId, COS/OSS ETag, ...).
 *
 * @param objectKey the object key
 * @param versionToken the version token
 */
export function getCacheFileName(
    objectKey: string,
    versionToken: string
): string {
    const fileExtension = path.extname(objectKey);
    const hash = createHash("sha1").update(versionToken).digest("hex");

    return `${hash}${fileExtension}`;
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
        const filePath = `${Config.CACHE_FOLDER}/${getCacheFileName(
            arg.objectKey,
            arg.versionToken
        )}`;

        loadedFile = await getAbstractFileWithRetry(filePath);

        if (loadedFile == null) {
            // Cache files are written with raw write streams, so the vault
            // index may not have picked them up yet. Fall back to checking the
            // file system directly instead of treating the file as missing.
            const adapter = app.vault.adapter as FileSystemAdapter;
            const absolutePath = path.join(adapter.getBasePath(), filePath);

            if (fs.existsSync(absolutePath)) {
                // Prefer Obsidian's own resource path (app://local/...) so the
                // image is served by Obsidian like any other vault file.
                try {
                    const resourcePath = adapter.getResourcePath(filePath);

                    if (resourcePath) {
                        console.debug(
                            `Resolved cached file via adapter resource path: ${resourcePath}`
                        );
                        return resourcePath;
                    }
                } catch (error) {
                    console.warn(
                        `Failed to resolve adapter resource path for ${filePath}`,
                        error
                    );
                }

                // Fall back to a file:// URL that the renderer can always load
                // directly from disk, even when the vault index has not picked
                // the file up.
                const fileUrl = adapter.getFilePath(filePath);
                console.debug(
                    `Resolved cached file via file URL: ${fileUrl}`
                );
                return fileUrl;
            }

            throw new Error(`Could not load file '${filePath}'`);
        }
    } else if (arg instanceof TFile) {
        loadedFile = <TFile>arg;
    } else {
        throw new Error("Invalid argument");
    }

    const resourcePath = app.vault.getResourcePath(loadedFile);
    console.debug(`Resolved cached file via vault resource path: ${resourcePath}`);
    return resourcePath;
}

/**
 * Returns a direct file:// URL for a cached object. This bypasses Obsidian's
 * resource server entirely, so it can be used as a fallback when the vault
 * cannot serve a raw-stream-written cache file.
 *
 * @param objectKey the object key
 * @param versionToken the version token
 *
 * @returns the file:// URL of the cached file
 */
export function getCacheFileUrl(
    objectKey: string,
    versionToken: string
): string {
    const filePath = `${Config.CACHE_FOLDER}/${getCacheFileName(
        objectKey,
        versionToken
    )}`;

    return (app.vault.adapter as FileSystemAdapter).getFilePath(filePath);
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
