import { DownloadState } from "./downloadState";

export type DownloadRecord = {
    sourceId: string;
    objectKey: string;
    versionToken: string;
    startedAt: number;
    downloadState: DownloadState;
};
