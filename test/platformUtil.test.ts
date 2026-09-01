import {
    bytesToBase64,
    bytesToHex,
    getFileExtension,
    joinVaultPath,
    sha1Hex,
    sha256Hex,
    streamToUint8Array,
} from "../src/platformUtil";

describe("platformUtil", () => {
    describe("sha1Hex", () => {
        it("should compute the SHA-1 digest of a string", async () => {
            // SHA-1 of "abc"
            expect(await sha1Hex("abc")).toBe(
                "a9993e364706816aba3e25717850c26c9cd0d89d"
            );
        });

        it("should compute the SHA-1 digest of bytes", async () => {
            const bytes = new TextEncoder().encode("abc");
            expect(await sha1Hex(bytes)).toBe(
                "a9993e364706816aba3e25717850c26c9cd0d89d"
            );
        });
    });

    describe("sha256Hex", () => {
        it("should compute the SHA-256 digest of a string", async () => {
            // SHA-256 of "" (empty payload, used by SigV4)
            expect(await sha256Hex("")).toBe(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            );
        });
    });

    describe("bytesToHex", () => {
        it("should convert bytes to lowercase hex", () => {
            expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe(
                "deadbeef"
            );
        });
    });

    describe("bytesToBase64", () => {
        it("should convert bytes to base64", () => {
            expect(bytesToBase64(new Uint8Array([0, 1, 2]))).toBe("AAEC");
        });

        it("should pad with '=' for partial groups", () => {
            expect(bytesToBase64(new Uint8Array([1, 2]))).toBe("AQI=");
            expect(bytesToBase64(new Uint8Array([1]))).toBe("AQ==");
        });
    });

    describe("getFileExtension", () => {
        it("should return the extension including the dot", () => {
            expect(getFileExtension("images/photo.jpg")).toBe(".jpg");
            expect(getFileExtension("video.mp4")).toBe(".mp4");
        });

        it("should return an empty string when there is no extension", () => {
            expect(getFileExtension("images/photo")).toBe("");
            expect(getFileExtension("folder")).toBe("");
        });
    });

    describe("joinVaultPath", () => {
        it("should join segments with '/'", () => {
            expect(joinVaultPath("s3_cache", "abc.jpg")).toBe(
                "s3_cache/abc.jpg"
            );
        });

        it("should ignore empty segments", () => {
            expect(joinVaultPath("s3_cache", "", "abc.jpg")).toBe(
                "s3_cache/abc.jpg"
            );
        });
    });

    describe("streamToUint8Array", () => {
        it("should collect an async iterable of bytes into one Uint8Array", async () => {
            async function* chunks() {
                yield new Uint8Array([1, 2, 3]);
                yield new Uint8Array([4, 5]);
            }

            const result = await streamToUint8Array(chunks());
            expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
        });
    });
});
