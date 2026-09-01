export default abstract class Config {
    static readonly PLUGIN_NAME = "obsidian-plugin-s3-link";
    static readonly MANAGER_PREFIX = "manager";
    static readonly PLUGIN_DISPLAY_NAME = "S3 Link Plugin";
    static readonly CACHE_FOLDER = "s3_cache";
    static readonly S3_LINK_PREFIX = "s3";
    static readonly S3_LINK_SPLITTER = ":";
    static readonly SOURCE_SPLITTER = "/";
    /**
     * Neutral placeholder applied to rendered media elements while an s3: /
     * s3-sign: link is being resolved. The s3: scheme is not registered in the
     * Electron renderer, so leaving it in src/href would make the browser
     * attempt to load an unknown URL scheme and log
     * `net::ERR_UNKNOWN_URL_SCHEME`. Swapping it out synchronously (before any
     * async work) prevents that error entirely.
     *
     * The placeholder is a visible light-gray box with an image glyph (SVG
     * data URI) so an unresolved / still-loading link shows a clear
     * placeholder instead of an invisible 1x1 image.
     */
    static readonly S3_LINK_PLACEHOLDER =
        "data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='160'%20height='120'%20viewBox='0%200%20160%20120'%3E%3Crect%20width='160'%20height='120'%20rx='6'%20fill='%23ececf0'/%3E%3Cg%20fill='none'%20stroke='%23b9b9c0'%20stroke-width='5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Crect%20x='44'%20y='36'%20width='72'%20height='50'%20rx='5'/%3E%3Ccircle%20cx='64'%20cy='52'%20r='6'/%3E%3Cpath%20d='M44%2084%20l16-18%2012%2012%208-7%2036%2013'/%3E%3C/g%3E%3C/svg%3E";
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
