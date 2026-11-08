import { program } from 'commander';

program
  .helpOption('--help', 'show usage information')
  .requiredOption('-h, --host <address>', 'address the server listens on')
  .requiredOption('-p, --port <number>', 'port the server listens on')
  .requiredOption('-c, --cache <path>', 'directory for cached images')
  .parse();

const { host, port, cache } = program.opts();

if (!/^\d+$/.test(port) || Number(port) > 65535) {
  program.error(`error: invalid port '${port}': expected an integer from 0 to 65535`);
}

console.log({ host, port: Number(port), cache });
