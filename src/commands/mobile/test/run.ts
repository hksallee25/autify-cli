import { Args, Command, Flags } from "@oclif/core";
import { CLIError } from "@oclif/errors";
import { get } from "node-emoji";

import { getMobileClient } from "../../../autify/mobile/getMobileClient";
import { getMobileTestResultUrl } from "../../../autify/mobile/getTestResultUrl";
import { parseTestPlanUrl } from "../../../autify/mobile/parseTestPlanUrl";
import MobileBuildUpload from "../build/upload";
import MobileTestWait from "./wait";

export default class MobileTestRun extends Command {
  static args = {
    "test-plan-url": Args.string({
      description:
        "Test plan URL e.g. https://mobile-app.autify.com/projects/<ID>/test_plans/<ID>",
      required: true,
    }),
  };

  static description = "Run a test plan.";

  static examples = [
    "Run a test plan with a build ID:\n<%= config.bin %> <%= command.id %> --build-id CCC https://mobile-app.autify.com/projects/AAA/test_plans/BBB",
    "Run a test plan with a new build file:\n<%= config.bin %> <%= command.id %> --build-path ./my.[app|apk] https://mobile-app.autify.com/projects/AAA/test_plans/BBB",
    "Run and wait a test plan:\n<%= config.bin %> <%= command.id %> --build-id CCC https://mobile-app.autify.com/projects/AAA/test_plans/BBB --wait --timeout 600",
  ];

  static flags = {
    "build-id": Flags.string({
      description: "ID of the already uploaded build.",
      exclusive: ["build-path"],
    }),
    "build-path": Flags.file({
      description: "File path to the iOS app (*.app) or Android app (*.apk).",
      exclusive: ["build-id"],
    }),
    "max-retry-count": Flags.integer({
      default: 0,
      description:
        "Maximum retry count. The command can take up to timeout * (max-retry-count + 1).",
    }),
    timeout: Flags.integer({
      char: "t",
      default: 300,
      description:
        "Timeout seconds when waiting for the finish of the test execution.",
    }),
    verbose: Flags.boolean({
      char: "v",
      default: false,
      description: "Verbose output",
    }),
    wait: Flags.boolean({
      char: "w",
      default: false,
      description: "Wait until the test finishes.",
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(MobileTestRun);
    let buildId = flags["build-id"];
    const buildPath = flags["build-path"];
    const { configDir, userAgent } = this.config;
    const client = getMobileClient(configDir, userAgent);
    const { testPlanId, workspaceId } = parseTestPlanUrl(args["test-plan-url"]);
    if (buildPath) {
      const uploadArgs = ["--workspace-id", workspaceId, buildPath];
      const uploadCommand = new MobileBuildUpload(uploadArgs, this.config);
      const res = await uploadCommand.run();
      buildId = res.buildId;
    }

    const runTestPlanOnce = async () => {
      const res = await client.runTestPlan(testPlanId, {
        // eslint-disable-next-line camelcase
        build_id: buildId,
      });
      if (!res.data.id) throw new CLIError(`Failed to run a test plan.`);
      const testResultUrl = getMobileTestResultUrl(
        configDir,
        workspaceId,
        res.data.id
      );
      this.log(
        `${get("white_check_mark")} Successfully started: ${testResultUrl}`
      );
      return testResultUrl;
    };

    let testResultUrl = await runTestPlanOnce();

    if (flags.wait) {
      const mobileTestWait = async (url: string) => {
        const waitArgs = ["--timeout", flags.timeout.toString(), url];
        if (flags.verbose) waitArgs.push("--verbose");
        try {
          await MobileTestWait.run(waitArgs);
        } catch (error) {
          if ((error as CLIError).oclif.exit === 0) return null;
          return error as Error;
        }

        throw new CLIError(`Unexpected behavior.`);
      };

      const maxRetryCount = flags["max-retry-count"];
      let error: Error | null;
      for await (const [i] of Array.from({
        length: maxRetryCount + 1,
      }).entries()) {
        error = await mobileTestWait(testResultUrl);
        if (error === null) this.exit();
        else if (i === maxRetryCount) throw error;
        else {
          this.log(
            `${get("repeat")} Retrying... (attempt: ${i + 1}/${maxRetryCount})`
          );
          testResultUrl = await runTestPlanOnce();
        }
      }
    } else {
      this.log("To wait for the test result, run the command below:");
      this.log(`${get("computer")} $ autify mobile test wait ${testResultUrl}`);
    }
  }
}
