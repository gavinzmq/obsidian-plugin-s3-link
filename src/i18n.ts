/**
 * Lightweight i18n for the plugin UI. Currently supports English and Chinese.
 * The active language is stored globally and set from the plugin settings.
 */
export type Language = "en" | "zh";

type Dictionary = Record<string, string>;

const translations: Record<Language, Dictionary> = {
    en: {
        language: "Language",
        languageDesc: "Select the display language of the plugin UI",

        settingsIntro:
            "Configure one or more storage sources. Supports AWS S3, Tencent Cloud COS, Aliyun OSS and any S3-compatible endpoint.",
        noSources:
            "No storage sources configured yet. Add a source to start using the plugin.",
        addSource: "Add Source",
        removeSource: "Remove Source",
        storageSource: "Storage Source",

        provider: "Provider",
        providerDesc: "Select the storage provider",
        providerAws: "AWS S3",
        providerTencent: "Tencent Cloud COS",
        providerAliyun: "Aliyun OSS",
        providerS3Compatible: "S3-Compatible (MinIO, etc.)",

        name: "Name",
        nameDesc:
            "Display name. Used as optional prefix in links, e.g. s3:name/objectKey",

        endpoint: "Endpoint",
        endpointComposed: "Auto-composed endpoint",
        endpointKnownDesc:
            "The endpoint is composed automatically from the region for this provider.",
        endpointCustomDesc:
            "Custom endpoint URL (required for S3-compatible storage)",
        endpointPlaceholder: "https://...",

        bucket: "Bucket Name",
        region: "Region",
        regionDesc:
            "Region identifier, e.g. eu-central-1 or ap-guangzhou. Used to compose the endpoint.",

        accessKey: "Access Key ID",
        secretKey: "Secret Access Key",

        pathStyle: "Path-style addressing",
        pathStyleDesc: "Enable for most custom/S3-compatible endpoints",

        defaultSource: "Default source",
        defaultSourceDesc:
            "Links without a source prefix (s3:objectKey) use this source",
        signLinks: "Enable signed links (s3-sign)",

        testConnection: "Test Connection",
        testSuccess: "Connection successful",
        testFailed: "Connection failed - check settings and credentials",

        autoReplace: "Auto-replace remote URLs",
        autoReplaceDesc:
            "Watch for document changes and replace https:// URLs matching configured storage sources with s3: links.",

        logLevel: "Log level",
        logLevelDesc:
            "How much detail is written to the developer console. Use Debug when reporting issues.",
        logLevelDebug: "Debug",
        logLevelInfo: "Info",
        logLevelWarn: "Warning",
        logLevelError: "Error",
        logLevelNone: "None",
    },
    zh: {
        language: "语言",
        languageDesc: "选择插件界面的显示语言",

        settingsIntro:
            "配置一个或多个存储源。支持 AWS S3、腾讯云 COS、阿里云 OSS 及任意 S3 兼容端点。",
        noSources: "尚未配置存储源。请添加一个存储源以开始使用插件。",
        addSource: "添加存储源",
        removeSource: "删除存储源",
        storageSource: "存储源",

        provider: "存储服务商",
        providerDesc: "选择存储服务商",
        providerAws: "AWS S3",
        providerTencent: "腾讯云 COS",
        providerAliyun: "阿里云 OSS",
        providerS3Compatible: "S3 兼容（MinIO 等）",

        name: "名称",
        nameDesc: "显示名称，可用作链接前缀，例如 s3:name/objectKey",

        endpoint: "服务端点",
        endpointComposed: "自动生成的端点",
        endpointKnownDesc: "该服务商的端点会根据区域自动组合生成。",
        endpointCustomDesc: "自定义端点 URL（S3 兼容存储必填）",
        endpointPlaceholder: "https://...",

        bucket: "桶名称",
        region: "区域",
        regionDesc: "区域标识，例如 eu-central-1 或 ap-guangzhou，用于组合端点。",

        accessKey: "访问密钥 ID",
        secretKey: "密钥",

        pathStyle: "路径样式寻址",
        pathStyleDesc: "多数自定义/S3 兼容端点需要启用",

        defaultSource: "默认源",
        defaultSourceDesc: "无前缀链接（s3:objectKey）使用此存储源",
        signLinks: "启用签名链接（s3-sign）",

        testConnection: "测试连接",
        testSuccess: "连接成功",
        testFailed: "连接失败 - 请检查设置与凭证",

        autoReplace: "自动替换远程链接",
        autoReplaceDesc:
            "监听文档变化，将匹配已配置存储源的 https:// 链接自动替换为 s3: 格式链接。",

        logLevel: "日志级别",
        logLevelDesc: "写入开发者控制台的日志详细程度。排查问题时可选择 Debug。",
        logLevelDebug: "调试",
        logLevelInfo: "信息",
        logLevelWarn: "警告",
        logLevelError: "错误",
        logLevelNone: "无",
    },
};

let currentLanguage: Language = "en";

export function setLanguage(lang: Language): void {
    currentLanguage = lang;
}

export function getLanguage(): Language {
    return currentLanguage;
}

/**
 * Translates the given key using the active language. Falls back to English
 * and finally to the key itself if no translation exists.
 *
 * @param key the translation key
 */
export function t(key: string): string {
    return (
        translations[currentLanguage][key] ??
        translations.en[key] ??
        key
    );
}
