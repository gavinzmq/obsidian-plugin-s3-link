/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from "stream";
import Config from "../config";
import { StorageSource, getComposedEndpoint } from "../settings/settings";
import DownloadManager from "./downloadManager";
import { StorageClient } from "./storageClient";

// ali-oss may not ship TypeScript declarations depending on version
// @ts-ignore
import OSS from "ali-oss";
import { Logger } from "../logger";

/**
 * Adapter for Aliyun (Alibaba Cloud) OSS using the official ali-oss SDK.
 * The version token is derived from the object ETag.
 */
export class AliyunOssClient implements StorageClient {
    private readonly moduleName = "AliyunOssClient";
    private client: any;
    private sourceId: string;

    constructor(source: StorageSource) {
        this.sourceId = source.id;

        const options: Record<string, unknown> = {
            region: source.region,
            accessKeyId: source.accessKeyId,
            accessKeySecret: source.secretAccessKey,
            bucket: source.bucketName,
            secure: true,
        };

        const endpoint = getComposedEndpoint(source);
        if (endpoint) {
            options.endpoint = endpoint;
        }

        this.client = new OSS(options);
    }

    public async getVersionToken(
        objectKey: string
    ): Promise<string | undefined> {
        const result = await this.client.head(objectKey);
        const etag = result?.res?.headers?.etag as string | undefined;

        return this.extractETag(etag);
    }

    public async getObject(
        objectKey: string,
        versionToken: string
    ): Promise<Readable> {
        const downloadManager = DownloadManager.getInstance();
        downloadManager.addNewDownload(this.sourceId, objectKey, versionToken);

        try {
            const result = await this.client.getStream(objectKey);
            downloadManager.setRunningState(
                this.sourceId,
                objectKey,
                versionToken
            );

            const stream = result.stream as Readable;

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

            return stream;
        } catch (error) {
            downloadManager.setErrorState(
                this.sourceId,
                objectKey,
                versionToken
            );
            Logger.error(
                `${this.moduleName}: Failed to retrieve object ${objectKey}`,
                error
            );
            throw error;
        }
    }

    public getSignedUrl(objectKey: string): Promise<string> {
        return Promise.resolve(
            this.client.signatureUrl(objectKey, {
                expires: Config.S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS,
            })
        );
    }

    public async testConnection(): Promise<void> {
        await this.client.list({ "max-keys": 1 });
    }

    private extractETag(etag: string | undefined): string | undefined {
        if (!etag) {
            return undefined;
        }

        return etag.replace(/"/g, "");
    }
}
