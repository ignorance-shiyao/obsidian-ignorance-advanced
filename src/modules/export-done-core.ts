/* Where an export ended up. Exports return either a vault path ("导出/a.pdf") or an absolute path. */
export interface ExportLocation { absolute: string; inVault: boolean }

const isAbsolute = (path: string) => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path);

export function exportLocation(result: string, vaultBase: string): ExportLocation {
  if (isAbsolute(result)) return { absolute: result, inVault: Boolean(vaultBase) && result.startsWith(`${vaultBase}/`) };
  return { absolute: vaultBase ? `${vaultBase}/${result}` : result, inVault: true };
}

/** The part of a path worth showing: the file name. */
export const exportFileName = (result: string) => result.slice(Math.max(result.lastIndexOf("/"), result.lastIndexOf("\\")) + 1);
