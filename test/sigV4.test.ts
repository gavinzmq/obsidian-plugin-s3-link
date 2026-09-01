import {
    encodeS3PathKey,
    presignGetV4,
    signRequestV4,
    uriEncode,
} from "../src/network/sigV4";

describe("sigV4", () => {
    const accessKeyId = "AKIDEXAMPLE";
    const secretAccessKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const region = "us-east-1";
    const date = new Date("2015-08-30T12:36:00Z");

    describe("uriEncode", () => {
        it("should keep unreserved characters and encode the rest", () => {
            expect(uriEncode("a b", false)).toBe("a%20b");
            expect(uriEncode("a/b", false)).toBe("a/b");
            expect(uriEncode("a/b", true)).toBe("a%2Fb");
            expect(uriEncode("x~y", true)).toBe("x~y");
        });
    });

    describe("encodeS3PathKey", () => {
        it("should encode special characters but keep slashes", () => {
            expect(encodeS3PathKey("folder/my file.jpg")).toBe(
                "folder/my%20file.jpg"
            );
        });
    });

    describe("signRequestV4", () => {
        it("should produce a signature identical to the AWS SDK (@smithy)", async () => {
            // The expected signature was generated with the official
            // @smithy/signature-v4 implementation for the same inputs.
            const headers = await signRequestV4({
                region,
                accessKeyId,
                secretAccessKey,
                service: "service",
                method: "GET",
                host: "example.amazonaws.com",
                path: "/",
                query: { Param1: "value1" },
                headers: { range: "bytes=0-9" },
                payloadHash:
                    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                date,
            });

            expect(headers["x-amz-date"]).toBe("20150830T123600Z");
            expect(headers["Authorization"]).toBe(
                "AWS4-HMAC-SHA256 " +
                    "Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
                    "SignedHeaders=host;range;x-amz-date, " +
                    "Signature=fe30695f12cb7a4722f7fb9ab146f40eb05924eb4f6da74fba85500aadcb4cc7"
            );
        });

        it("should include a host header and the authorization header", async () => {
            const headers = await signRequestV4({
                region,
                accessKeyId,
                secretAccessKey,
                method: "GET",
                host: "my-bucket.s3.us-east-1.amazonaws.com",
                path: "/photo.jpg",
                payloadHash:
                    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                date,
            });

            expect(headers["host"]).toBe(
                "my-bucket.s3.us-east-1.amazonaws.com"
            );
            expect(headers["Authorization"]).toContain("Credential=AKIDEXAMPLE/");
            expect(headers["Authorization"]).toContain("Signature=");
        });
    });

    describe("presignGetV4", () => {
        it("should return a signed URL with the expected query parameters", async () => {
            const url = await presignGetV4({
                region,
                accessKeyId,
                secretAccessKey,
                host: "my-bucket.s3.us-east-1.amazonaws.com",
                path: "/photo.jpg",
                expiresIn: 3600,
                date,
            });

            expect(url.startsWith("https://my-bucket.s3.us-east-1.amazonaws.com/photo.jpg?")).toBe(
                true
            );
            expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
            expect(url).toContain("X-Amz-Credential=AKIDEXAMPLE%2F20150830");
            expect(url).toContain("X-Amz-Date=20150830T123600Z");
            expect(url).toContain("X-Amz-Expires=3600");
            expect(url).toContain("X-Amz-Signature=");
        });
    });
});
