export default abstract class Config {
    static readonly PLUGIN_NAME = "obsidian-plugin-s3-link";
    static readonly MANAGER_PREFIX = "manager";
    static readonly PLUGIN_DISPLAY_NAME = "S3 Link Plugin";
    static readonly CACHE_FOLDER = "s3_cache";
    static readonly S3_LINK_PREFIX = "s3";
    static readonly S3_LINK_SPLITTER = ":";
    static readonly SOURCE_SPLITTER = "/";
    static readonly S3_LINK_EXPIRATION_TIME_SECONDS = 60 * 60; // 1 hour
    static readonly S3_SIGNED_LINK_PREFIX = "s3-sign";
    static readonly S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS = 60 * 60 * 24 * 7; // 7 days
    static readonly OBSIDIAN_APP_LINK_PREFIX = "obsidian://open?file=";
    static readonly S3_LINK_PLUGIN_DATA_ATTRIBUTE = "data-object-key";
    static readonly CACHE_SCHEMA_VERSION = 2;
    static readonly CACHE_SCHEMA_VERSION_KEY =
        "obsidian-plugin-s3-link-cache-schema-version";
    static readonly PROVIDERS = {
        AWS: "aws",
        TENCENT_COS: "tencent-cos",
        ALIYUN_OSS: "aliyun-oss",
        S3_COMPATIBLE: "s3-compatible",
    } as const;
}
