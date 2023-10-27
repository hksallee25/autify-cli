import { Command, Flags } from "@oclif/core";

import { getWebClient } from "../../../autify/web/getWebClient";

export default class WebApiListCapabilities extends Command {
  static description = "List available Capabilities.";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  static flags = {
    browser: Flags.string({
      description: "browser name to filter",
      required: false,
    }),
    "device-type": Flags.string({
      description: "device_type name to filter",
      required: false,
    }),
    os: Flags.string({ description: "os name to filter", required: false }),
    "project-id": Flags.integer({
      description:
        "For example, 1 for the following URL: https://app.autify.com/projects/1/capabilities",
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(WebApiListCapabilities);
    const { configDir, userAgent } = this.config;
    const client = getWebClient(configDir, userAgent);
    const res = await client.listCapabilities(
      flags["project-id"],
      flags.os,
      flags.browser,
      flags["device-type"]
    );
    console.log(JSON.stringify(res.data, null, 2));
  }
}
