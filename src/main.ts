import { Plugin, TAbstractFile, TFile } from "obsidian";
import Config from "./config";
import Cache from "./cache";
import { S3PostProcessor } from "./s3PostProcessor";
import { PluginSettingsTab } from "./settings/settingsTab";
import {
    PluginSettings,
    DEFAULT_SETTINGS,
    isPluginReadyState,
    createDefaultSource,
    isLegacySettings,
    migrateLegacySettings,
} from "./settings/settings";
import { PluginState } from "./pluginState";
import { StatusBar } from "./ui/statusBar";
import { sendNotification } from "./ui/notification";
import { setLanguage } from "./i18n";
import { Logger } from "./logger";
import ClearCacheGlobalCommand from "./command/clearCacheGlobalCommand";
import ClearCacheLocalCommand from "./command/clearCacheLocalCommand";
import ReloadActiveLeafCommand from "./command/reloadActiveLeafCommand";
import ReloadAllLeafsCommand from "./command/reloadAllLeafsCommand";
import DownloadManager from "./network/downloadManager";
import { replaceRemoteUrls } from "./autoReplace";

export default class S3LinkPlugin extends Plugin {
    private readonly moduleName = "Main";
    cache: Cache;
    settings: PluginSettings;
    pluginState: PluginState;
    statusBar: StatusBar;
    s3PostProcessor: S3PostProcessor;
    private isAutoReplaceProcessing = false;

    async onload() {
        Logger.info(
            `${this.moduleName}::onload - Loading plugin - ${Config.PLUGIN_NAME}`
        );

        this.statusBar = new StatusBar(this);
        this.setState(PluginState.LOADING);

        // setup settings
        await this.loadSettings();
        this.addSettingTab(new PluginSettingsTab(this.app, this));

        this.cache = await new Cache();
        this.cache.init();

        // cleanup unfinished downloads
        DownloadManager.getInstance().cleanUnfinishedDownloads();

        this.setupMarkdownPostProcessor(this.cache);
        this.addPluginCommands(this);
        this.registerVaultListeners();

        if (isPluginReadyState(this.settings)) {
            this.setState(PluginState.READY);
        } else {
            this.setState(PluginState.CONFIG);
        }
    }

    async onunload() {
        Logger.info(`${this.moduleName}::onunload - Unloading plugin`);

        this.cache.closeAllOpenStreams();
    }

    async loadSettings() {
        Logger.debug(
            `${this.moduleName}::loadSettings - Loading settings for ${Config.PLUGIN_NAME}`
        );

        const data = await this.loadData();
        let settings: PluginSettings;

        if (isLegacySettings(data)) {
            Logger.info(
                `${this.moduleName}::loadSettings - Migrating legacy settings to storage sources`
            );
            settings = migrateLegacySettings(
                data as Record<string, unknown>
            );
        } else {
            settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
        }

        // guarantee that at least one storage source exists
        if (!settings.sources || settings.sources.length === 0) {
            settings.sources = [createDefaultSource()];
        }

        this.settings = settings;
        setLanguage(this.settings.language || "en");
        Logger.setLevel(this.settings.logLevel || DEFAULT_SETTINGS.logLevel);
    }

    async saveSettings() {
        Logger.debug(
            `${this.moduleName}::saveSettings - Saving settings for ${Config.PLUGIN_NAME}`
        );

        await this.saveData(this.settings);

        setLanguage(this.settings.language || "en");
        Logger.setLevel(this.settings.logLevel || DEFAULT_SETTINGS.logLevel);

        if (isPluginReadyState(this.settings)) {
            this.setState(PluginState.READY);
        } else {
            this.setState(PluginState.CONFIG);
        }

        this.s3PostProcessor.onSettingsChanged(this.settings);
    }

    private addPluginCommands(plugin: S3LinkPlugin) {
        new ClearCacheGlobalCommand().addCommand(plugin);
        new ClearCacheLocalCommand().addCommand(plugin);
        new ReloadActiveLeafCommand().addCommand(plugin);
        new ReloadAllLeafsCommand().addCommand(plugin);
    }

    /**
     * Registers vault listeners used for the optional auto-replace feature
     * (replace https:// URLs matching configured sources with s3: links).
     */
    private registerVaultListeners() {
        this.registerEvent(
            this.app.vault.on("modify", (file: TAbstractFile) =>
                this.onFileModified(file)
            )
        );
        this.registerEvent(
            this.app.vault.on("create", (file: TAbstractFile) =>
                this.onFileModified(file)
            )
        );
    }

    /**
     * Called when a vault file is created or modified. When the auto-replace
     * toggle is enabled it rewrites matching https:// URLs to s3: links.
     * A guard prevents recursive processing of the rewritten file.
     *
     * @param file the affected file
     */
    private async onFileModified(file: TAbstractFile) {
        if (!(file instanceof TFile)) {
            return;
        }

        if (!this.settings.autoReplaceEnabled) {
            return;
        }

        if (file.extension !== "md") {
            return;
        }

        if (this.isAutoReplaceProcessing) {
            return;
        }

        this.isAutoReplaceProcessing = true;

        try {
            const content = await this.app.vault.read(file);
            const replaced = replaceRemoteUrls(
                content,
                this.settings.sources
            );

            if (replaced !== content) {
                await this.app.vault.modify(file, replaced);
            }
        } catch (error) {
            Logger.error("Failed to auto-replace remote URLs", error);
        } finally {
            this.isAutoReplaceProcessing = false;
        }
    }

    /**
     *
     * @param cache
     */
    private setupMarkdownPostProcessor(cache: Cache) {
        Logger.debug(
            `${this.moduleName}::setupMarkdownPostProcessor - Setting up markdown post processor`
        );

        this.s3PostProcessor = new S3PostProcessor(this, cache, this.settings);

        this.registerMarkdownPostProcessor(
            this.s3PostProcessor.onMarkdownPostProcessor.bind(
                this.s3PostProcessor
            )
        );
    }

    public setState(state: PluginState, msg = ""): void {
        if (!this.statusBar) {
            throw new Error("Status bar not initialized");
        }

        switch (state) {
            case PluginState.LOADING:
                this.pluginState = PluginState.LOADING;
                this.statusBar.setStatusBarText(
                    msg || "Loading",
                    "lucide-loader"
                );

                break;
            case PluginState.READY:
                this.pluginState = PluginState.READY;
                this.statusBar.setStatusBarText(msg || "Ready", "lucide-check");

                break;
            case PluginState.CONFIG:
                this.pluginState = PluginState.CONFIG;
                this.statusBar.setStatusBarText(
                    msg || "Missing Configuration",
                    "lucide-settings"
                );
                sendNotification(
                    "Plugin is missing configuration - Please check settings"
                );

                break;
            case PluginState.ERROR:
                this.pluginState = PluginState.ERROR;
                this.statusBar.setStatusBarText(
                    msg || "Error State",
                    "lucide-x-circle"
                );

                break;
        }
    }
}
