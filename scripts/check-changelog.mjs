/** Version entries use prose; reject Chinese bullet lists before release. */
export function changelogProblems(source) {
  const problems = [];
  let version = "", fenced = false;
  source.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const heading = line.match(/^## (Unreleased|\d+\.\d+\.\d+)\s*$/);
    if (heading) version = heading[1];
    else if (/^## /.test(line)) version = "";
    if (version && /^\s*-\s+.*\p{Script=Han}/u.test(line)) problems.push(`${version}:${index + 1}`);
  });
  return problems;
}
