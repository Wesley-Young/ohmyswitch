import { group } from '#cli/framework/command.ts';
import { applicationCommands } from './apply.ts';
import { harness } from './harness.ts';
import { model } from './model.ts';
import { paths } from './paths.ts';
import { plugin } from './plugin.ts';
import { provider } from './provider.ts';

/** Every command, in the order help and the menu list them. */
export const commands = group({
  name: 'oms',
  summary: 'Manage AI coding harness providers from the terminal (ohmyswitch)',
  children: [provider, model, ...applicationCommands, harness, plugin, paths],
});
