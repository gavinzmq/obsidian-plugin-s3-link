import S3LinkPlugin from "../main";
import { App, PluginSettingTab, Setting } from "obsidian";
import { StorageSource, createDefaultSource } from "./settings";

/**
 * Settings tab rendered entirely with text inputs (no provider specific
 * dropdowns) supporting AWS S3, Tencent Cloud COS, Aliyun OSS and any
 * S3-compatible endpoint.
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

        const sources = this.plugin.settings.sources;

        containerEl.createEl("p", {
            text: "Configure one or more storage sources. All fields are plain text inputs and support AWS S3, Tencent Cloud COS, Aliyun OSS and any S3-compatible endpoint.",
        });

        if (sources.length === 0) {
            containerEl.createEl("p", {
                text: "No storage sources configured yet. Add a source to start using the plugin.",
            });
        }

        sources.forEach((source, index) => {
            this.renderSource(containerEl, source, index);
        });

        new Setting(containerEl).addButton((button) =>
            button.setButtonText("Add Source").onClick(async () => {
                this.plugin.settings.sources.push(createDefaultSource());
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
            .setName(`Storage Source ${index + 1}`)
            .setHeading();

        new Setting(containerEl)
            .setName("Name")
            .setDesc(
                "Display name. Used as optional prefix in links, e.g. s3:name/objectKey"
            )
            .addText((text) =>
                text
                    .setValue(source.name)
                    .onChange(async (value) => {
                        source.name = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Provider")
            .setDesc(
                "Supported values: aws, tencent-cos, aliyun-oss, s3-compatible"
            )
            .addText((text) =>
                text
                    .setValue(source.provider)
                    .onChange(async (value) => {
                        source.provider = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Endpoint")
            .setDesc(
                "Custom endpoint URL (required for COS/OSS/S3-compatible, leave empty for AWS)"
            )
            .addText((text) =>
                text
                    .setPlaceholder("https://...")
                    .setValue(source.endpoint)
                    .onChange(async (value) => {
                        source.endpoint = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Bucket Name")
            .setDesc("The name of the bucket")
            .addText((text) =>
                text
                    .setValue(source.bucketName)
                    .onChange(async (value) => {
                        source.bucketName = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Region")
            .setDesc(
                "Region identifier, e.g. eu-central-1 or ap-guangzhou (optional for some providers)"
            )
            .addText((text) =>
                text
                    .setValue(source.region)
                    .onChange(async (value) => {
                        source.region = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Access Key ID")
            .setDesc("The Access Key ID of your account")
            .addText((text) =>
                text
                    .setValue(source.accessKeyId)
                    .onChange(async (value) => {
                        source.accessKeyId = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Secret Access Key")
            .setDesc("The Secret Access Key of your account")
            .addText((text) =>
                text
                    .setValue(source.secretAccessKey)
                    .onChange(async (value) => {
                        source.secretAccessKey = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Path-style addressing")
            .setDesc("Enable for most custom/S3-compatible endpoints")
            .addToggle((toggle) =>
                toggle
                    .setValue(source.pathStyle)
                    .onChange(async (value) => {
                        source.pathStyle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Default source")
            .setDesc("Links without a source prefix (s3:objectKey) use this source")
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
            .setName("Enable signed links (s3-sign)")
            .addToggle((toggle) =>
                toggle
                    .setValue(source.signLinkEnabled)
                    .onChange(async (value) => {
                        source.signLinkEnabled = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl).addButton((button) =>
            button
                .setButtonText("Remove Source")
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

