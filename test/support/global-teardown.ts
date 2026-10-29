/** Arrête le conteneur PostgreSQL démarré par le global setup. */
export default async function globalTeardown(): Promise<void> {
  await globalThis.__PG_CONTAINER__?.stop();
  globalThis.__PG_CONTAINER__ = undefined;
}
