/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from "stream";
import Config from "../config";
import { StorageSource } from "../settings/settings";
import DownloadManager from "./downloadManager";
import { StorageClient } from "./storageClient";

// cos-js-sdk-v5 does not ship TypeScript declarations
// @ts-ignore
import COS from "cos-js-sdk-v5";
import { Logger } from "../logger";

/**
 * Adapter for Tencent Cloud COS using the official browser SDK
 * (cos-js-sdk-v5) which runs inside the Obsidian renderer.
 * The version token is derived from the object ETag.
 */
export class TencentCosClient implements StorageClient {
    private readonly moduleName = "TencentCosClient";
    private cos: any;
    private sourceId: string;
    private bucket: string;
    private region: string;

    constructor(source: StorageSource) {
        this.sourceId = source.id;
        this.bucket = source.bucketName;
        this.region = source.region;
        this.cos = new COS({
            SecretId: source.accessKeyId,
            SecretKey: source.secretAccessKey,
        });
    }

    public getVersionToken(objectKey: string): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            this.cos.headObject(
                { Bucket: this.bucket, Region: this.region, Key: objectKey },
                (err: unknown, data: any) => {
                    if (err) {
                        Logger.error(
                            `${this.moduleName}: Failed to retrieve ETag for ${objectKey}`,
                            err
                        );
                        reject(err);
                        return;
                    }

                    resolve(this.extractETag(data.ETag));
                }
            );
        });
    }

    public getObject(
        objectKey: string,
        versionToken: string
    ): Promise<Readable> {
        const downloadManager = DownloadManager.getInstance();
        downloadManager.addNewDownload(this.sourceId, objectKey, versionToken);

        return new Promise((resolve, reject) => {
            this.cos.getObject(
                {
                    Bucket: this.bucket,
                    Region: this.region,
                    Key: objectKey,
                    // The browser SDK decodes the response as a UTF-8 string by
                    // default (DataType: "text"), which corrupts binary objects
                    // (invalid bytes become U+FFFD replacement characters).
                    // Request a Blob so image data is preserved byte-for-byte.
                    DataType: "blob",
                },
                (err: unknown, data: any) => {
                    if (err) {
                        downloadManager.setErrorState(
                            this.sourceId,
                            objectKey,
                            versionToken
                        );
                        Logger.error(
                            `${this.moduleName}: Failed to retrieve object ${objectKey}`,
                            err
                        );
                        reject(err);
                        return;
                    }

                    downloadManager.setRunningState(
                        this.sourceId,
                        objectKey,
                        versionToken
                    );

                    this.bodyToReadable(data.Body)
                        .then((stream) => {
                            stream.on("end", () => {
                                downloadManager.setCompletedState(
                                    this.sourceId,
                                    objectKey,
                                    versionToken
                                );
                            });
                            stream.on("error", () => {
                                downloadManager.setErrorState(
                                    this.sourceId,
                                    objectKey,
                                    versionToken
                                );
                            });

                            resolve(stream);
                        })
                        .catch((conversionError) => {
                            downloadManager.setErrorState(
                                this.sourceId,
                                objectKey,
                                versionToken
                            );
                            reject(conversionError);
                        });
                }
            );
        });
    }

    public getSignedUrl(objectKey: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.cos.getObjectUrl(
                {
                    Bucket: this.bucket,
                    Region: this.region,
                    Key: objectKey,
                    Sign: true,
                    Expires: Config.S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS,
                },
                (err: unknown, data: { Url: string }) => {
                    if (err) {
                        Logger.error(
                            `${this.moduleName}: Failed to generate signed URL for ${objectKey}`,
                            err
                        );
                        reject(err);
                        return;
                    }

                    resolve(data.Url);
                }
            );
        });
    }

    public testConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.cos.getBucket(
                { Bucket: this.bucket, Region: this.region },
                (err: unknown) => {
                    if (err) {
                        Logger.error(
                            `${this.moduleName}: Connection test failed`,
                            err
                        );
                        reject(err);
                        return;
                    }

                    resolve();
                }
            );
        });
    }

    /**
     * Converts the response body returned by the browser SDK into a Node
     * Readable so it can be piped into the local cache file.
     * Note: the browser SDK buffers the whole object, so large files are not
     * streamed incrementally for Tencent COS.
     */
    private async bodyToReadable(body: unknown): Promise<Readable> {
        if (body instanceof ArrayBuffer) {
            return Readable.from([Buffer.from(body)]);
        }

        if (body instanceof Blob) {
            const buffer = Buffer.from(await body.arrayBuffer());
            return Readable.from([buffer]);
        }

        if (typeof body === "string") {
            return Readable.from([Buffer.from(body)]);
        }

        return Readable.from([Buffer.from(body as ArrayBuffer)]);
    }

    private extractETag(etag: string | undefined): string | undefined {
        if (!etag) {
            return undefined;
        }

        return etag.replace(/"/g, "");
    }
}
