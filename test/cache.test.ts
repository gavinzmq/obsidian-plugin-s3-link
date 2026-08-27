import * as fs from "fs";
import Cache from "../src/cache";
import Config from "../src/config";
import S3Link from "../src/model/s3Link";
import S3SignedLink from "../src/model/s3SignedLink";
import { getCacheFileName } from "../src/obsidianHelper";
import { localStorageMock } from "./mock/localStorageMock";

describe("Cache", () => {
    let cache: Cache;
    let originalSetItem: (key: string, value: string) => void;
    let originalRemoveItem: (key: string) => void;
    const mockSourceId = "source-test-1";

    beforeEach(() => {
        // update window object with mocked local storage
        Object.defineProperty(global.window, "localStorage", {
            value: localStorageMock,
            writable: true,
        });

        // store the original setItem function
        originalSetItem = window.localStorage.setItem;
        // store the original removeItem function
        originalRemoveItem = window.localStorage.removeItem;

        cache = new Cache();
    });

    afterEach(() => {
        // restore the original setItem function
        window.localStorage.setItem = originalSetItem;
        // restore the original removeItem function
        window.localStorage.removeItem = originalRemoveItem;
        // clear the localStorage between tests
        window.localStorage.clear();
        jest.clearAllMocks();
    });

    describe("writeItemToCache", () => {
        it("should write an entry to localStorage for the given objectKey and versionToken", () => {
            const mockObjectKey = "testKey";
            const mockVersionToken = "12345";
            const expectedKey = `${Config.PLUGIN_NAME}/${mockSourceId}/${mockObjectKey}`;

            window.localStorage.setItem = jest.fn();
            cache.writeItemToCache(
                mockSourceId,
                mockObjectKey,
                mockVersionToken
            );

            expect(localStorage.setItem).toHaveBeenCalledWith(
                expectedKey,
                expect.any(String)
            );

            const mockSetItemCall = (window.localStorage.setItem as jest.Mock)
                .mock.calls[0];

            const storedKey = mockSetItemCall[0];
            expect(storedKey).toBe(expectedKey);

            const storedValue = JSON.parse(mockSetItemCall[1]);
            expect(storedValue.objectKey).toEqual(mockObjectKey);
            expect(storedValue.versionToken).toEqual(mockVersionToken);
            expect(storedValue.sourceId).toEqual(mockSourceId);
            expect(storedValue.lastUpdate).toBeDefined();
        });
    });

    describe("findItemInCache", () => {
        it("should retrieve a valid cached item", () => {
            const mockObjectKey = "testObject";
            const mockS3Link = new S3Link(
                mockObjectKey,
                Date.now(),
                "version123",
                mockSourceId
            );
            localStorage.setItem(
                `${Config.PLUGIN_NAME}/${mockSourceId}/${mockObjectKey}`,
                JSON.stringify(mockS3Link)
            );

            const result = cache.findItemInCache(mockSourceId, mockObjectKey);

            expect(result).toBeInstanceOf(S3Link);
            expect(result?.objectKey).toBe(mockObjectKey);
        });

        it("should return null if the objectKey is not found in localStorage", () => {
            const mockObjectKey = "testKey";
            localStorage.getItem("testKey");

            const result = cache.findItemInCache(mockSourceId, mockObjectKey);
            expect(result).toBeNull();
        });
    });

    describe("isS3LinkCacheItemExpired", () => {
        it("should return false for a non-expired cache item", () => {
            const recentTimestamp =
                Date.now() -
                (Config.S3_LINK_EXPIRATION_TIME_SECONDS - 10) * 1000; // 10 seconds before expiration time

            const result = cache.isS3LinkCacheItemExpired(recentTimestamp);

            expect(result).toBe(false);
        });

        it("should return true for an expired cache item", () => {
            const oldTimestamp =
                Date.now() -
                (Config.S3_LINK_EXPIRATION_TIME_SECONDS + 10) * 1000; // 10 seconds past expiration time

            const result = cache.isS3LinkCacheItemExpired(oldTimestamp);

            expect(result).toBe(true);
        });
    });

    describe("isFileInCacheFolder", () => {
        beforeEach(() => {
            // minimal app mock so getCachePath() resolves a base path
            (global as { app?: unknown }).app = {
                vault: {
                    adapter: {
                        getBasePath: () => "/mock/vault",
                    },
                },
            };
        });

        afterEach(() => {
            delete (global as { app?: unknown }).app;
            jest.restoreAllMocks();
        });

        it("should return true when the cached file exists in the cache folder", () => {
            const mockObjectKey = "test.jpg";
            const mockS3Link = new S3Link(
                mockObjectKey,
                Date.now(),
                "version123",
                mockSourceId
            );
            const fileName = getCacheFileName(mockObjectKey, "version123");

            const existsSyncSpy = jest
                .spyOn(fs, "existsSync")
                .mockReturnValue(true);

            const result = cache.isFileInCacheFolder(mockS3Link);

            expect(result).toBe(true);
            expect(existsSyncSpy).toHaveBeenCalledWith(
                expect.stringContaining(fileName)
            );
        });

        it("should return false when the cached file is missing from the cache folder", () => {
            const mockObjectKey = "test.jpg";
            const mockS3Link = new S3Link(
                mockObjectKey,
                Date.now(),
                "version123",
                mockSourceId
            );

            jest.spyOn(fs, "existsSync").mockReturnValue(false);

            const result = cache.isFileInCacheFolder(mockS3Link);

            expect(result).toBe(false);
        });
    });

    describe("writeSignedUrlToLocalStorage", () => {
        it("should write the signedUrl for the given objectKey to localStorage", () => {
            const mockObjectKey = "testKey";
            const mockSignedUrl = "https://signed.url/test";
            const expectedKey = `${Config.PLUGIN_NAME}/${mockSourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${mockObjectKey}`;

            window.localStorage.setItem = jest.fn();
            cache.writeSignedUrlToLocalStorage(
                mockSourceId,
                mockObjectKey,
                mockSignedUrl
            );

            expect(localStorage.setItem).toHaveBeenCalledWith(
                expectedKey,
                expect.any(String)
            );

            const mockSetItemCall = (window.localStorage.setItem as jest.Mock)
                .mock.calls[0];

            const storedSignedUrl = mockSetItemCall[0];
            expect(storedSignedUrl).toBe(expectedKey);

            const storedValue = JSON.parse(mockSetItemCall[1]);
            expect(storedValue.objectKey).toBe(mockObjectKey);
            expect(storedValue.signedUrl).toBe(mockSignedUrl);
            expect(storedValue.lastUpdate).toBeDefined();
        });
    });

    // write a test for expired signed url this should also return null from findSignedUrlInCache
    // this in turn will trigger a new signed url to be generated
    describe("findSignedUrlInCache", () => {
        it("should retrieve a valid cached item", () => {
            const mockObjectKey = "testKey";
            const mockSignedUrl = "https://signed.url/test";
            const mockS3SignedLink = new S3SignedLink(
                mockObjectKey,
                Date.now(),
                mockSignedUrl
            );

            localStorage.setItem(
                `${Config.PLUGIN_NAME}/${mockSourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${mockObjectKey}`,
                JSON.stringify(mockS3SignedLink)
            );

            const result = cache.findSignedUrlInCache(
                mockSourceId,
                mockObjectKey
            );
            expect(result).toBeInstanceOf(S3SignedLink);
            expect(result?.objectKey).toBe(mockObjectKey);
        });

        it("should return null for an invalid(expired) cached item", () => {
            const mockObjectKey = "testKey";
            const mockSignedUrl = "https://signed.url/test";
            const expectedKey = `${Config.PLUGIN_NAME}/${mockSourceId}/${Config.S3_SIGNED_LINK_PREFIX}/${mockObjectKey}`;
            const mockS3SignedLink = new S3SignedLink(
                mockObjectKey,
                Date.now() -
                    (Config.S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS * 1000 +
                        100), // create expired signed url
                mockSignedUrl
            );

            window.localStorage.removeItem = jest.fn();
            localStorage.setItem(expectedKey, JSON.stringify(mockS3SignedLink));
            const result = cache.findSignedUrlInCache(
                mockSourceId,
                mockObjectKey
            );
            expect(result).toBeNull();
            expect(localStorage.removeItem).toHaveBeenCalledWith(expectedKey);
        });

        it("should return null if the objectKey does not exist in cache", () => {
            const mockObjectKey = "testKey";
            const result = cache.findSignedUrlInCache(
                mockSourceId,
                mockObjectKey
            );

            expect(result).toBeNull();
        });
    });
});
