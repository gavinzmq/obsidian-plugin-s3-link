import {
    S3Client,
    GetObjectCommand,
    ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import Config from "../config";
import { StorageSource } from "../settings/settings";
import DownloadManager from "./downloadManager";
import { StorageClient } from "./storageClient";

/**
 * Adapter for AWS S3 and any S3-compatible endpoint (MinIO, custom
 * S3-compatible providers) built on the AWS SDK v3. When an endpoint is
 * configured the client uses path-style addressing.
 */
export class S3CompatibleClient implements StorageClient {
    private readonly moduleName = "S3CompatibleClient";
    private s3Client: S3Client;
    private sourceId: string;
    private bucketName: string;

    constructor(source: StorageSource) {
        this.sourceId = source.id;
        this.bucketName = source.bucketName;

        const clientConfig: {
            region: string;
            credentials: {
                accessKeyId: string;
                secretAccessKey: string;
            };
            endpoint?: string;
            forcePathStyle?: boolean;
        } = {
            region: source.region || "us-east-1",
            credentials: {
                accessKeyId: source.accessKeyId,
                secretAccessKey: source.secretAccessKey,
            },
        };

        if (source.endpoint) {
            clientConfig.endpoint = source.endpoint;
            clientConfig.forcePathStyle = source.pathStyle;
        }

        this.s3Client = new S3Client(clientConfig);
    }

    public async getVersionToken(
        objectKey: string
    ): Promise<string | undefined> {
        try {
            const command = new ListObjectVersionsCommand({
                Bucket: this.bucketName,
                Prefix: objectKey,
            });
            const response = await this.s3Client.send(command);

            const exactFilteredVersion =
                response.Versions?.filter(
                    (version) => version.Key === objectKey
                ) || [];

            if (exactFilteredVersion.length > 0) {
                const versionId = exactFilteredVersion[0].VersionId;
                console.debug(
                    `${this.moduleName}: Retrieved versionId ${versionId} for object ${objectKey}`
                );

                return versionId;
            }
        } catch (error) {
            console.error(
                `${this.moduleName}: Failed to retrieve object versionId`,
                error
            );

            throw error;
        }

        return undefined;
    }

    public async getObject(
        objectKey: string,
        versionToken: string
    ): Promise<Readable> {
        const downloadManager = DownloadManager.getInstance();

        try {
            downloadManager.addNewDownload(
                this.sourceId,
                objectKey,
                versionToken
            );

            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey,
            });
            const response = await this.s3Client.send(command);

            if (response.Body) {
                downloadManager.setRunningState(
                    this.sourceId,
                    objectKey,
                    versionToken
                );

                const stream = this.browserStreamToReadable(
                    response.Body as ReadableStream
                );

                stream.on("end", () => {
                    downloadManager.setCompletedState(
                        this.sourceId,
                        objectKey,
                        versionToken
                    );
                });

                return stream;
            }

            throw new Error(
                `Failed to retrieve object ${objectKey} from S3`
            );
        } catch (error) {
            downloadManager.setErrorState(
                this.sourceId,
                objectKey,
                versionToken
            );
            console.error("Error retrieving object from S3", error);
            throw error;
        }
    }

    public async getSignedUrl(objectKey: string): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: objectKey,
        });

        return getSignedUrl(this.s3Client, command, {
            expiresIn: Config.S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS,
        });
    }

    private browserStreamToReadable(browserStream: ReadableStream): Readable {
        const reader = browserStream.getReader();
        return new Readable({
            async read() {
                const result = await reader.read();
                if (result.done) {
                    this.push(null);
                } else {
                    this.push(Buffer.from(result.value));
                }
            },
        });
    }
}
