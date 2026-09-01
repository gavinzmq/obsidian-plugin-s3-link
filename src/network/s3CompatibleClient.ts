import Config from "../config";
import { StorageSource } from "../settings/settings";
import DownloadManager from "./downloadManager";
import { Logger } from "../logger";
import { StorageClient } from "./storageClient";
import { encodeS3PathKey, presignGetV4, signRequestV4 } from "./sigV4";
import { sha256Hex } from "../platformUtil";

/**
 * Adapter for AWS S3 and any S3-compatible endpoint (MinIO, custom
 * S3-compatible providers). Instead of the Node-based AWS SDK it uses the
 * native `fetch` API together with a SigV4 implementation built on the Web
 * Crypto API, so it also runs in the Obsidian mobile WebView.
 *
 * When an endpoint is configured the client uses path-style addressing unless
 * `pathStyle` is disabled; AWS endpoints default to virtual-host addressing.
 */
export class S3CompatibleClient implements StorageClient {
    private readonly moduleName = "S3CompatibleClient";
    private sourceId: string;
    private bucketName: string;
    private region: string;
    private accessKeyId: string;
    private secretAccessKey: string;
    private host: string;
    private usePathStyle: boolean;

    constructor(source: StorageSource) {
        this.sourceId = source.id;
        this.bucketName = source.bucketName;
        this.region = source.region || "us-east-1";
        this.accessKeyId = source.accessKeyId;
        this.secretAccessKey = source.secretAccessKey;

        if (source.endpoint) {
            const url = new URL(source.endpoint);
            this.host = url.host;
            this.usePathStyle = source.pathStyle;
        } else {
            this.host = `s3.${this.region}.amazonaws.com`;
            this.usePathStyle = false;
        }
    }

    /**
     * Builds the object request target (host + encoded path) honouring
     * path-style vs. virtual-host addressing.
     */
    private buildObjectTarget(objectKey: string): {
        url: string;
        host: string;
        path: string;
    } {
        const encodedKey = encodeS3PathKey(objectKey);

        if (this.usePathStyle) {
            const path = `/${encodeS3PathKey(this.bucketName)}/${encodedKey}`;
            return { url: `https://${this.host}${path}`, host: this.host, path };
        }

        const path = `/${encodedKey}`;
        const host = `${this.bucketName}.${this.host}`;
        return { url: `https://${host}${path}`, host, path };
    }

    public async getVersionToken(
        objectKey: string
    ): Promise<string | undefined> {
        const { url, host, path } = this.buildObjectTarget(objectKey);

        try {
            const headers = await signRequestV4({
                region: this.region,
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
                method: "HEAD",
                host,
                path,
                payloadHash: await sha256Hex(""),
            });

            const response = await fetch(url, { method: "HEAD", headers });

            if (response.status === 404) {
                return undefined;
            }

            if (!response.ok) {
                throw new Error(
                    `HEAD ${objectKey} failed with status ${response.status}`
                );
            }

            const versionId = response.headers.get("x-amz-version-id");
            const etag = response.headers.get("etag");
            const token = (versionId || etag || "").replace(/"/g, "");

            Logger.debug(
                `${this.moduleName}: Retrieved version token for ${objectKey}: ${token}`
            );

            return token || undefined;
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

            const { url, host, path } = this.buildObjectTarget(objectKey);
            const headers = await signRequestV4({
                region: this.region,
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
                method: "GET",
                host,
                path,
                payloadHash: await sha256Hex(""),
            });

            const response = await fetch(url, { method: "GET", headers });

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
            Logger.error("Error retrieving object from S3", error);
            throw error;
        }
    }

    public async getSignedUrl(objectKey: string): Promise<string> {
        const { host, path } = this.buildObjectTarget(objectKey);

        return presignGetV4({
            region: this.region,
            accessKeyId: this.accessKeyId,
            secretAccessKey: this.secretAccessKey,
            host,
            path,
            expiresIn: Config.S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS,
        });
    }

    public async testConnection(): Promise<void> {
        const path = this.usePathStyle
            ? `/${encodeS3PathKey(this.bucketName)}`
            : "/";
        const host = this.usePathStyle
            ? this.host
            : `${this.bucketName}.${this.host}`;
        const query = { "list-type": "2", "max-keys": "1" };

        const headers = await signRequestV4({
            region: this.region,
            accessKeyId: this.accessKeyId,
            secretAccessKey: this.secretAccessKey,
            method: "GET",
            host,
            path,
            query,
            payloadHash: await sha256Hex(""),
        });

        const response = await fetch(
            `https://${host}${path}?list-type=2&max-keys=1`,
            { method: "GET", headers }
        );

        if (!response.ok) {
            throw new Error(
                `Connection test failed with status ${response.status}`
            );
        }
    }
}

