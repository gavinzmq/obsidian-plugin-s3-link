import S3LinkPlugin from "src/main";
import Command from "./command";
import Config from "src/config";
import { sendNotification } from "src/ui/notification";
import { Logger } from "src/logger";

export default class ClearCacheGlobalCommand extends Command {
    protected readonly moduleName = "ClearCacheGlobalCommand";
    protected readonly commandId = `${Config.PLUGIN_NAME}-clear-cache-global-command`;
    protected readonly commandName = "Clear Cache";

    public addCommand(plugin: S3LinkPlugin): void {
        Logger.debug(
            `${this.moduleName}::addCommand - Adding command`
        );

        plugin.addCommand({
            id: this.commandId,
            name: this.commandName,
            callback: () => {
                Logger.debug(
                    `${this.moduleName} - Clearing global cache`
                );
                this.executeCommand(plugin);
            },
        });
    }

    protected executeCommand(plugin: S3LinkPlugin): void {
        plugin.cache.clearCache();

        sendNotification("Cleared global cache");
    }
}
