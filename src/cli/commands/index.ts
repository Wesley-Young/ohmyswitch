import { group } from '#cli/framework/command.ts';
import { completion } from '#cli/framework/completion.ts';
import { applicationCommands } from './apply.ts';
import { harness } from './harness.ts';
import { model } from './model.ts';
import { override } from './override.ts';
import { paths } from './paths.ts';
import { plugin } from './plugin.ts';
import { provider } from './provider.ts';

/** Every command, in the order help and the menu list them. */
export const commands = group({
  name: 'oms',
  summary: 'Manage AI coding harness providers from the terminal (ohmyswitch)',
  children: [provider, model, override, ...applicationCommands, harness, plugin, paths, completion],
});
