import Config from "../src/config";
import {
    isS3SchemeSrc,
    neutralizeS3Src,
    startPlaceholderGuard,
} from "../src/placeholderGuard";

describe("placeholderGuard", () => {
    describe("isS3SchemeSrc", () => {
        it("should detect s3: and s3-sign: schemes", () => {
            expect(isS3SchemeSrc("s3:images/x.jpeg")).toBe(true);
            expect(isS3SchemeSrc("s3-sign:abc.jpg")).toBe(true);
        });

        it("should ignore other schemes and empty values", () => {
            expect(isS3SchemeSrc("https://example.com/x.jpeg")).toBe(false);
            expect(isS3SchemeSrc("app://local/...")).toBe(false);
            expect(isS3SchemeSrc("data:image/gif;base64,...")).toBe(false);
        });
    });

    describe("neutralizeS3Src", () => {
        it("should replace an img src with the placeholder", () => {
            const img = document.createElement("img");
            img.setAttribute("src", "s3:images/x.jpeg");

            expect(neutralizeS3Src(img)).toBe(true);
            expect(img.getAttribute("src")).toBe(Config.S3_LINK_PLACEHOLDER);
        });

        it("should remove the src of a video", () => {
            const video = document.createElement("video");
            video.setAttribute("src", "s3:video.mp4");

            expect(neutralizeS3Src(video)).toBe(true);
            expect(video.hasAttribute("src")).toBe(false);
        });

        it("should not touch non-s3 elements", () => {
            const img = document.createElement("img");
            img.setAttribute("src", "https://example.com/x.jpeg");

            expect(neutralizeS3Src(img)).toBe(false);
            expect(img.getAttribute("src")).toBe("https://example.com/x.jpeg");
        });
    });

    describe("startPlaceholderGuard", () => {
        it("should neutralize an img src set to the s3: scheme", (done) => {
            const observer = startPlaceholderGuard();
            const img = document.createElement("img");
            document.body.appendChild(img);
            img.setAttribute("src", "s3:images/x.jpeg");

            // MutationObserver callbacks fire asynchronously (microtask).
            setTimeout(() => {
                expect(img.getAttribute("src")).toBe(
                    Config.S3_LINK_PLACEHOLDER
                );
                observer.disconnect();
                img.remove();
                done();
            }, 50);
        });

        it("should leave non-s3 images untouched", (done) => {
            const observer = startPlaceholderGuard();
            const img = document.createElement("img");
            document.body.appendChild(img);
            img.setAttribute("src", "https://example.com/x.jpeg");

            setTimeout(() => {
                expect(img.getAttribute("src")).toBe(
                    "https://example.com/x.jpeg"
                );
                observer.disconnect();
                img.remove();
                done();
            }, 50);
        });
    });
});
