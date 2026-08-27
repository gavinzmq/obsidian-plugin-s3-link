import S3LinkPlugin from "../main";
import { App, PluginSettingTab, Setting } from "obsidian";
import {
    StorageSource,
    createDefaultSource,
    getComposedEndpoint,
    isKnownProvider,
} from "./settings";
import Config from "../config";
import { Language, setLanguage, t } from "../i18n";
import { StorageClientFactory } from "../network/storageClientFactory";
import { sendNotification } from "../ui/notification";

/**
 * Settings tab supporting multiple storage sources (AWS S3, Tencent Cloud COS,
 * Aliyun OSS, S3-compatible) with a provider dropdown, auto-composed endpoints
 * for known providers, a connection test and a language selector (i18n).
 */
export class PluginSettingsTab extends PluginSettingTab {
    plugin: S3LinkPlugin;

    constructor(app: App, plugin: S3LinkPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const { containerEl } = this;

        containerEl.empty();

        this.renderLanguageSetting(containerEl);

        containerEl.createEl("p", { text: t("settingsIntro") });

        new Setting(containerEl)
            .setName(t("autoReplace"))
            .setDesc(t("autoReplaceDesc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoReplaceEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.autoReplaceEnabled = value;
                        await this.plugin.saveSettings();
                    })
            );

        const sources = this.plugin.settings.sources;

        if (sources.length === 0) {
            containerEl.createEl("p", { text: t("noSources") });
        }

        sources.forEach((source, index) => {
            this.renderSource(containerEl, source, index);
        });

        new Setting(containerEl).addButton((button) =>
            button.setButtonText(t("addSource")).onClick(async () => {
                this.plugin.settings.sources.push(createDefaultSource());
                await this.plugin.saveSettings();
                this.display();
            })
        );
    }

    private getProviderOptions(): Record<string, string> {
        return {
            [Config.PROVIDERS.AWS]: t("providerAws"),
            [Config.PROVIDERS.TENCENT_COS]: t("providerTencent"),
            [Config.PROVIDERS.ALIYUN_OSS]: t("providerAliyun"),
            [Config.PROVIDERS.S3_COMPATIBLE]: t("providerS3Compatible"),
        };
    }

    private renderLanguageSetting(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName(t("language"))
            .setDesc(t("languageDesc"))
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({ en: "English", zh: "中文" })
                    .setValue(this.plugin.settings.language)
                    .onChange(async (value: Language) => {
                        this.plugin.settings.language = value;
                        setLanguage(value);
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );
    }

    private renderSource(
        containerEl: HTMLElement,
        source: StorageSource,
        index: number
    ) {
        new Setting(containerEl)
            .setName(`${t("storageSource")} ${index + 1}`)
            .setHeading();

        new Setting(containerEl)
            .setName(t("name"))
            .setDesc(t("nameDesc"))
            .addText((text) =>
                text
                    .setValue(source.name)
                    .onChange(async (value) => {
                        source.name = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("provider"))
            .setDesc(t("providerDesc"))
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions(this.getProviderOptions())
                    .setValue(source.provider)
                    .onChange(async (value) => {
                        source.provider = value;
                        // custom endpoints only apply to s3-compatible sources
                        if (value !== Config.PROVIDERS.S3_COMPATIBLE) {
                            source.endpoint = "";
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (isKnownProvider(source)) {
            const composedEndpoint = getComposedEndpoint(source);
            new Setting(containerEl)
                .setName(t("endpoint"))
                .setDesc(
                    composedEndpoint
                        ? `${t("endpointComposed")}: ${composedEndpoint}`
                        : t("endpointKnownDesc")
                );
        } else {
            new Setting(containerEl)
                .setName(t("endpoint"))
                .setDesc(t("endpointCustomDesc"))
                .addText((text) =>
                    text
                        .setPlaceholder(t("endpointPlaceholder"))
                        .setValue(source.endpoint)
                        .onChange(async (value) => {
                            source.endpoint = value;
                            await this.plugin.saveSettings();
                        })
                );
        }

        new Setting(containerEl)
            .setName(t("bucket"))
            .addText((text) =>
                text
                    .setValue(source.bucketName)
                    .onChange(async (value) => {
                        source.bucketName = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("region"))
            .setDesc(t("regionDesc"))
            .addText((text) =>
                text
                    .setValue(source.region)
                    .onChange(async (value) => {
                        source.region = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("accessKey"))
            .setDesc(t("accessKey"))
            .addText((text) =>
                text
                    .setValue(source.accessKeyId)
                    .onChange(async (value) => {
                        source.accessKeyId = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("secretKey"))
            .setDesc(t("secretKey"))
            .addText((text) =>
                text
                    .setValue(source.secretAccessKey)
                    .onChange(async (value) => {
                        source.secretAccessKey = value;
                        await this.plugin.saveSettings();
                    })
            );

        if (source.provider === Config.PROVIDERS.S3_COMPATIBLE) {
            new Setting(containerEl)
                .setName(t("pathStyle"))
                .setDesc(t("pathStyleDesc"))
                .addToggle((toggle) =>
                    toggle
                        .setValue(source.pathStyle)
                        .onChange(async (value) => {
                            source.pathStyle = value;
                            await this.plugin.saveSettings();
                        })
                );
        }

        new Setting(containerEl)
            .setName(t("defaultSource"))
            .setDesc(t("defaultSourceDesc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(source.defaultSource)
                    .onChange(async (value) => {
                        this.plugin.settings.sources.forEach(
                            (s) => (s.defaultSource = false)
                        );
                        source.defaultSource = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName(t("signLinks"))
            .addToggle((toggle) =>
                toggle
                    .setValue(source.signLinkEnabled)
                    .onChange(async (value) => {
                        source.signLinkEnabled = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .addButton((button) =>
                button
                    .setButtonText(t("testConnection"))
                    .setCta()
                    .onClick(async () => {
                        button.setDisabled(true);
                        try {
                            const client =
                                StorageClientFactory.create(source);
                            await client.testConnection();
                            sendNotification(t("testSuccess"));
                        } catch (error) {
                            console.error(
                                `Connection test failed for source ${source.name}`,
                                error
                            );
                            sendNotification(t("testFailed"));
                        } finally {
                            button.setDisabled(false);
                        }
                    })
            )
            .addButton((button) =>
                button
                    .setButtonText(t("removeSource"))
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.sources =
                            this.plugin.settings.sources.filter(
                                (s) => s.id !== source.id
                            );
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );
    }
}
