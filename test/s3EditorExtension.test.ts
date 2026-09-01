import {
    extractSchemeKey,
    extractSize,
    setLinkSize,
} from "../src/editor/s3EditorExtension";

describe("s3EditorExtension link helpers", () => {
    describe("extractSchemeKey", () => {
        it("extracts the key from `![](s3:...)`", () => {
            expect(extractSchemeKey("![](s3:images/x.jpeg)")).toBe(
                "s3:images/x.jpeg"
            );
        });

        it("strips a legacy size suffix from the destination", () => {
            expect(
                extractSchemeKey("![](s3:images/x.jpeg|400x300)")
            ).toBe("s3:images/x.jpeg");
        });

        it("extracts the key when the size is in the brackets", () => {
            expect(
                extractSchemeKey("![alt|400](s3:images/x.jpeg)")
            ).toBe("s3:images/x.jpeg");
        });

        it("extracts wiki embed keys and strips their size", () => {
            expect(
                extractSchemeKey("![[s3:images/x.jpeg|400]]")
            ).toBe("s3:images/x.jpeg");
        });

        it("extracts plain wiki link keys (no `!`)", () => {
            expect(extractSchemeKey("[[s3:images/x.jpeg]]")).toBe(
                "s3:images/x.jpeg"
            );
        });

        it("strips an alias from plain wiki links", () => {
            expect(extractSchemeKey("[[s3:images/x.jpeg|alt]]")).toBe(
                "s3:images/x.jpeg"
            );
        });
    });

    describe("extractSize", () => {
        it("reads a size from the brackets (Obsidian-native)", () => {
            expect(extractSize("![alt|400](s3:images/x.jpeg)")).toEqual({
                width: 400,
                height: 0,
            });
        });

        it("reads a WxH size from the brackets", () => {
            expect(extractSize("![alt|400x300](s3:images/x.jpeg)")).toEqual({
                width: 400,
                height: 300,
            });
        });

        it("reads a legacy size from the destination", () => {
            expect(
                extractSize("![](s3:images/x.jpeg|400x300)")
            ).toEqual({ width: 400, height: 300 });
        });

        it("returns null when the link carries no size", () => {
            expect(extractSize("![alt](s3:images/x.jpeg)")).toBeNull();
        });

        it("reads a size from wiki embeds", () => {
            expect(extractSize("![[s3:images/x.jpeg|300]]")).toEqual({
                width: 300,
                height: 0,
            });
        });
    });

    describe("setLinkSize", () => {
        it("writes the size into the brackets for markdown links", () => {
            expect(setLinkSize("![](s3:images/x.jpeg)", 400, 300)).toBe(
                "![|400x300](s3:images/x.jpeg)"
            );
        });

        it("keeps an existing alt caption in the brackets", () => {
            expect(setLinkSize("![alt](s3:images/x.jpeg)", 400, 300)).toBe(
                "![alt|400x300](s3:images/x.jpeg)"
            );
        });

        it("migrates a legacy destination size into the brackets", () => {
            expect(
                setLinkSize("![](s3:images/x.jpeg|200x100)", 400, 300)
            ).toBe("![|400x300](s3:images/x.jpeg)");
        });

        it("replaces an existing size in the brackets", () => {
            expect(
                setLinkSize("![alt|200x100](s3:images/x.jpeg)", 400, 300)
            ).toBe("![alt|400x300](s3:images/x.jpeg)");
        });

        it("keeps the wiki embed form", () => {
            expect(setLinkSize("![[s3:images/x.jpeg]]", 400, 300)).toBe(
                "![[s3:images/x.jpeg|400x300]]"
            );
        });

        it("replaces an existing wiki size", () => {
            expect(
                setLinkSize("![[s3:images/x.jpeg|100]]", 400, 300)
            ).toBe("![[s3:images/x.jpeg|400x300]]");
        });
    });
});
