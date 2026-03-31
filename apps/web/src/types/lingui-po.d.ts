declare module "*.po" {
  import { Messages } from "@lingui/core";

  export const messages: Messages;
}