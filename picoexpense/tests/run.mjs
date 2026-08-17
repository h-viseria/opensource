import { runAll } from './suite.js';

const { failed, lines } = await runAll();
for (const line of lines) console.log(line);
if (failed) process.exit(1);
