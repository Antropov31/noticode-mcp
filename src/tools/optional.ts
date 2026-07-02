/**
 * Import an optional dependency at runtime.
 *
 * The specifier is hidden behind a dynamic Function so the TypeScript compiler
 * doesn't try to resolve the module (or its types) at build time. Several of
 * these deps are optional/native and may lack type declarations or not be
 * installed at all — this keeps `tsc` green while still failing at runtime with
 * a helpful hint if the package is missing.
 */
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

export async function importOptional(module: string, hint: string): Promise<any> {
  try {
    return await dynamicImport(module);
  } catch {
    throw new Error(`Optional dependency "${module}" is not available. ${hint}`);
  }
}
