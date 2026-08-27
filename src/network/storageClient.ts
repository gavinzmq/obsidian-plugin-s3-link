import { Readable } from "stream";

/**
 * Unified storage client interface implemented by all provider adapters
 * (AWS S3, Tencent Cloud COS, Aliyun OSS and arbitrary S3-compatible stores).
 */
export interface StorageClient {
    /**
     * Retrieves a token identifying the current/latest version of the object.
     * For AWS this is the S3 VersionId, for Tencent COS / Aliyun OSS the ETag.
     *
     * @param objectKey the object key
     * @returns the version token or undefined if the object does not exist
     */
    getVersionToken(objectKey: string): Promise<string | undefined>;

    /**
     * Streams the object content from the remote storage. The download is
     * registered with the DownloadManager.
     *
     * @param objectKey the object key
     * @param versionToken the version token of the object to download
     */
    getObject(objectKey: string, versionToken: string): Promise<Readable>;

    /**
     * Creates a signed URL for the given object.
     *
     * @param objectKey the object key
     */
    getSignedUrl(objectKey: string): Promise<string>;
}
