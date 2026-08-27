/**
 * S3Link
 *
 * Represents all relevant data for a cached object.
 */
export default class S3Link {
    objectKey: string;
    lastUpdate: number;
    versionToken: string;
    sourceId: string;

    constructor(
        objectKey: string,
        lastUpdate: number,
        versionToken: string,
        sourceId: string
    ) {
        this.objectKey = objectKey;
        this.lastUpdate = lastUpdate;
        this.versionToken = versionToken;
        this.sourceId = sourceId;
    }
}
