/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from "stream";
import Config from "../config";
import { StorageSource } from "../settings/settings";
import DownloadManager from "./downloadManager";
import { StorageClient } from "./storageClient";

// cos-nodejs-sdk-v5 does not ship TypeScript declarations
// @ts-ignore
import COS from "cos-nodejs-sdk-v5";

/**
 * Adapter for Tencent Cloud COS using the official cos-nodejs-sdk-v5.
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
                        console.error(
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
            this.cos.getObjectStream(
                { Bucket: this.bucket, Region: this.region, Key: objectKey },
                (err: unknown, data: any) => {
                    if (err) {
                        downloadManager.setErrorState(
                            this.sourceId,
                            objectKey,
                            versionToken
                        );
                        console.error(
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

                    const stream = data.Body as Readable;

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
                        console.error(
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

    private extractETag(etag: string | undefined): string | undefined {
        if (!etag) {
            return undefined;
        }

        return etag.replace(/"/g, "");
    }
}
