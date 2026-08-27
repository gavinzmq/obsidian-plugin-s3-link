import Config from "../config";
import { StorageSource } from "../settings/settings";
import { AliyunOssClient } from "./aliyunOssClient";
import { S3CompatibleClient } from "./s3CompatibleClient";
import { StorageClient } from "./storageClient";
import { TencentCosClient } from "./tencentCosClient";

/**
 * Creates the appropriate StorageClient for a given storage source.
 */
export class StorageClientFactory {
    public static create(source: StorageSource): StorageClient {
        switch (source.provider) {
            case Config.PROVIDERS.TENCENT_COS:
                return new TencentCosClient(source);
            case Config.PROVIDERS.ALIYUN_OSS:
                return new AliyunOssClient(source);
            case Config.PROVIDERS.AWS:
            case Config.PROVIDERS.S3_COMPATIBLE:
            default:
                return new S3CompatibleClient(source);
        }
    }
}
