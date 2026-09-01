import {
    buildOssStringToSign,
    signOssRequest,
    signOssUrl,
} from "../src/network/ossSigner";

describe("ossSigner", () => {
    const accessKeyId = "OSS_ACCESS_KEY_ID";
    const accessKeySecret = "OSS_ACCESS_KEY_SECRET";

    describe("buildOssStringToSign", () => {
        it("should join verb, md5, type, date and resource", () => {
            const result = buildOssStringToSign(
                "GET",
                {},
                "/my-bucket/photo.jpg",
                "Fri, 01 Sep 2026 00:00:00 GMT"
            );

            expect(result).toBe(
                "GET\n\n\nFri, 01 Sep 2026 00:00:00 GMT\n/my-bucket/photo.jpg"
            );
        });

        it("should append canonicalized x-oss- headers before the resource", () => {
            const result = buildOssStringToSign(
                "GET",
                { "x-oss-security-token": "token123" },
                "/my-bucket/photo.jpg",
                "date"
            );

            expect(result).toBe(
                "GET\n\n\ndate\nx-oss-security-token:token123\n/my-bucket/photo.jpg"
            );
        });
    });

    describe("signOssRequest", () => {
        it("should return an authorization and a date header", async () => {
            const { authorization, date } = await signOssRequest({
                accessKeyId,
                accessKeySecret,
                method: "HEAD",
                resource: "/my-bucket/photo.jpg",
            });

            expect(date).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
            expect(authorization.startsWith(`OSS ${accessKeyId}:`)).toBe(true);
        });

        it("should be deterministic for the same date", async () => {
            const date = "Fri, 01 Sep 2026 00:00:00 GMT";
            const first = await signOssRequest({
                accessKeyId,
                accessKeySecret,
                method: "GET",
                resource: "/my-bucket/photo.jpg",
                date,
            });
            const second = await signOssRequest({
                accessKeyId,
                accessKeySecret,
                method: "GET",
                resource: "/my-bucket/photo.jpg",
                date,
            });

            expect(first.authorization).toBe(second.authorization);
        });
    });

    describe("signOssUrl", () => {
        it("should build a presigned URL with the expected query parameters", async () => {
            const url = await signOssUrl(
                {
                    accessKeyId,
                    accessKeySecret,
                    method: "GET",
                    resource: "/my-bucket/photo.jpg",
                    baseUrl: "https://oss-cn-hangzhou.aliyuncs.com",
                },
                3600
            );

            expect(
                url.startsWith(
                    "https://oss-cn-hangzhou.aliyuncs.com/my-bucket/photo.jpg?"
                )
            ).toBe(true);
            expect(url).toContain(
                `OSSAccessKeyId=${encodeURIComponent(accessKeyId)}`
            );
            expect(url).toContain("&Expires=");
            expect(url).toContain("&Signature=");
        });
    });
});
