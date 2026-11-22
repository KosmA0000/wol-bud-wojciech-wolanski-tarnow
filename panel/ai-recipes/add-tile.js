// Zaślepka — do zbudowania (patrz README.md).
export const tools = [];
export async function run(name) {
  return { ok: false, error: `Przepis ${name} nie jest jeszcze zbudowany.` };
}
