import { replaceRemoteUrls } from "../src/autoReplace";
import { StorageSource } from "../src/settings/settings";

function source(overrides: Partial<StorageSource>): StorageSource {
    return {
        id: "s1",
        name: "Default",
        provider: "aws",
        endpoint: "",
        bucketName: "mybucket",
        region: "us-east-1",
        accessKeyId: "key",
        secretAccessKey: "secret",
        pathStyle: false,
        defaultSource: true,
        signLinkEnabled: true,
        ...overrides,
    };
}

describe("replaceRemoteUrls", () => {
    it("should replace a virtual-hosted Tencent COS url for the default source", () => {
        const sources = [
            source({
                provider: "tencent-cos",
                region: "ap-guangzhou",
                bucketName: "mybucket",
            }),
        ];
        const input =
            "![](https://mybucket.cos.ap-guangzhou.myqcloud.com/path/img.png)";

        expect(replaceRemoteUrls(input, sources)).toBe("![](s3:path/img.png)");
    });

    it("should include the source name prefix for a non-default source", () => {
        const sources = [
            source({
                provider: "tencent-cos",
                region: "ap-guangzhou",
                bucketName: "mybucket",
                name: "Tencent",
                defaultSource: false,
            }),
        ];
        const input =
            "https://mybucket.cos.ap-guangzhou.myqcloud.com/a/b.png";

        expect(replaceRemoteUrls(input, sources)).toBe("s3:Tencent/a/b.png");
    });

    it("should replace an AWS path-style url", () => {
        const sources = [
            source({
                provider: "aws",
                region: "us-east-1",
                bucketName: "mybucket",
            }),
        ];
        const input = "https://s3.us-east-1.amazonaws.com/mybucket/a.png";

        expect(replaceRemoteUrls(input, sources)).toBe("s3:a.png");
    });

    it("should replace an AWS virtual-hosted url", () => {
        const sources = [
            source({
                provider: "aws",
                region: "ap-northeast-1",
                bucketName: "mybucket",
            }),
        ];
        const input =
            "https://mybucket.s3.ap-northeast-1.amazonaws.com/a.png";

        expect(replaceRemoteUrls(input, sources)).toBe("s3:a.png");
    });

    it("should replace an Aliyun OSS virtual-hosted url", () => {
        const sources = [
            source({
                provider: "aliyun-oss",
                region: "cn-hangzhou",
                bucketName: "mybucket",
            }),
        ];
        const input = "https://mybucket.oss-cn-hangzhou.aliyuncs.com/x.png";

        expect(replaceRemoteUrls(input, sources)).toBe("s3:x.png");
    });

    it("should replace an S3-compatible path-style url", () => {
        const sources = [
            source({
                provider: "s3-compatible",
                endpoint: "https://minio.local",
                bucketName: "mybucket",
            }),
        ];
        const input = "https://minio.local/mybucket/x.png";

        expect(replaceRemoteUrls(input, sources)).toBe("s3:x.png");
    });

    it("should leave non-matching urls unchanged", () => {
        const sources = [
            source({
                provider: "aws",
                region: "us-east-1",
                bucketName: "mybucket",
            }),
        ];
        const input = "https://other.com/x.png";

        expect(replaceRemoteUrls(input, sources)).toBe(input);
    });

    it("should not replace urls inside fenced code blocks", () => {
        const sources = [
            source({
                provider: "tencent-cos",
                region: "ap-guangzhou",
                bucketName: "mybucket",
            }),
        ];
        const input =
            "text\n```\nhttps://mybucket.cos.ap-guangzhou.myqcloud.com/a.png\n```\nend";
        const output = replaceRemoteUrls(input, sources);

        expect(output).toContain(
            "https://mybucket.cos.ap-guangzhou.myqcloud.com/a.png"
        );
    });

    it("should return content unchanged when no sources are configured", () => {
        const input = "https://mybucket.cos.ap-guangzhou.myqcloud.com/a.png";

        expect(replaceRemoteUrls(input, [])).toBe(input);
    });
});
