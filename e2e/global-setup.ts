import setup from '../tests/global-setup';

// Same reset as the Vitest suite: migrate, truncate, load the deterministic seed.
export default async function globalSetup() {
  await setup();
}
