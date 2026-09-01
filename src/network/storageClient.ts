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
     * Downloads the object content from the remote storage and returns it as
     * raw bytes. The download is registered with the DownloadManager. The
     * whole object is buffered because the Vault binary API (used to persist
     * the cache) cannot write streams.
     *
     * @param objectKey the object key
     * @param versionToken the version token of the object to download
     */
    getObject(objectKey: string, versionToken: string): Promise<Uint8Array>;

    /**
     * Creates a signed URL for the given object.
     *
     * @param objectKey the object key
     */
    getSignedUrl(objectKey: string): Promise<string>;

    /**
     * Tests the connection to the storage (e.g. lists the bucket with a limit).
     * Resolves if the connection and credentials are valid, rejects otherwise.
     */
    testConnection(): Promise<void>;
}
