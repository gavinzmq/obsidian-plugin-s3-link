import ImageResolver from "../src/resolver/imageResolver";
import Config from "../src/config";

describe("ImageResolver", () => {
    let resolver: ImageResolver;

    beforeEach(() => {
        resolver = new ImageResolver();
    });

    describe("resolveHtmlElement", () => {
        it("should return empty maps if no image tags are found", () => {
            const element = document.createElement("div");
            const result = resolver.resolveHtmlElement(element);

            expect(result.objectKeys.size).toBe(0);
            expect(result.signObjectKeys.size).toBe(0);
        });

        it("should process image tags and classify them based on src", () => {
            const element = document.createElement("div");
            const img1 = document.createElement("img");
            img1.src = `${Config.S3_LINK_PREFIX}${Config.S3_LINK_SPLITTER}objectKey`;
            const img2 = document.createElement("img");
            img2.src = `${Config.S3_SIGNED_LINK_PREFIX}${Config.S3_LINK_SPLITTER}objectKey`;

            element.appendChild(img1);
            element.appendChild(img2);

            const result = resolver.resolveHtmlElement(element);

            expect(result.objectKeys.size).toBe(1);
            expect(result.signObjectKeys.size).toBe(1);
        });

        it("should replace s3: src with a safe placeholder so the renderer never loads an unknown URL scheme", () => {
            const element = document.createElement("div");
            const img1 = document.createElement("img");
            img1.src = `${Config.S3_LINK_PREFIX}${Config.S3_LINK_SPLITTER}objectKey`;
            const img2 = document.createElement("img");
            img2.src = `${Config.S3_SIGNED_LINK_PREFIX}${Config.S3_LINK_SPLITTER}objectKey`;

            element.appendChild(img1);
            element.appendChild(img2);

            resolver.resolveHtmlElement(element);

            expect(img1.src).toBe(Config.S3_LINK_PLACEHOLDER);
            expect(img2.src).toBe(Config.S3_LINK_PLACEHOLDER);
        });

        it("should leave non-s3 images untouched", () => {
            const element = document.createElement("div");
            const img = document.createElement("img");
            img.src = "https://example.com/image.png";

            element.appendChild(img);

            resolver.resolveHtmlElement(element);

            expect(img.src).toBe("https://example.com/image.png");
        });
    });

    describe("findAllObjectKeysInElement", () => {
        it("should return object keys based on data attributes", () => {
            const element = document.createElement("div");
            const img1 = document.createElement("img");
            img1.setAttribute(
                Config.S3_LINK_PLUGIN_DATA_ATTRIBUTE,
                "objectKey1"
            );
            const img2 = document.createElement("img");
            img2.setAttribute(
                Config.S3_LINK_PLUGIN_DATA_ATTRIBUTE,
                "objectKey2"
            );

            element.appendChild(img1);
            element.appendChild(img2);

            const result = resolver.findAllObjectKeysInElement(element);
            expect(result).toEqual(["objectKey1", "objectKey2"]);
        });

        it("should ignore images without the data attribute", () => {
            const element = document.createElement("div");
            const img1 = document.createElement("img");
            img1.setAttribute(
                Config.S3_LINK_PLUGIN_DATA_ATTRIBUTE,
                "objectKey"
            );
            const img2 = document.createElement("img");

            element.appendChild(img1);
            element.appendChild(img2);

            const result = resolver.findAllObjectKeysInElement(element);
            expect(result).toEqual(["objectKey"]);
        });

        it("it should ignore images with invalid data attribute", () => {
            const element = document.createElement("div");
            const img1 = document.createElement("img");
            img1.setAttribute("invalid-data-attribute", "objectKey");

            element.appendChild(img1);

            const result = resolver.findAllObjectKeysInElement(element);
            expect(result).not.toContain("objectKey");
        });
    });
});
