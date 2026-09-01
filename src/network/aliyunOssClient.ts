import Config from "../config";
import { StorageSource, getComposedEndpoint } from "../settings/settings";
import DownloadManager from "./downloadManager";
import { StorageClient } from "./storageClient";
import { signOssRequest, signOssUrl } from "./ossSigner";
import { Logger } from "../logger";

/**
 * Adapter for Aliyun (Alibaba Cloud) OSS. Instead of the Node-based `ali-oss`
 * SDK it uses the native `fetch` API with OSS request signing built on the
 * Web Crypto API, so it also runs in the Obsidian mobile WebView.
 * The version token is derived from the object ETag.
 */
export class AliyunOssClient implements StorageClient {
    private readonly moduleName = "AliyunOssClient";
    private sourceId: string;
    private accessKeyId: string;
    private accessKeySecret: string;
    private bucket: string;
    private baseUrl: string;

    constructor(source: StorageSource) {
        this.sourceId = source.id;
        this.accessKeyId = source.accessKeyId;
        this.accessKeySecret = source.secretAccessKey;
        this.bucket = source.bucketName;

        const endpoint =
            getComposedEndpoint(source) ||
            `https://oss-${source.region}.aliyuncs.com`;
        this.baseUrl = new URL(endpoint).origin;
    }

    /**
     * Builds the canonicalized resource "/bucket/objectKey". Non-ASCII and
     * reserved characters are percent-encoded while "/" stays a separator.
     */
    private buildResource(objectKey: string): string {
        const encodedKey = encodeURIComponent(objectKey).replace(/%2F/g, "/");
        return `/${this.bucket}/${encodedKey}`;
    }

    public async getVersionToken(
        objectKey: string
    ): Promise<string | undefined> {
        const resource = this.buildResource(objectKey);

        try {
            const { authorization, date } = await signOssRequest({
                accessKeyId: this.accessKeyId,
                accessKeySecret: this.accessKeySecret,
                method: "HEAD",
                resource,
            });
            const response = await fetch(`${this.baseUrl}${resource}`, {
                method: "HEAD",
                headers: { Date: date, Authorization: authorization },
            });

            if (response.status === 404) {
                return undefined;
            }

            if (!response.ok) {
                throw new Error(
                    `HEAD ${objectKey} failed with status ${response.status}`
                );
            }

            const etag = response.headers.get("etag");
            return this.extractETag(etag ?? undefined);
        } catch (error) {
            Logger.error(
                `${this.moduleName}: Failed to retrieve object version token`,
                error
            );
            throw error;
        }
    }

    public async getObject(
        objectKey: string,
        versionToken: string
    ): Promise<Uint8Array> {
        const downloadManager = DownloadManager.getInstance();

        try {
            downloadManager.addNewDownload(
                this.sourceId,
                objectKey,
                versionToken
            );

            const resource = this.buildResource(objectKey);
            const { authorization, date } = await signOssRequest({
                accessKeyId: this.accessKeyId,
                accessKeySecret: this.accessKeySecret,
                method: "GET",
                resource,
            });
            const response = await fetch(`${this.baseUrl}${resource}`, {
                method: "GET",
                headers: { Date: date, Authorization: authorization },
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to retrieve object ${objectKey}: status ${response.status}`
                );
            }

            downloadManager.setRunningState(
                this.sourceId,
                objectKey,
                versionToken
            );

            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            downloadManager.setCompletedState(
                this.sourceId,
                objectKey,
                versionToken
            );

            return bytes;
        } catch (error) {
            await downloadManager.setErrorState(
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

    public async getSignedUrl(objectKey: string): Promise<string> {
        const resource = this.buildResource(objectKey);

        return signOssUrl(
            {
                accessKeyId: this.accessKeyId,
                accessKeySecret: this.accessKeySecret,
                method: "GET",
                resource,
                baseUrl: this.baseUrl,
            },
            Config.S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS
        );
    }

    public async testConnection(): Promise<void> {
        const resource = `/${this.bucket}`;
        const { authorization, date } = await signOssRequest({
            accessKeyId: this.accessKeyId,
            accessKeySecret: this.accessKeySecret,
            method: "GET",
            resource,
        });
        const response = await fetch(`${this.baseUrl}${resource}`, {
            method: "GET",
            headers: { Date: date, Authorization: authorization },
        });

        if (!response.ok) {
            throw new Error(
                `Connection test failed with status ${response.status}`
            );
        }
    }

    private extractETag(etag: string | undefined): string | undefined {
        if (!etag) {
            return undefined;
        }

        return etag.replace(/"/g, "");
    }
}

