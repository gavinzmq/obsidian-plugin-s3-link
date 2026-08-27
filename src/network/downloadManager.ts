import { DownloadRecord } from "./downloadRecord";
import { DownloadState } from "./downloadState";
import Config from "../config";
import Cache from "../cache";
import { Logger } from "../logger";

export default class DownloadManager {
    private static instance: DownloadManager;
    private readonly moduleName = "DownloadManager";
    private cache: Cache;

    private constructor() {
        this.cache = new Cache();
    }

    public static getInstance(): DownloadManager {
        if (!DownloadManager.instance) {
            DownloadManager.instance = new DownloadManager();
        }
        return DownloadManager.instance;
    }

    public addNewDownload(
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        const downloadRecord: DownloadRecord = {
            sourceId: sourceId,
            objectKey: objectKey,
            versionToken: versionToken,
            startedAt: Date.now(),
            downloadState: DownloadState.PENDING,
        };

        this.writeDownloadRecord(
            sourceId,
            objectKey,
            versionToken,
            downloadRecord
        );
    }

    public setRunningState(
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        const downloadRecord = this.getDownloadRecord(
            sourceId,
            objectKey,
            versionToken
        );

        downloadRecord.downloadState = DownloadState.RUNNING;
        this.writeDownloadRecord(
            sourceId,
            objectKey,
            versionToken,
            downloadRecord
        );
    }

    public setErrorState(
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        const downloadRecord = this.getDownloadRecord(
            sourceId,
            objectKey,
            versionToken
        );

        // Some streams emit a trailing 'error' after 'end'. Do not mark a
        // completed download as failed: doing so would delete a valid cached
        // file that was already saved successfully.
        if (downloadRecord.downloadState === DownloadState.COMPLETED) {
            return;
        }

        downloadRecord.downloadState = DownloadState.FAILED;
        this.writeDownloadRecord(
            sourceId,
            objectKey,
            versionToken,
            downloadRecord
        );
        this.cache.removeItemFromCache(sourceId, objectKey);
    }

    public setCompletedState(
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        const downloadRecord = this.getDownloadRecord(
            sourceId,
            objectKey,
            versionToken
        );

        downloadRecord.downloadState = DownloadState.COMPLETED;
        this.writeDownloadRecord(
            sourceId,
            objectKey,
            versionToken,
            downloadRecord
        );
    }

    public cleanUnfinishedDownloads() {
        const localStorageItems = Object.keys(window.localStorage);

        localStorageItems.forEach((key) => {
            if (
                key.startsWith(
                    `${Config.PLUGIN_NAME}-${Config.MANAGER_PREFIX}/`
                )
            ) {
                const downloadRecord = JSON.parse(
                    window.localStorage.getItem(key) as string
                ) as DownloadRecord;

                if (downloadRecord.downloadState !== DownloadState.COMPLETED) {
                    Logger.info(
                        `${this.moduleName} - Cleaning unfinished download for ${downloadRecord.objectKey}`
                    );
                    this.cache.removeItemFromCache(
                        downloadRecord.sourceId,
                        downloadRecord.objectKey
                    );
                    window.localStorage.removeItem(key);
                }
            }
        });
    }

    private writeDownloadRecord(
        sourceId: string,
        objectKey: string,
        versionToken: string,
        downloadRecord: DownloadRecord
    ) {
        window.localStorage.setItem(
            `${Config.PLUGIN_NAME}-${Config.MANAGER_PREFIX}/${sourceId}/${objectKey}/${versionToken}`,
            JSON.stringify(downloadRecord)
        );
    }

    private getDownloadRecord(
        sourceId: string,
        objectKey: string,
        versionToken: string
    ) {
        const record = window.localStorage.getItem(
            `${Config.PLUGIN_NAME}-${Config.MANAGER_PREFIX}/${sourceId}/${objectKey}/${versionToken}`
        );

        if (!record) {
            throw new Error(
                `Download record not found for objectKey: ${objectKey}, versionToken: ${versionToken}`
            );
        }

        return JSON.parse(record) as DownloadRecord;
    }
}
